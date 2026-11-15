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
import { preloadRigged } from './render/rigged.ts';
import {
  GamepadSource,
  type InputSource,
  KeyboardSource,
  PhoneSource,
  connectedGamepads,
  gamepads,
} from './game/input.ts';
import { Net } from './game/net.ts';
import { type Finisher, type PlayerSetup, RaceSession } from './game/session.ts';
import { LinkRace, type LinkMsg, type RaceSpec, type RosterMember } from './game/link.ts';
import { linkHelpHtml, linkQuality } from './game/linkHelp.ts';
import { Showroom } from './game/showroom.ts';
import { MapTour } from './game/tour.ts';
import { POINTS, Tournament } from './game/tournament.ts';
import {
  MAX_RACERS,
  type RaceSettings,
  SETTING_ROWS,
  loadSettings,
  saveSettings,
} from './game/settings.ts';
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
 *   ?tour=1 (start the map tour of ?track=...)  ?cup=1 (tournament mode on)
 *   ?screen=N (open as 8-Player Local screen N by hand)  ?draw=0 (draw nothing: tests)
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
  tour?.world.setGrassDensity(quality.settings.grass);
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
let trackId = trackById(params.get('track') ?? TRACKS[0]!.def.id).def.id;
const track = () => trackById(trackId);
function cycleTrack(dir: number): void {
  if (following()) return net.sendLink({ t: 'cmd', c: 'track', dir } satisfies LinkMsg, 0);
  const i = TRACKS.findIndex((t) => t.def.id === trackId);
  trackId = TRACKS[(i + dir + TRACKS.length) % TRACKS.length]!.def.id;
  members.forEach((m) => (m.ready = false));
  showroom = null;
  toLobby();
}
let state: 'lobby' | 'race' | 'results' | 'tour' = 'lobby';
let tour: MapTour | null = null;
/** Tournament mode (toggled in the lobby), and the cup being run. */
let cupMode = params.has('cup');
/** Race settings from the lobby (⚙ Settings), remembered between visits. */
const settings: RaceSettings = loadSettings();
/** Laps for the current track under the settings. */
const lapsFor = () => live().laps || track().def.laps;
/** Humans in the next race (at least one, for the counts shown before anyone joins). */
const humansNow = () => Math.max(1, members.length + otherCount());
let cup: Tournament | null = null;
/** The track picked in the lobby, to come back to after a cup. */
let cupHome = '';
let session: RaceSession | null = null;
let showroom: Showroom | null = null;
let startAt = 0; // lobby countdown deadline (ms), 0 = not counting
let resultsAt = 0;
const phones = new Map<number, PhoneSource>();
/** The lobby members racing, by player index (undefined: AI or the other laptop's player). */
let raceMembers: (Member | undefined)[] = [];

/** Each laptop's players take colours from their own half, so 8-Player Local never repeats one. */
const freeColor = () => {
  const mine = net.screen === 0 ? PLAYER_COLORS.slice(0, 4) : PLAYER_COLORS.slice(4);
  return mine.find((c) => !members.some((m) => m.color === c)) ?? mine[0]!;
};
/** Keyboard and pad players are P1-P4 on the main laptop, P5-P8 on the second. */
const nameBase = () => (net.screen === 0 ? 1 : 5);
const memberBySlot = (slot: number) => members.find((m) => m.kind === 'phone' && m.slot === slot);

// ---------------- 8-Player Local ----------------
// Two laptops, one race (see game/link.ts). The main laptop (screen 0, running the server) owns
// the lobby: track, settings, tournament and the start. The second laptop sends it its players
// and its players' requests, and follows its lead.
const link = {
  /** Game screens connected to the server. */
  screens: [] as number[],
  /** Main: the second laptop's players. Second laptop: every laptop's, as main last sent. */
  rosters: new Map<number, RosterMember[]>(),
  /** Second laptop: main has 8-Player Local on and races with this laptop. */
  mainOn: false,
  /** Second laptop: main is already linked with another laptop. */
  full: false,
  /** Second laptop: the main laptop's lobby. */
  lobby: null as Extract<LinkMsg, { t: 'lobby' }> | null,
  race: null as LinkRace | null,
  spec: null as RaceSpec | null,
  /** Main: the screens a new race waits for before the clocks start, and who's ready. */
  waitFor: [] as number[],
  loaded: new Set<number>(),
  goAt: 0,
  nextId: 1 + Math.floor(Math.random() * 200),
  sentRoster: '',
  sentLobby: '',
  rtt: NaN,
  ping: 0,
  pingAt: 0,
  /** A line for the lobby (e.g. "the main laptop left"). */
  notice: '',
};
const isMain = () => net.screen === 0;
/** The laptop this one races with right now (main: the first other one; else main), if any. */
function partner(): number | undefined {
  if (isMain()) return settings.link ? link.screens.find((s) => s !== 0) : undefined;
  return link.mainOn && link.screens.includes(0) ? 0 : undefined;
}
const linked = () => partner() !== undefined;
/** The second laptop, linked: the main laptop decides, this one asks. */
const following = () => linked() && !isMain();
/** The other laptop's players (in the lobby), as [screen, players]. */
const otherRosters = (): [number, RosterMember[]][] =>
  linked() ? [...link.rosters].filter(([s]) => s !== net.screen) : [];
const otherCount = () => otherRosters().reduce((n, [, r]) => n + r.length, 0);
const myRoster = (): RosterMember[] =>
  members.map((m) => ({
    key: m.key,
    name: m.name,
    color: m.color,
    vehicle: m.vehicle,
    ready: m.ready,
    kind: m.kind,
    connected: m.connected,
  }));
