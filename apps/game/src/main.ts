import {
  PLAYER_COLORS,
  type PadState,
  VEHICLES,
  type PauseAction,
  howToHtml,
  VEHICLE_ICONS,
  neutralPad,
  vehicleById,
} from '@epic/shared';
import { type LookName } from './render/look.ts';
import { View } from './render/view.ts';
import {
  GamepadSource,
  type InputSource,
  KeyboardSource,
  PhoneSource,
  connectedGamepads,
  gamepads,
} from './game/input.ts';
import { Net } from './game/net.ts';
import { type PlayerSetup, RaceSession } from './game/session.ts';
import { Showroom } from './game/showroom.ts';
import { TRACKS, trackById } from './game/tracks.ts';
import { itemSkin } from './game/itemSkins.ts';
import { AutoQuality, FpsMeter, LEVELS } from './game/quality.ts';
import { type KartState, SPECIAL_OF } from '@epic/sim';

/**
 * TV host. Flow: lobby (join with phone / Xbox pad / keyboard, pick rides, ready up)
 * -> race -> results -> lobby.
 *
 * URL options (testing and screenshots):
 *   ?quick=1 skip the lobby   ?players=1..4  ?demo=1 (autopilot humans)  ?t=20 (skip ahead)
 *   ?look=retro  ?vehicles=pod,bat,nazgul,mach5  ?laps=3  ?scene=showroom  ?fixed=1
 *   ?fps=1 (frame-rate display)  ?quality=high|low (fixed quality instead of automatic)
 */
const params = new URLSearchParams(location.search);
const view = new View(document.getElementById('stage')!);
view.setLook((params.get('look') as LookName) ?? 'modern');
// Automatic quality: steps resolution, glow and grass down when frames run slow.
const quality = new AutoQuality(
  !params.has('quality'),
  params.get('quality') === 'low' ? LEVELS.length - 1 : 0,
);
const fpsMeter = params.has('fps') && params.get('fps') !== '0' ? new FpsMeter() : null;
function applyQuality(): void {
  view.setQuality(quality.settings);
  session?.world.setGrassDensity(quality.settings.grass);
  showroom?.world.setGrassDensity(quality.settings.grass);
}
const ui = document.getElementById('ui')!;
const keyboard = new KeyboardSource();
// Two players can share one keyboard: arrows + Enter, and WASD + Space.
const kbArrows = new KeyboardSource('arrows');
const kbWasd = new KeyboardSource('wasd');
const net = new Net();
const MAX_HUMANS = 4;

interface Member {
  key: string;
  name: string;
  color: string;
  vehicle: string;
  ready: boolean;
  kind: 'keyboard' | 'gamepad' | 'phone';
  source: InputSource;
  slot?: number;
  connected: boolean;
}

const members: Member[] = [];
let trackId = trackById(params.get('track') ?? 'middleEarth').def.id;
const track = () => trackById(trackId);
function cycleTrack(dir: number): void {
  const i = TRACKS.findIndex((t) => t.def.id === trackId);
  trackId = TRACKS[(i + dir + TRACKS.length) % TRACKS.length]!.def.id;
  members.forEach((m) => (m.ready = false));
  showroom = null;
  toLobby();
}
let state: 'lobby' | 'race' | 'results' = 'lobby';
let session: RaceSession | null = null;
let showroom: Showroom | null = null;
let startAt = 0; // lobby countdown deadline (ms), 0 = not counting
let resultsAt = 0;
const phones = new Map<number, PhoneSource>();

const freeColor = () =>
  PLAYER_COLORS.find((c) => !members.some((m) => m.color === c)) ?? PLAYER_COLORS[0]!;
const memberBySlot = (slot: number) => members.find((m) => m.kind === 'phone' && m.slot === slot);

// ---------------- phones ----------------
net.onJoin = (slot, playerId, name) => {
  let m = members.find((x) => x.key === `phone:${playerId}`);
  const src = phones.get(slot) ?? new PhoneSource(name);
  phones.set(slot, src);
  if (!m) {
    if (members.length >= MAX_HUMANS || state !== 'lobby') {
      net.send(slot, { t: 'welcome', slot, color: '#666', name });
      return; // spectating until the next lobby
    }
    m = {
      key: `phone:${playerId}`,
      name,
      color: freeColor(),
      vehicle: VEHICLES[members.length % 3]!.id,
      ready: false,
      kind: 'phone',
      source: src,
      slot,
      connected: true,
    };
    members.push(m);
  }
  m.slot = slot;
  m.name = name;
  m.connected = true;
  m.source = src;
  net.send(slot, { t: 'welcome', slot, color: m.color, name: m.name });
  if (state === 'race') net.send(slot, { t: 'race' });
  else syncPhone(m);
  renderLobby();
};
net.onLeave = (slot) => {
  const m = memberBySlot(slot);
  if (!m) return;
  m.connected = false;
  // In the lobby a vanished phone just leaves; mid-race its kart goes on autopilot.
  if (state === 'lobby') members.splice(members.indexOf(m), 1);
  renderLobby();
};
net.onInput = (slot, pad) => {
  const src = phones.get(slot);
  src?.receive(pad);
};
net.onMsg = (slot, msg) => {
  const m = memberBySlot(slot);
  if (!m) return;
  if (msg.t === 'pickVehicle' && state === 'lobby' && VEHICLES.some((v) => v.id === msg.vehicle))
    m.vehicle = msg.vehicle;
  if (msg.t === 'ready' && state === 'lobby') m.ready = msg.ready;
  if (msg.t === 'menu' && msg.action === 'confirm' && state === 'results') toLobby();
  if (msg.t === 'pause') pauseAction(msg.action);
  if (
    msg.t === 'menu' &&
    state === 'lobby' &&
    members[0] === m &&
    (msg.action === 'next' || msg.action === 'prev')
  )
    cycleTrack(msg.action === 'next' ? 1 : -1);
  // Only in the lobby: mid-race (pause menu messages) a lobby update would pull the phone
  // off its controller.
  if (state === 'lobby') syncPhone(m);
  renderLobby();
};
function syncPhone(m: Member): void {
  if (m.kind === 'phone' && m.slot !== undefined)
    net.send(m.slot, {
      t: 'lobby',
      vehicle: m.vehicle,
      ready: m.ready,
      vehicles: VEHICLES.map((v) => v.id),
    });
}

// ---------------- local pads (keyboard, Xbox) ----------------
type LocalPad = PadState & { a: boolean; b: boolean; start: boolean; lb: boolean; rb: boolean };
const prevButtons = new Map<string, LocalPad>();
function edges(key: string, now: LocalPad) {
  const prev = prevButtons.get(key);
  prevButtons.set(key, now);
  const was = (k: keyof typeof now) => !!prev && !!prev[k];
  return {
    a: now.a && !was('a'),
    b: now.b && !was('b'),
    start: now.start && !was('start'),
    lb: now.lb && !was('lb'),
    rb: now.rb && !was('rb'),
    left: now.steer < -0.6 && !(prev && prev.steer < -0.6),
    right: now.steer > 0.6 && !(prev && prev.steer > 0.6),
  };
}

// ---------------- how to play ----------------
// A full-screen guide over the lobby: the button, H or Y opens it; H, Y, B or Esc closes it.
const howTo = document.createElement('div');
howTo.className = 'howto-overlay';
howTo.hidden = true;
howTo.innerHTML = `${howToHtml()}<div class="howto-close">Press H, Y or B to close · or click</div>`;
howTo.addEventListener('click', () => toggleHowTo(false));
document.body.appendChild(howTo);
function toggleHowTo(open = howTo.hidden): void {
  howTo.hidden = !open || !(state === 'lobby' || paused);
}