/** The settings in force: the main laptop's, on a linked second laptop. */
const live = (): RaceSettings => (following() && link.lobby ? link.lobby.settings : settings);

/** Main: tell each other laptop whether it's the one we race with. */
function sendHello(): void {
  if (!isMain()) return;
  const p = partner();
  for (const s of link.screens) {
    if (s === 0) continue;
    const msg: LinkMsg = { t: 'hello', on: s === p, full: settings.link && s !== p };
    net.sendLink(msg, s);
  }
  link.sentLobby = '';
  sendLobby();
}
/** Main: the lobby as the second laptop should show it (sent when anything changes). */
function sendLobby(): void {
  const p = partner();
  if (!isMain() || p === undefined) return;
  const msg: LinkMsg = {
    t: 'lobby',
    track: trackId,
    cupMode,
    settings,
    rosters: [
      [0, myRoster()],
      [p, link.rosters.get(p) ?? []],
    ],
    starting: startAt ? Math.max(1, Math.ceil((startAt - performance.now()) / 1000)) : 0,
    racing: state !== 'lobby',
  };
  const json = JSON.stringify(msg);
  if (json === link.sentLobby) return;
  link.sentLobby = json;
  net.sendLink(msg, p);
}
/** Second laptop: our players to the main laptop (when they change). */
function sendRoster(): void {
  if (!following()) return;
  const msg: LinkMsg = { t: 'roster', members: myRoster() };
  const json = JSON.stringify(msg);
  if (json === link.sentRoster) return;
  link.sentRoster = json;
  net.sendLink(msg, 0);
}

net.onScreens = (_you, screens) => {
  const before = link.screens;
  const wasLinked = linked();
  link.screens = screens;
  for (const s of before) {
    if (screens.includes(s)) continue;
    // A laptop left: its players finish this race on autopilot, and leave the lobby.
    link.rosters.delete(s);
    link.race?.screenLeft(s);
    link.waitFor = link.waitFor.filter((w) => w !== s);
    if (s === 0 && !isMain()) {
      link.mainOn = false;
      if (state !== 'lobby' && link.spec) {
        link.notice = 'The main laptop left the race.';
        endCup();
        toLobby();
      }
    }
  }
  if (!isMain() && !screens.includes(0)) link.mainOn = false;
  if (isMain()) {
    sendHello();
    maybeGo();
  }
  if (linked() !== wasLinked) link.sentRoster = '';
  sendRoster();
  renderLobby();
};
net.onLinkFrame = (bytes) => link.race?.onFrame(bytes);
net.onLink = (from, raw) => {
  const msg = raw as LinkMsg;
  switch (msg.t) {
    case 'ping':
      return net.sendLink({ t: 'pong', n: msg.n } satisfies LinkMsg, from);
    case 'pong':
      if (msg.n === link.ping) link.rtt = performance.now() - link.pingAt;
      return;
    // ----- on the second laptop, from the main one -----
    case 'hello':
      if (from !== 0 || isMain()) return;
      link.mainOn = msg.on;
      link.full = !!msg.full;
      if (!msg.on) link.lobby = null;
      link.sentRoster = '';
      if (!msg.on && state === 'lobby') members.forEach((m) => (m.ready = false));
      sendRoster();
      return renderLobby();
    case 'lobby':
      if (from !== 0 || isMain()) return;
      link.lobby = msg;
      link.rosters = new Map(msg.rosters);
      cupMode = msg.cupMode;
      if (state === 'lobby' && msg.track !== trackId) {
        trackId = msg.track;
        showroom = null;
        toLobby();
      }
      return renderLobby();
    case 'start':
      if (from === 0 && following()) startLinkedRace(msg.spec);
      return;
    case 'go':
      if (from === 0 && session && link.spec?.id === msg.id) session.waiting = false;
      return;
    case 'paused':
      if (from === 0 && link.spec?.id === msg.id) setPaused(msg.on, true);
      return;
    case 'toLobby':
      if (from === 0 && following()) {
        endCup();
        toLobby();
      }
      return;
    // ----- on the main laptop, from the second one -----
    case 'roster':
      if (!isMain() || from !== partner()) return;
      link.rosters.set(from, msg.members);
      return renderLobby();
    case 'cmd':
      if (!isMain() || from !== partner()) return;
      if (msg.c === 'track' && state === 'lobby') cycleTrack(msg.dir);
      else if (msg.c === 'cup') toggleCup();
      else if (msg.c === 'pause') pauseAction(msg.action);
      else if (msg.c === 'continue') afterResults();
      return;
    case 'loaded':
      if (isMain() && link.spec?.id === msg.id) {
        link.loaded.add(from);
        maybeGo();
      }
      return;
    default:
      link.race?.onMsg(from, msg);
  }
};

/** Main: start both race clocks once every laptop in the race has built it. */
function maybeGo(): void {
  if (!isMain() || !session?.waiting || !link.spec) return;
  const all = link.waitFor.every((s) => link.loaded.has(s) || !link.screens.includes(s));
  // (A laptop that never answers holds the start for 30 seconds at most.)
  if (!all && performance.now() < link.goAt) return;
  net.sendLink({ t: 'go', id: link.spec.id } satisfies LinkMsg);
  session.waiting = false;
}

/** Stands in for a player on the other laptop (their inputs come over the network). */
const OTHER_LAPTOP: InputSource = { kind: 'auto', label: 'Other laptop', poll: neutralPad };

/** Main: a new race spec from the lobby (or the last race's players, for a restart). */
function makeSpec(humans: RaceSpec['humans']): RaceSpec {
  const total = humans.length + Math.min(settings.ai, Math.max(0, MAX_RACERS - humans.length));
  link.nextId = (link.nextId + 1) % 250;
  return {
    id: link.nextId,
    track: trackId,
    laps: lapsFor(),
    total,
    level: settings.level,
    humans,
    cup: cup ? { start: cupHome, races: settings.cupRaces, race: cup.race } : null,
  };
}