// ---------------- pause ----------------
// Esc / P, Start on a pad, or the phone's pause button. The race freezes; the menu offers
// resume, restart (same players, rides and track), the guide, and exit to the lobby.
let paused = false;
let lastRace: { players: PlayerSetup[]; laps: number } | null = null;
const PAUSE_ITEMS: [string, () => void][] = [
  ['RESUME', () => setPaused(false)],
  ['RESTART RACE', () => restartRace()],
  ['HOW TO PLAY', () => toggleHowTo(true)],
  ['EXIT TO LOBBY', () => exitRace()],
];
let pauseSel = 0;
const pauseEl = document.createElement('div');
pauseEl.className = 'pause-overlay';
pauseEl.hidden = true;
document.body.appendChild(pauseEl);
function renderPause(): void {
  pauseEl.innerHTML = `<div class="pause-menu"><h2>PAUSED</h2>${PAUSE_ITEMS.map(
    ([label], i) =>
      `<div class="pause-item ${i === pauseSel ? 'sel' : ''}" data-i="${i}">${label}</div>`,
  ).join('')}<div class="pause-hint">↑ ↓ choose · A / Enter select · B / Esc resume</div></div>`;
  pauseEl.querySelectorAll<HTMLElement>('.pause-item').forEach((el) => {
    el.onclick = () => PAUSE_ITEMS[Number(el.dataset.i)]![1]();
  });
}
function setPaused(on: boolean): void {
  if (on && (state !== 'race' || !session)) return;
  paused = on;
  if (session) session.paused = on;
  pauseSel = 0;
  pauseEl.hidden = !on;
  if (on) renderPause();
  else howTo.hidden = true;
  for (const m of members)
    if (m.kind === 'phone' && m.slot !== undefined) net.send(m.slot, { t: 'paused', on });
}
function restartRace(): void {
  if (!lastRace) return;
  setPaused(false);
  session?.dispose();
  session = null;
  startRace(lastRace.players, lastRace.laps);
}
function exitRace(): void {
  setPaused(false);
  toLobby();
}
function pauseAction(a: PauseAction): void {
  if (a === 'toggle') setPaused(!paused);
  else if (a === 'resume') setPaused(false);
  else if (paused && a === 'restart') restartRace();
  else if (paused && a === 'exit') exitRace();
}
function movePause(d: number): void {
  pauseSel = (pauseSel + d + PAUSE_ITEMS.length) % PAUSE_ITEMS.length;
  renderPause();
}

// Menu buttons on the Xbox pads: the guide and the pause menu take them first.
const padWas = new Map<number, Record<string, boolean>>();
function pollMenuButtons(): void {
  for (const gp of connectedGamepads()) {
    const raw = gamepads()[gp.index];
    if (!raw) continue;
    const y0 = raw.axes[1] ?? 0;
    const now: Record<string, boolean> = {
      a: !!raw.buttons[0]?.pressed,
      b: !!raw.buttons[1]?.pressed,
      y: !!raw.buttons[3]?.pressed,
      start: !!raw.buttons[9]?.pressed,
      up: !!raw.buttons[12]?.pressed || y0 < -0.6,
      down: !!raw.buttons[13]?.pressed || y0 > 0.6,
    };
    const was = padWas.get(gp.index) ?? now;
    padWas.set(gp.index, now);
    const hit = (k: string) => now[k] && !was[k];
    if (!howTo.hidden) {
      if (hit('y') || hit('b') || hit('start')) toggleHowTo(false);
      continue;
    }
    if (state === 'lobby' && hit('y')) toggleHowTo(true);
    if (state !== 'race') continue;
    if (hit('start')) setPaused(!paused);
    else if (paused) {
      if (hit('up')) movePause(-1);
      if (hit('down')) movePause(1);
      if (hit('a')) PAUSE_ITEMS[pauseSel]![1]();
      else if (hit('b')) setPaused(false);
    }
  }
}

function pollLocal(): void {
  const menuUp = !howTo.hidden || paused;
  pollMenuButtons();
  // While the guide or pause menu is up (and on the press that closes it) lobby buttons don't
  // join, ready or leave behind it.
  if (menuUp) return;
  // Keyboard player 1: Enter joins / readies, arrows change ride, Backspace leaves.
  const kb = {
    ...kbArrows.poll(),
    a: keyboard.has('Enter', 'NumpadEnter'),
    b: keyboard.has('Backspace'),
    start: keyboard.has('Enter'),
    lb: false,
    rb: keyboard.has('KeyT'),
  };
  handleLocal('keyboard', 'keyboard', kb, () => keyboard);
  // Keyboard player 2 on the same keyboard: Space joins / readies, A D change ride, Q leaves.
  const kb2 = {
    ...kbWasd.poll(),
    a: keyboard.has('Space'),
    b: keyboard.has('KeyQ'),
    start: false,
    lb: false,
    rb: false,
  };
  handleLocal('keyboard2', 'keyboard', kb2, () => kbWasd);
  for (const gp of connectedGamepads()) {
    const raw = gamepads()[gp.index];
    if (!raw) continue;
    const src = new GamepadSource(gp.index, gp.id);
    const p = {
      ...src.poll(),
      a: !!raw.buttons[0]?.pressed,
      b: !!raw.buttons[1]?.pressed,
      start: !!raw.buttons[9]?.pressed,
      lb: !!raw.buttons[4]?.pressed,
      rb: !!raw.buttons[5]?.pressed,
    };
    handleLocal(`gamepad:${gp.index}`, 'gamepad', p, () => src);
  }
}

function handleLocal(
  key: string,
  kind: 'keyboard' | 'gamepad',
  p: LocalPad,
  make: () => InputSource,
): void {
  const e = edges(key, p);
  // A short grace period so a drift button held over the line doesn't skip the results.
  if (state === 'results' && (e.a || e.start) && performance.now() - resultsAt > 2500)
    return toLobby();
  if (state !== 'lobby') return;
  if (e.lb || e.rb) return cycleTrack(e.rb ? 1 : -1);
  const m = members.find((x) => x.key === key);
  if (!m) {
    if (e.a && members.length < MAX_HUMANS) {
      members.push({
        key,
        name: kind === 'keyboard' ? 'P' + (members.length + 1) : 'PAD' + (members.length + 1),
        color: freeColor(),
        vehicle: VEHICLES[members.length % 3]!.id,
        ready: false,
        kind,
        source: make(),
        connected: true,
      });
      renderLobby();
    }
    return;
  }
  const ids = VEHICLES.map((v) => v.id);
  if (!m.ready && (e.left || e.right)) {
    m.vehicle = ids[(ids.indexOf(m.vehicle) + (e.right ? 1 : ids.length - 1)) % ids.length]!;
    renderLobby();
  }
  if (e.a) {
    m.ready = !m.ready;
    renderLobby();
  }
  if (e.b) {
    if (m.ready) m.ready = false;
    else members.splice(members.indexOf(m), 1);
    renderLobby();
  }
}

// ---------------- lobby ----------------
function toLobby(): void {
  state = 'lobby';
  session?.dispose();
  session = null;
  startAt = 0;
  members.forEach((m) => (m.ready = false));
  for (let i = members.length - 1; i >= 0; i--) if (!members[i]!.connected) members.splice(i, 1);
  showroom ??= new Showroom(
    view,
    ['pod', 'bat', 'nazgul'],
    [PLAYER_COLORS[0]!, PLAYER_COLORS[1]!, PLAYER_COLORS[2]!],
    0.6,
    18,
    trackId,
  );
  document.getElementById('hud')!.innerHTML = '';
  members.forEach(syncPhone);
  renderLobby();
}

const joinHint = () =>
  net.standalone
    ? 'Press <b>Enter</b> or <b>Space</b><br>or <b>A</b> on a pad'
    : 'Scan the QR code<br>or press <b>A</b> on a pad';

function renderLobby(): void {
  if (state !== 'lobby') return;
  const info = net.info;
  const slots = Array.from({ length: MAX_HUMANS }, (_, i) => {
    const m = members[i];
    if (!m)
      return `<div class="slot empty"><div>${i === members.length ? joinHint() : ''}</div></div>`;
    const v = vehicleById(m.vehicle);
    const tag =
      m.kind === 'phone'
        ? 'PHONE'
        : m.kind === 'gamepad'
          ? 'XBOX'
          : m.key === 'keyboard2'
            ? 'KEYS · WASD'
            : 'KEYS · ARROWS';
    const pick =
      m.kind === 'gamepad'
        ? '◀ ▶ ride · A ready'
        : m.key === 'keyboard2'
          ? 'A / D ride · Space ready'
          : '← → ride · Enter ready';
    return `<div class="slot on ${m.connected ? '' : 'off'}" style="--c:${m.color}">
      <div class="who"><span>${m.name}</span><span class="tag">${tag}</span></div>
      <div class="veh">${VEHICLE_ICONS[v.id] ?? ''}<div class="vn">${v.name}</div></div>
      <div class="state ${m.ready ? 'ready' : ''}">${m.ready ? 'READY!' : m.kind === 'phone' ? 'choosing on phone…' : pick}</div>
    </div>`;
  }).join('');
  const allReady = members.length > 0 && members.every((m) => m.ready);
  if (allReady && !startAt) startAt = performance.now() + 3000;
  if (!allReady) startAt = 0;
  ui.innerHTML = `<div class="lobby">
    <h1>EPIC RACER</h1>
    ${
      net.standalone
        ? `<div class="join couch">
      <div class="room">COUCH MODE</div>
      <div class="alt"><b>Keyboard P1:</b> press Enter · arrows drive · Right Shift drift<br>
      <b>Keyboard P2:</b> press Space · WASD drive · Left Shift drift<br>
      <b>Xbox pads:</b> press A · RT gas · LT brake · RB drift<br><br>
      Phone controllers need the home server (see README).</div>
    </div>`
        : `<div class="join">
      <div class="qr">${info?.qrSvg ?? ''}</div>
      <div class="url">${info ? info.controllerUrl.replace('http://', '') : 'starting server…'}</div>
      <div class="room">ROOM ${info?.room ?? '----'}</div>
      <div class="alt">Phones: scan to get a controller<br>Xbox pads: press A · Keyboard: Enter (arrows) or Space (WASD)</div>
    </div>`
    }
    <div class="slots">${slots}</div>
    <div class="foot"><span class="track">Track: <b>${track().def.name}</b> · ${track().def.laps} laps · ${track().blurb} <i class="hint">(LB/RB or T to change)</i></span><span class="howto-btn" id="howto-btn">? HOW TO PLAY <i class="hint">(H / Y)</i></span><span class="go" id="go">${allReady ? 'Starting…' : members.length ? 'Waiting for everyone to be ready' : ''}</span></div>
  </div>`;
  document.getElementById('howto-btn')!.onclick = () => toggleHowTo(true);
}
net.onInfo = () => renderLobby();