/** Main: everyone in the lobby on both laptops, names made unique (results go by name). */
function lobbyHumans(): RaceSpec['humans'] {
  const p = partner()!;
  const all = [
    ...members.map((m) => ({ m: m as RosterMember, screen: 0 })),
    ...(link.rosters.get(p) ?? []).map((m) => ({ m, screen: p })),
  ];
  const used = new Set<string>();
  return all.map(({ m, screen }) => {
    let name = m.name;
    for (let n = 2; used.has(name); n++) name = `${m.name.slice(0, 10)}${n}`;
    used.add(name);
    return { name, color: m.color, vehicle: m.vehicle, screen, key: m.key };
  });
}

/** Main: send a race to the other laptop and start it here. */
function startLinked(spec: RaceSpec): void {
  net.sendLink({ t: 'start', spec } satisfies LinkMsg, partner());
  startLinkedRace(spec);
}

/** Build a linked race on this laptop; its clock starts when the main laptop says go. */
function startLinkedRace(spec: RaceSpec): void {
  link.spec = spec;
  link.notice = '';
  if (!isMain()) {
    trackId = spec.track;
    if (spec.cup) {
      if (!cup || cup.tracks[0] !== spec.cup.start) {
        cup = new Tournament(spec.cup.start, spec.cup.races);
        cupHome = spec.cup.start;
      }
      cup.race = spec.cup.race;
    } else cup = null;
  }
  if (tour) {
    tour.dispose();
    tour = null;
  }
  setPaused(false, true);
  session?.dispose();
  session = null;
  const kbPlayers = members.filter((m) => m.kind === 'keyboard').length;
  const players: PlayerSetup[] = spec.humans.map((h) => {
    const base = { name: h.name, color: h.color, vehicle: h.vehicle };
    if (h.screen !== net.screen) return { ...base, source: OTHER_LAPTOP, local: false };
    const m = members.find((x) => x.key === h.key);
    // Gone since the lobby: the autopilot drives their kart.
    if (!m) return { ...base, source: OTHER_LAPTOP, away: () => true };
    return { ...base, source: sourceFor(m, kbPlayers), away: awayFor(m) };
  });
  const lr = new LinkRace(spec, net, net.screen);
  link.race = lr;
  raceMembers = spec.humans.map((h) =>
    h.screen === net.screen ? members.find((x) => x.key === h.key) : undefined,
  );
  startRace(players, spec.laps, { total: spec.total, level: spec.level, link: lr });
  lr.attach(session!.net!);
  session!.waiting = true;
  if (isMain()) {
    const p = partner();
    link.waitFor = p === undefined ? [] : [p];
    link.loaded.clear();
    link.goAt = performance.now() + 30000;
    maybeGo();
  } else net.sendLink({ t: 'loaded', id: spec.id } satisfies LinkMsg, 0);
}

/** A keyboard player's keys: all of them alone, or half each when two share it. */
function sourceFor(m: Member, kbPlayers: number): InputSource {
  if (m.kind !== 'keyboard') return m.source;
  return new KeyboardSource(kbPlayers > 1 ? (m.key === 'keyboard' ? 'arrows' : 'wasd') : 'all');
}
/** A phone counts as away (autopilot) after 10 s without a word. */
function awayFor(m: Member): (() => boolean) | undefined {
  return m.kind === 'phone'
    ? () => !m.connected || performance.now() - (m.source as PhoneSource).lastSeen > 10000
    : undefined;
}

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
  if (msg.t === 'menu' && msg.action === 'confirm' && state === 'results') afterResults();
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
  ['RESUME', () => pauseAction('resume')],
  ['RESTART RACE', () => pauseAction('restart')],
  ['HOW TO PLAY', () => toggleHowTo(true)],
  ['EXIT TO LOBBY', () => pauseAction('exit')],
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
/** `fromMain`: the main laptop said so (8-Player Local: pausing is shared). */
function setPaused(on: boolean, fromMain = false): void {
  if (on && (state !== 'race' || !session)) return;
  if (following() && !fromMain && link.spec) return;
  if (isMain() && link.spec && paused !== on)
    net.sendLink({ t: 'paused', id: link.spec.id, on } satisfies LinkMsg, partner());
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
  if (link.spec && isMain()) {
    if (partner() === undefined) return exitRace();
    setPaused(false);
    return startLinked(makeSpec(link.spec.humans));
  }
  if (!lastRace) return;
  setPaused(false);
  session?.dispose();
  session = null;
  startRace(lastRace.players, lastRace.laps);
}
function exitRace(): void {
  setPaused(false);
  if (link.spec && isMain()) net.sendLink({ t: 'toLobby' } satisfies LinkMsg, partner());
  endCup();
  toLobby();
}
function pauseAction(a: PauseAction): void {
  // On the second laptop in a linked race, the main laptop does it (for both).
  if (following() && link.spec)
    return net.sendLink({ t: 'cmd', c: 'pause', action: a } satisfies LinkMsg, 0);
  if (a === 'toggle') setPaused(!paused);
  else if (a === 'resume') setPaused(false);
  else if (paused && a === 'restart') restartRace();
  else if (paused && a === 'exit') exitRace();
}
function movePause(d: number): void {
  pauseSel = (pauseSel + d + PAUSE_ITEMS.length) % PAUSE_ITEMS.length;
  renderPause();
}

// ---------------- settings ----------------
// ⚙ Settings in the lobby (O, Menu on a pad, or the button): AI racers and their skill, laps,
// tournament length. ↑ ↓ choose, ← → change, Enter / A / Esc / B close.
const settingsEl = document.createElement('div');
settingsEl.className = 'pause-overlay settings-overlay';
settingsEl.hidden = true;
document.body.appendChild(settingsEl);
// A click outside the panel closes it too.
settingsEl.addEventListener('click', (e) => {
  if (e.target === settingsEl) toggleSettings(false);
});
let settingsSel = 0;
/** The 8-Player Local row reads differently on the second laptop (main switches it). */
function rowText(r: (typeof SETTING_ROWS)[number], h: number): [string, string] {
  if (r.key === 'link' && !isMain())
    return [
      linked() ? 'On' : 'Off',
      link.full
        ? 'The main laptop is already racing with another laptop.'
        : 'This is the second laptop: 8-Player Local is switched on at the main laptop. Press I or Y for how it works.',
    ];
  return [r.value(live(), h), r.note(live(), h)];
}
function renderSettings(): void {
  const h = humansNow();
  const ro = following();
  settingsEl.innerHTML = `<div class="pause-menu settings-menu"><h2>RACE SETTINGS</h2>${
    ro ? '<div class="set-readonly">Set on the main laptop (8-Player Local)</div>' : ''
  }${SETTING_ROWS.map((r, i) => {
    const [value, note] = rowText(r, h);
    return `<div class="set-row ${i === settingsSel ? 'sel' : ''} ${r.key === 'link' ? 'set-link' : ''}" data-i="${i}"><span class="set-label">${r.label}</span><span class="set-val"><b data-d="-1">◀</b><span>${value}</span><b data-d="1">▶</b></span><div class="set-note">${note}</div></div>`;
  }).join(
    '',
  )}<div class="set-buttons"><div class="set-done set-info" id="set-info">ⓘ HOW 8-PLAYER LOCAL WORKS <i>I / Y</i></div><div class="set-done" id="set-done">DONE</div></div><div class="pause-hint">${
    ro
      ? 'Enter / A / Esc / B close'
      : '↑ ↓ choose · ← → change · Enter / A / Esc / B done · saved for next time'
  }</div></div>`;
  document.getElementById('set-done')!.onclick = () => toggleSettings(false);
  document.getElementById('set-info')!.onclick = () => toggleLinkHelp(true);
  settingsEl.querySelectorAll<HTMLElement>('.set-row').forEach((row) => {
    row.onclick = () => {
      settingsSel = Number(row.dataset.i);
      renderSettings();
    };
    row.querySelectorAll<HTMLElement>('b[data-d]').forEach((b) => {
      b.onclick = (ev) => {
        ev.stopPropagation();
        settingsSel = Number(row.dataset.i);
        changeSetting(Number(b.dataset.d));
      };
    });
  });
}
function changeSetting(dir: number): void {
  const row = SETTING_ROWS[settingsSel]!;
  // The second laptop follows the main one's settings (and never switches the link itself).
  if (following() || (row.key === 'link' && !isMain())) return;
  row.step(settings, dir);
  saveSettings(settings);
  if (row.key === 'link') {
    link.rosters.clear();
    sendHello();
  }
  renderSettings();
  renderLobby();
}
function toggleSettings(open = settingsEl.hidden): void {
  if (open && state !== 'lobby') return;
  settingsEl.hidden = !open;
  if (open) {
    members.forEach((m) => (m.ready = false));
    renderSettings();
  }
  renderLobby();
}
function moveSettings(d: number): void {
  settingsSel = (settingsSel + d + SETTING_ROWS.length) % SETTING_ROWS.length;
  renderSettings();
}

// ---------------- how 8-Player Local works ----------------
// From ⚙ Settings (I, or Y on a pad, or the button) and the lobby's 8-Player Local panel.
const linkHelp = document.createElement('div');
linkHelp.className = 'howto-overlay link-help-overlay';
linkHelp.hidden = true;
linkHelp.addEventListener('click', () => toggleLinkHelp(false));
document.body.appendChild(linkHelp);
function toggleLinkHelp(open = linkHelp.hidden): void {
  linkHelp.hidden = !open || !(state === 'lobby' || paused);
  if (!linkHelp.hidden) renderLinkHelp();
}
function renderLinkHelp(): void {
  linkHelp.innerHTML = `${linkHelpHtml(net.info, {
    screen: net.screen,
    on: isMain() ? settings.link : link.mainOn,
    linked: linked(),
    rtt: link.rtt,
  })}<div class="howto-close">Press I, Y or B to close · or click</div>`;
}