// ---------------- race ----------------
function startRace(players: PlayerSetup[], laps = track().def.laps): void {
  showroom = null;
  state = 'race';
  howTo.hidden = true;
  lastRace = { players, laps };
  ui.innerHTML = '';
  session = new RaceSession(view, track().def, players, laps, 8, track().theme);
  applyQuality();
  session.onFinished = (order) => {
    setPaused(false);
    state = 'results';
    resultsAt = performance.now();
    ui.innerHTML = `<div class="results"><h2>RESULTS</h2>${order
      .map(
        (r, i) =>
          `<div class="row ${r.human ? 'human' : ''}"><span>${i + 1}</span><span><i class="sw" style="background:${r.color}"></i>${r.name} · ${r.vehicle}</span><span>${Number.isNaN(r.time) ? '--' : r.time.toFixed(2) + 's'}</span></div>`,
      )
      .join('')}<div class="hint">Press A / Enter, or tap Continue on your phone</div></div>`;
    order.forEach((r, i) => {
      const m = members.find((x) => x.name === r.name && r.human);
      if (m?.kind === 'phone' && m.slot !== undefined)
        net.send(m.slot, { t: 'results', place: i + 1 });
    });
  };
  for (const m of members)
    if (m.kind === 'phone' && m.slot !== undefined) net.send(m.slot, { t: 'race' });
  (window as unknown as { __epic: unknown }).__epic = { session, view, members, net };
}

function startFromLobby(): void {
  // A lone keyboard player gets every key; two share the keyboard half each.
  const kbPlayers = members.filter((m) => m.kind === 'keyboard').length;
  startRace(
    members.map((m) => ({
      name: m.name,
      color: m.color,
      vehicle: m.vehicle,
      source:
        m.kind === 'keyboard'
          ? new KeyboardSource(kbPlayers > 1 ? (m.key === 'keyboard' ? 'arrows' : 'wasd') : 'all')
          : m.source,
      away:
        m.kind === 'phone'
          ? () => !m.connected || performance.now() - (m.source as PhoneSource).lastSeen > 10000
          : undefined,
    })),
  );
}

let hudTimer = 0;
/** "icon|name" for the phone's ITEM button (a spinning roulette while it rolls). */
function phoneItem(k: KartState): string | null {
  if (k.rollTime > 0) return '🎲|…';
  if (!k.item) return null;
  const skin = itemSkin(track().def.id, k.item, SPECIAL_OF[k.vehicle.id]);
  const n = k.item === 'boost3' && k.itemCount > 1 ? ` ×${k.itemCount}` : '';
  return `${skin.icon}|${skin.name}${n}`;
}

function sendPhoneHud(dt: number): void {
  hudTimer += dt;
  if (hudTimer < 0.1 || !session) return;
  hudTimer = 0;
  members.forEach((m, i) => {
    if (m.kind !== 'phone' || m.slot === undefined) return;
    const k = session!.humanKart(i);
    if (!k) return;
    net.send(m.slot, {
      t: 'hud',
      place: k.place,
      lap: session!.race.lapOf(k),
      laps: session!.race.laps,
      item: phoneItem(k),
      boost: k.boostTime,
    });
  });
}