// Menu buttons on the Xbox pads: the guide and the pause menu take them first.
const padWas = new Map<number, Record<string, boolean>>();
function pollMenuButtons(): void {
  for (const gp of connectedGamepads()) {
    const raw = gamepads()[gp.index];
    if (!raw) continue;
    const y0 = raw.axes[1] ?? 0,
      x0 = raw.axes[0] ?? 0;
    const now: Record<string, boolean> = {
      left: !!raw.buttons[14]?.pressed || x0 < -0.6,
      right: !!raw.buttons[15]?.pressed || x0 > 0.6,
      a: !!raw.buttons[0]?.pressed,
      b: !!raw.buttons[1]?.pressed,
      x: !!raw.buttons[2]?.pressed,
      view: !!raw.buttons[8]?.pressed,
      y: !!raw.buttons[3]?.pressed,
      start: !!raw.buttons[9]?.pressed,
      up: !!raw.buttons[12]?.pressed || y0 < -0.6,
      down: !!raw.buttons[13]?.pressed || y0 > 0.6,
    };
    const was = padWas.get(gp.index) ?? now;
    padWas.set(gp.index, now);
    const hit = (k: string) => now[k] && !was[k];
    if (!linkHelp.hidden) {
      if (hit('y') || hit('b') || hit('start')) toggleLinkHelp(false);
      continue;
    }
    if (!howTo.hidden) {
      if (hit('y') || hit('b') || hit('start')) toggleHowTo(false);
      continue;
    }
    if (!settingsEl.hidden) {
      if (hit('up')) moveSettings(-1);
      if (hit('down')) moveSettings(1);
      if (hit('left')) changeSetting(-1);
      if (hit('right')) changeSetting(1);
      if (hit('y')) toggleLinkHelp(true);
      else if (hit('a') || hit('b') || hit('start')) toggleSettings(false);
      continue;
    }
    if (state === 'lobby' && hit('start')) toggleSettings(true);
    if (state === 'lobby' && hit('y')) toggleHowTo(true);
    if (state === 'lobby' && hit('x')) startTour();
    if (state === 'lobby' && hit('view')) toggleCup();
    if (state === 'tour' && (hit('b') || hit('start') || hit('x'))) endTour();
    if (state !== 'race') continue;
    if (hit('start')) pauseAction('toggle');
    else if (paused) {
      if (hit('up')) movePause(-1);
      if (hit('down')) movePause(1);
      if (hit('a')) PAUSE_ITEMS[pauseSel]![1]();
      else if (hit('b')) pauseAction('resume');
    }
  }
}

function pollLocal(): void {
  const menus = () => !howTo.hidden || paused || !settingsEl.hidden || !linkHelp.hidden;
  const menuUp = menus();
  pollMenuButtons();
  // While the guide, settings or pause menu is up (and on the press that closes it) lobby buttons
  // don't join, ready or leave behind it; their states are still tracked, so the key that
  // closed the menu doesn't count as a fresh press afterwards.
  const act = !menuUp && !menus();
  // Keyboard player 1: Enter joins / readies, arrows change ride, Backspace leaves.
  const kb = {
    ...kbArrows.poll(),
    a: keyboard.has('Enter', 'NumpadEnter'),
    b: keyboard.has('Backspace'),
    start: keyboard.has('Enter'),
    lb: false,
    rb: keyboard.has('KeyT'),
  };
  handleLocal('keyboard', 'keyboard', kb, () => keyboard, act);
  // Keyboard player 2 on the same keyboard: Space joins / readies, A D change ride, Q leaves.
  const kb2 = {
    ...kbWasd.poll(),
    a: keyboard.has('Space'),
    b: keyboard.has('KeyQ'),
    start: false,
    lb: false,
    rb: false,
  };
  handleLocal('keyboard2', 'keyboard', kb2, () => kbWasd, act);
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
    handleLocal(`gamepad:${gp.index}`, 'gamepad', p, () => src, act);
  }
}

function handleLocal(
  key: string,
  kind: 'keyboard' | 'gamepad',
  p: LocalPad,
  make: () => InputSource,
  act = true,
): void {
  const e = edges(key, p);
  if (!act) return;
  // A short grace period so a drift button held over the line doesn't skip the results.
  if (state === 'results' && (e.a || e.start) && performance.now() - resultsAt > 2500)
    return afterResults();
  if (state !== 'lobby') return;
  if (e.lb || e.rb) return cycleTrack(e.rb ? 1 : -1);
  const m = members.find((x) => x.key === key);
  if (!m) {
    if (e.a && members.length < MAX_HUMANS) {
      members.push({
        key,
        name: (kind === 'keyboard' ? 'P' : 'PAD') + (members.length + nameBase()),
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

// ---------------- map tour ----------------
// From the lobby (M, X on a pad, or the button): a drone fly-by of the selected track's map.
function startTour(): void {
  if (state !== 'lobby' || tour) return;
  startAt = 0;
  members.forEach((m) => (m.ready = false));
  members.forEach(syncPhone);
  state = 'tour';
  howTo.hidden = true;
  ui.innerHTML = `<div class="tour-hud">
    <div class="tour-title">MAP TOUR · <b>${track().def.name}</b></div>
    <div class="tour-caption" id="tour-caption"></div>
    <div class="tour-foot"><div class="tour-bar"><i id="tour-bar"></i></div>
    <span class="tour-exit" id="tour-exit">B / Esc to return to the lobby</span></div>
  </div>`;
  document.getElementById('tour-exit')!.onclick = () => endTour();
  // Fly through the lobby's own world of this track (it's already built).
  tour = new MapTour(view, track(), showroom?.world);
  applyQuality();
  (window as unknown as { __epic: unknown }).__epic = { tour, view };
}
let tourCaption = '';
function tourHud(): void {
  if (!tour) return;
  const bar = document.getElementById('tour-bar');
  if (bar) bar.style.width = `${(tour.progress * 100).toFixed(1)}%`;
  if (tour.caption !== tourCaption) {
    tourCaption = tour.caption;
    const el = document.getElementById('tour-caption');
    if (el) {
      el.classList.remove('show');
      el.textContent = tourCaption;
      // Restart the fade-in for the new name.
      void el.offsetWidth;
      if (tourCaption) el.classList.add('show');
    }
  }
}
function endTour(): void {
  if (!tour) return;
  tour.dispose();
  tour = null;
  tourCaption = '';
  toLobby();
}

// ---------------- tournament ----------------
function toggleCup(): void {
  if (state !== 'lobby') return;
  if (following()) return net.sendLink({ t: 'cmd', c: 'cup' } satisfies LinkMsg, 0);
  cupMode = !cupMode;
  members.forEach((m) => (m.ready = false));
  renderLobby();
}
/** Leave the cup (finished or abandoned): back to the track picked in the lobby. */
function endCup(): void {
  if (!cup) return;
  cup = null;
  trackId = cupHome;
}
/** On from the results: the cup's next race, or back to the lobby. */
function afterResults(): void {
  if (state !== 'results') return;
  if (following() && link.spec)
    return net.sendLink({ t: 'cmd', c: 'continue' } satisfies LinkMsg, 0);
  if (link.spec && isMain()) {
    if (cup && !cup.last && partner() !== undefined) {
      cup.next();
      trackId = cup.trackId;
      return startLinked(makeSpec(link.spec.humans));
    }
    net.sendLink({ t: 'toLobby' } satisfies LinkMsg, partner());
    endCup();
    return toLobby();
  }
  if (cup && !cup.last && lastRace) {
    cup.next();
    trackId = cup.trackId;
    session?.dispose();
    session = null;
    startRace(lastRace.players);
    return;
  }
  endCup();
  toLobby();
}

// ---------------- lobby ----------------
function toLobby(): void {
  state = 'lobby';
  session?.dispose();
  session = null;
  link.race = null;
  link.spec = null;
  raceMembers = [];
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
  (window as unknown as { __epic: unknown }).__epic = { view, net, link, members, showroom };
}

const joinHint = () =>
  net.standalone
    ? 'Press <b>Enter</b> or <b>Space</b><br>or <b>A</b> on a pad'
    : 'Scan the QR code<br>or press <b>A</b> on a pad';

/** One player's card in the lobby (`remote`: on the other laptop, shown but not driven here). */
function slotHtml(m: RosterMember | undefined, i: number, count: number, remote: boolean): string {
  if (!m)
    return `<div class="slot empty"><div>${!remote && i === count ? joinHint() : ''}</div></div>`;
  {
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
      <div class="state ${m.ready ? 'ready' : ''}">${m.ready ? 'READY!' : m.kind === 'phone' ? 'choosing on phone…' : remote ? 'choosing…' : pick}</div>
    </div>`;
  }
}

/** The 8-Player Local box under the QR code: how to link up, or how the link is doing. */
function linkPanel(): string {
  const p = partner();
  const help = '<i class="hint">ⓘ how it works: Settings → I</i>';
  if (p !== undefined)
    return `<div class="link-box on"><b>8-PLAYER LOCAL</b> · linked with laptop ${isMain() ? p + 1 : 1}<br>${linkQuality(link.rtt)}</div>`;
  if (isMain()) {
    if (settings.link) {
      const u = net.info?.screenUrls?.[0];
      const url = u ? (u.secure ?? u.plain).replace(/\/$/, '') : 'this laptop’s address';
      return `<div class="link-box"><b>8-PLAYER LOCAL</b> · waiting for the second laptop.<br>On it, open <b class="mono">${url}</b><br>${help}</div>`;
    }
    if (link.screens.some((s) => s !== 0))
      return `<div class="link-box"><b>Another laptop</b> has the game open. Turn on 8-Player Local in ⚙ Settings to race together.</div>`;
    return '';
  }
  return `<div class="link-box">This is <b>laptop ${net.screen + 1}</b>. ${
    link.full
      ? 'The main laptop is already racing with another one, so this one runs its own races.'
      : link.screens.includes(0)
        ? 'To race together, turn on <b>8-Player Local</b> in ⚙ Settings on the main laptop. Until then this one runs its own races.'
        : 'The main laptop isn’t connected: this one runs its own races.'
  }${link.notice ? `<br><b>${link.notice}</b>` : ''}</div>`;
}

function renderLobby(): void {
  if (state !== 'lobby') return;
  const info = net.info;
  const mine = myRoster();
  const others = otherRosters();
  let slots: string;
  if (others.length || (isMain() && settings.link && linked())) {
    // 8-Player Local: both laptops' players, main laptop's on top.
    const groups: [number, RosterMember[]][] = [
      [net.screen, mine] as [number, RosterMember[]],
      ...others,
    ].sort((a, b) => a[0] - b[0]);
    slots = groups
      .map(([screen, roster]) => {
        const me = screen === net.screen;
        const label = `LAPTOP ${screen + 1}${me ? '<i>this one</i>' : ''}`;
        return `<div class="laptop-label ${me ? 'me' : ''}">${label}</div>${Array.from(
          { length: MAX_HUMANS },
          (_, i) => slotHtml(roster[i], i, roster.length, !me),
        ).join('')}`;
      })
      .join('');
  } else
    slots = Array.from({ length: MAX_HUMANS }, (_, i) =>
      slotHtml(mine[i], i, mine.length, false),
    ).join('');
  const everyone = [...mine, ...others.flatMap(([, r]) => r)];
  const allReady = everyone.length > 0 && everyone.every((m) => m.ready);
  // The main laptop starts linked races; the second one just shows its countdown.
  if (following()) startAt = 0;
  else if (allReady && !startAt) startAt = performance.now() + 3000;
  if (!allReady) startAt = 0;
  const lob = following() ? link.lobby : null;
  const goText = lob?.racing
    ? 'A race is on: you’ll join the next one'
    : lob?.starting
      ? `Starting in ${lob.starting}…`
      : allReady
        ? 'Starting…'
        : everyone.length
          ? 'Waiting for everyone to be ready'
          : '';
  const linkedSlots = slots.includes('laptop-label');
  ui.innerHTML = `<div class="lobby">
    <div class="top"><h1>EPIC RACER</h1><div class="actions"><span class="lb-btn" id="set-btn">⚙ SETTINGS <i class="hint">O / Menu</i></span><span class="lb-btn cup-btn ${cupMode ? 'on' : ''}" id="cup-btn">🏆 TOURNAMENT ${cupMode ? 'ON' : 'OFF'} <i class="hint">G / View</i></span><span class="lb-btn" id="tour-btn">🎥 MAP TOUR <i class="hint">M / X</i></span><span class="lb-btn" id="howto-btn">? HOW TO PLAY <i class="hint">H / Y</i></span></div></div>
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
      <div class="url">${info ? info.controllerUrl.replace(/^https?:\/\//, '').replace(/\?s=0$/, '') : 'starting server…'}</div>
      <div class="room">ROOM ${info?.room ?? '----'}</div>
      <div class="alt">Phones: scan to get a controller<br>Xbox pads: press A · Keyboard: Enter (arrows) or Space (WASD)</div>
      ${linkPanel()}
    </div>`
    }
    <div class="slots ${linkedSlots ? 'eight' : ''}">${slots}</div>
    ${modeInfo()}
    <div class="foot"><span class="track">${
      cupMode
        ? `First track: <b>${track().def.name}</b> <i class="hint">(LB/RB or T to change)</i>`
        : `Track: <b>${track().def.name}</b> · ${track().blurb} <i class="hint">(LB/RB or T to change)</i>`
    }</span><span class="go" id="go">${goText}</span></div>
  </div>`;
  sendRoster();
  sendLobby();
  document.getElementById('howto-btn')!.onclick = () => toggleHowTo(true);
  document.getElementById('tour-btn')!.onclick = () => startTour();
  document.getElementById('cup-btn')!.onclick = () => toggleCup();
  document.getElementById('set-btn')!.onclick = () => toggleSettings(true);
}

/** The line (or, in a tournament, the card) saying what the next start will be. */
function modeInfo(): string {
  const h = humansNow();
  const settings = live();
  const ai = Math.min(settings.ai, MAX_RACERS - h);
  const skill = SETTING_ROWS.find((r) => r.key === 'level')!.value(settings, h);
  const field = ai ? `${ai} AI racer${ai > 1 ? 's' : ''} (${skill})` : 'no AI racers';
  if (!cupMode)
    return `<div class="mode-info single"><b>Single race</b> · ${lapsFor()} laps · ${field} <i>· change in ⚙ Settings (O / Menu) · or turn on 🏆 Tournament (G / View) to race every track for points</i></div>`;
  const C = new Tournament(trackId, settings.cupRaces);
  const pts = POINTS.slice(0, h + ai)
    .map((p, i) => `${i + 1}${['st', 'nd', 'rd'][i] ?? 'th'} ${p}`)
    .join(' · ');
  return `<div class="mode-info cup-card">
    <div class="cup-head">🏆 <b>TOURNAMENT</b> · ${C.tracks.length} races in a row, the same racers in each · ${lapsText()} · ${field}</div>
    <div class="cup-route">${C.tracks.map((id, i) => `<span>${i + 1}. ${trackById(id).def.name}</span>`).join('<i>›</i>')}</div>
    <div class="cup-rules">Points each race: ${pts}. Standings after every race; most points after the last race wins the cup (ties: most wins). Exit in the pause menu ends it.</div>
    <div class="cup-change">⚙ Settings: number of races, laps, AI racers and skill · LB/RB or T: first track · G / View: tournament off</div>
  </div>`;
}

/** Laps for the line under the slots: one number, or "each track's own". */
function lapsText(): string {
  return live().laps ? `${settings.laps} laps a race` : "each track's own laps";
}
net.onInfo = () => renderLobby();

// ---------------- race ----------------
function startRace(
  players: PlayerSetup[],
  laps = lapsFor(),
  /** 8-Player Local: the racer count and AI skill come from the main laptop. */
  opts: { total?: number; level?: number; link?: LinkRace } = {},
): void {
  showroom = null;
  state = 'race';
  howTo.hidden = true;
  linkHelp.hidden = true;
  lastRace = { players, laps };
  ui.innerHTML = '';
  if (!opts.link) raceMembers = [];
  const total =
    opts.total ?? players.length + Math.min(settings.ai, Math.max(0, MAX_RACERS - players.length));
  session = new RaceSession(
    view,
    track().def,
    players,
    laps,
    total,
    track().theme,
    opts.level ?? settings.level,
    opts.link,
  );
  applyQuality();
  session.onFinished = (order: Finisher[]) => {
    setPaused(false, true);
    state = 'results';
    resultsAt = performance.now();
    if (cup) {
      cup.score(order);
      ui.innerHTML = cup.html(
        order,
        (id) => trackById(id).def.name,
        cup.last
          ? 'Press A / Enter, or tap Continue on your phone, to return to the lobby'
          : `Next race: <b>${trackById(cup.tracks[cup.race + 1]!).def.name}</b> · press A / Enter, or tap Continue on your phone`,
      );
    } else
      ui.innerHTML = `<div class="results"><h2>RESULTS</h2>${order
        .map(
          (r, i) =>
            `<div class="row ${r.human ? 'human' : ''}"><span>${i + 1}</span><span><i class="sw" style="background:${r.color}"></i>${r.name} · ${r.vehicle}</span><span>${Number.isNaN(r.time) ? '--' : r.time.toFixed(2) + 's'}</span></div>`,
        )
        .join('')}<div class="hint">Press A / Enter, or tap Continue on your phone</div></div>`;
    order.forEach((r, i) => {
      const m = r.player >= 0 ? raceMembers[r.player] : undefined;
      if (m?.kind === 'phone' && m.slot !== undefined)
        net.send(m.slot, { t: 'results', place: i + 1 });
    });
  };
  for (const m of members)
    if (m.kind === 'phone' && m.slot !== undefined) net.send(m.slot, { t: 'race' });
  (window as unknown as { __epic: unknown }).__epic = {
    session,
    view,
    members,
    net,
    cup,
    afterResults,
    link,
  };
}

function startFromLobby(): void {
  if (following()) return; // the main laptop starts linked races
  if (cupMode) {
    cup = new Tournament(trackId, settings.cupRaces);
    cupHome = trackId;
    trackId = cup.trackId;
  }
  if (linked()) return startLinked(makeSpec(lobbyHumans()));
  // A lone keyboard player gets every key; two share the keyboard half each.
  const kbPlayers = members.filter((m) => m.kind === 'keyboard').length;
  const racing = [...members];
  startRace(
    racing.map((m) => ({
      name: m.name,
      color: m.color,
      vehicle: m.vehicle,
      source: sourceFor(m, kbPlayers),
      away: awayFor(m),
    })),
  );
  raceMembers = racing;
}

let hudTimer = 0;
/** "icon|name" for the phone's ITEM button (a spinning roulette while it rolls). */
function phoneItem(k: KartState): string | null {
  if (k.rollTime > 0) return '🎲|…';
  if (!k.item) return null;
  const skin = itemSkin(track().def.id, k.item, SPECIAL_OF[k.vehicle.id], k.vehicle.id);
  const n = k.item === 'boost3' && k.itemCount > 1 ? ` ×${k.itemCount}` : '';
  return `${skin.icon}|${skin.name}${n}`;
}

function sendPhoneHud(dt: number): void {
  hudTimer += dt;
  if (hudTimer < 0.1 || !session) return;
  hudTimer = 0;
  raceMembers.forEach((m, i) => {
    if (m?.kind !== 'phone' || m.slot === undefined) return;
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
await preloadRigged();
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
  if (cupMode) {
    cup = new Tournament(trackId, settings.cupRaces);
    cupHome = trackId;
    trackId = cup.trackId;
  }
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
    Number(params.get('laps') ?? lapsFor()),
  );
  const t = Number(params.get('t') ?? 0);
  if (t > 0) session!.fastForward(t);
} else {
  toLobby();
  if (params.has('tour')) startTour();
}
net.start();

/** 8-Player Local: measure the round trip to the other laptop, once a second. */
let pingTimer = 0;
function pingPartner(now: number): void {
  const p = partner();
  if (p === undefined || now - pingTimer < 1000) return;
  pingTimer = now;
  if (link.pingAt && link.ping && now - link.pingAt > 3000) link.rtt = NaN; // no answer
  link.ping++;
  link.pingAt = now;
  net.sendLink({ t: 'ping', n: link.ping } satisfies LinkMsg, p);
  if (state === 'lobby' && Math.floor(now / 1000) % 2 === 0) renderLobby();
  if (!linkHelp.hidden) renderLinkHelp();
}

let last = performance.now();
function loop(now: number): void {
  const real = (now - last) / 1000;
  // ?fixed=1 steps exactly one 60 Hz frame per render (deterministic screenshots on slow machines).
  const dt = params.has('fixed') ? 1 / 60 : Math.min(0.1, real);
  last = now;
  if (quality.frame(real)) applyQuality();
  fpsMeter?.frame(real, quality, () => view.bufferSize);
  pollLocal();
  pingPartner(now);
  if (isMain() && session?.waiting) maybeGo();
  if (tour) {
    tour.frame(dt);
    tourHud();
    if (tour.done) endTour();
  } else if (session) {
    session.frame(dt);
    sendPhoneHud(dt);
    if (state === 'results' && !following() && now - resultsAt > (cup ? 45000 : 20000))
      afterResults();
  } else if (showroom) {
    showroom.frame(dt, !params.has('fixed'));
    if (state === 'lobby' && startAt && now >= startAt) startFromLobby();
    else if (state === 'lobby' && startAt) {
      const go = document.getElementById('go');
      if (go) go.textContent = `Starting in ${Math.ceil((startAt - now) / 1000)}…`;
      sendLobby(); // the second laptop's countdown
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.addEventListener('keydown', (e) => {
  if (e.code === 'F2') view.setLook(view.look === 'modern' ? 'retro' : 'modern');
  if (!linkHelp.hidden) {
    if (['KeyI', 'Escape', 'Backspace', 'KeyB'].includes(e.code)) toggleLinkHelp(false);
    return;
  }
  if (!howTo.hidden) {
    if (e.code === 'KeyH' || e.code === 'Escape') toggleHowTo(false);
    return;
  }
  if (!settingsEl.hidden) {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') moveSettings(-1);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') moveSettings(1);
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') changeSetting(-1);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') changeSetting(1);
    else if (e.code === 'KeyI') toggleLinkHelp(true);
    else if (['Enter', 'NumpadEnter', 'Escape', 'KeyO', 'Backspace', 'Space'].includes(e.code))
      toggleSettings(false);
    return;
  }
  if (state === 'lobby' && e.code === 'KeyO') {
    toggleSettings(true);
    return;
  }
  if (state === 'lobby' && e.code === 'KeyH') toggleHowTo(true);
  if (state === 'lobby' && e.code === 'KeyM') startTour();
  if (state === 'lobby' && e.code === 'KeyG') toggleCup();
  else if (state === 'tour' && ['Escape', 'Backspace', 'KeyM', 'KeyB'].includes(e.code)) endTour();
  if (state === 'lobby' && e.code === 'KeyI') toggleLinkHelp(true);
  if (state !== 'race') return;
  if (!paused) {
    if (e.code === 'Escape' || e.code === 'KeyP') pauseAction('toggle');
    return;
  }
  if (e.code === 'ArrowUp' || e.code === 'KeyW') movePause(-1);
  else if (e.code === 'ArrowDown' || e.code === 'KeyS') movePause(1);
  else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')
    PAUSE_ITEMS[pauseSel]![1]();
  else if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'Backspace')
    pauseAction('resume');
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