// ---------------- boot ----------------
if (params.get('scene') === 'showroom') {
  const ids = (params.get('vehicles') ?? 'pod,bat,nazgul').split(',');
  showroom = new Showroom(
    view,
    ids,
    ids.map((_, i) => PLAYER_COLORS[i]!),
    Number(params.get('angle') ?? 0.6),
    Number(params.get('speed') ?? 0),
    trackId,
  );
  showroom.hazardTime = Number(params.get('ht') ?? 0);
  applyQuality();
  (window as unknown as { __epic: unknown }).__epic = { showroom, view };
  if (params.has('s'))
    showroom.spot = {
      s: Number(params.get('s')),
      lat: Number(params.get('lat') ?? 0),
      h: Number(params.get('h') ?? 6),
      look: Number(params.get('ahead') ?? 40),
      lookLat: Number(params.get('lookLat') ?? 0),
    };
  state = 'results'; // inert
} else if (params.has('quick') || params.has('demo')) {
  const pads = connectedGamepads();
  const n = Math.min(4, Math.max(1, Number(params.get('players') ?? 1 + pads.length)));
  const vehicles = (params.get('vehicles') ?? 'pod,bat,nazgul,mach5').split(',');
  const nobody: InputSource = { kind: 'auto', label: 'Autopilot', poll: neutralPad };
  const names = ['REX', 'SAM', 'JO', 'KAI'];
  startRace(
    Array.from({ length: n }, (_, i) => {
      const source: InputSource =
        i === 0
          ? keyboard
          : pads[i - 1]
            ? new GamepadSource(pads[i - 1]!.index, pads[i - 1]!.id)
            : nobody;
      return {
        name: names[i]!,
        color: PLAYER_COLORS[i]!,
        vehicle: vehicles[i % vehicles.length]!,
        source,
        autopilot: params.has('demo') || source === nobody,
      };
    }),
    Number(params.get('laps') ?? track().def.laps),
  );
  const t = Number(params.get('t') ?? 0);
  if (t > 0) session!.fastForward(t);
} else {
  toLobby();
}
net.start();

let last = performance.now();
function loop(now: number): void {
  const real = (now - last) / 1000;
  // ?fixed=1 steps exactly one 60 Hz frame per render (deterministic screenshots on slow machines).
  const dt = params.has('fixed') ? 1 / 60 : Math.min(0.1, real);
  last = now;
  if (quality.frame(real)) applyQuality();
  fpsMeter?.frame(real, quality, () => view.bufferSize);
  pollLocal();
  if (session) {
    session.frame(dt);
    sendPhoneHud(dt);
    if (state === 'results' && now - resultsAt > 20000) toLobby();
  } else if (showroom) {
    showroom.frame(dt, !params.has('fixed'));
    if (state === 'lobby' && startAt && now >= startAt) startFromLobby();
    else if (state === 'lobby' && startAt) {
      const go = document.getElementById('go');
      if (go) go.textContent = `Starting in ${Math.ceil((startAt - now) / 1000)}…`;
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.addEventListener('keydown', (e) => {
  if (e.code === 'F2') view.setLook(view.look === 'modern' ? 'retro' : 'modern');
  if (!howTo.hidden) {
    if (e.code === 'KeyH' || e.code === 'Escape') toggleHowTo(false);
    return;
  }
  if (state === 'lobby' && e.code === 'KeyH') toggleHowTo(true);
  if (state !== 'race') return;
  if (!paused) {
    if (e.code === 'Escape' || e.code === 'KeyP') setPaused(true);
    return;
  }
  if (e.code === 'ArrowUp' || e.code === 'KeyW') movePause(-1);
  else if (e.code === 'ArrowDown' || e.code === 'KeyS') movePause(1);
  else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')
    PAUSE_ITEMS[pauseSel]![1]();
  else if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'Backspace') setPaused(false);
  else if (e.code === 'KeyH') toggleHowTo(true);
});

// Keys only reach the page once it has focus (e.g. when embedded): say so until it does.
const focusHint = document.createElement('div');
focusHint.className = 'focus-hint';
focusHint.textContent = 'Click the game to use the keyboard';
document.body.appendChild(focusHint);
const syncFocus = () => (focusHint.hidden = document.hasFocus());
window.addEventListener('focus', syncFocus);
window.addEventListener('blur', syncFocus);
window.addEventListener('pointerdown', () => {
  window.focus();
  setTimeout(syncFocus, 0);
});
syncFocus();
