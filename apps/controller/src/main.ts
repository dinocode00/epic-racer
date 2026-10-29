import {
  type HostToPad,
  type PadState,
  VEHICLES,
  VEHICLE_ICONS as ICONS,
  WS_PATH,
  encodeInput,
  neutralPad,
} from '@epic/shared';

/**
 * Phone controller. Thin client: sends input, shows a small HUD. All game logic lives
 * on the TV laptop. Joins over the server's own HTTPS link, which tilt steering needs; plain
 * HTTP works too, with slide steering only.
 */

const app = document.getElementById('app')!;
const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

// A hop from the plain link to the secure one brings the name and steering choice along.
const params = new URLSearchParams(location.search);
for (const [q, k] of [
  ['name', 'epic.name'],
  ['steer', 'epic.steer'],
] as const) {
  const v = params.get(q);
  if (v) store.set(k, v);
}
if (params.size) history.replaceState(null, '', location.pathname);

let playerId = store.get('epic.playerId');
if (!playerId) {
  playerId = Math.random().toString(36).slice(2, 10);
  store.set('epic.playerId', playerId);
}

let ws: WebSocket | null = null;
let name = store.get('epic.name') ?? '';
let color = '#e8433a';
let vehicle: string | null = null;
let ready = false;
let trackName = '';
let canChangeTrack = false;
let connected = false;
let mode: 'join' | 'lobby' | 'race' | 'results' = 'join';
const pad: PadState = neutralPad();
let seq = 0;
let framesSent = 0;
// Test hook: lets automated tests inspect the controller.
(window as unknown as { __pad: unknown }).__pad = {
  pad,
  frames: () => framesSent,
  mode: () => mode,
  tilt: () => tilt,
};

// ---------- tilt steering ----------
// Hold the phone sideways like a steering wheel: turning it clockwise steers right. The tilt
// is read from gravity in the screen's own plane, so it works whichever way the phone is
// rotated and however far it leans back.
const TILT_FULL_LOCK = 25; // degrees of turn for full lock

/**
 * Slide or tilt (-1..1 of full lock) to steering. Straight in proportion past a small dead
 * zone for thumb jitter, so even a slight move gives a real turn.
 */
function steerCurve(v: number): number {
  return Math.sign(v) * Math.max(0, (Math.abs(v) - 0.04) / 0.96);
}
const tilt = {
  on: store.get('epic.steer') === 'tilt',
  /** Motion listener added. */
  armed: false,
  /** Readings are arriving. */
  listening: false,
  /** Steering from the tilt, -1..1. */
  steer: 0,
  /** How far the wheel is turned, -1..1 of full lock (drives the on-screen knob). */
  turn: 0,
  angle: null as number | null,
  center: null as number | null,
  note: '',
};
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function onMotion(e: DeviceMotionEvent): void {
  const g = e.accelerationIncludingGravity;
  if (g?.x == null || g.y == null) return;
  const deg =
    screen.orientation?.angle ?? Number((window as { orientation?: number }).orientation ?? 0);
  const r = (deg * Math.PI) / 180;
  // Gravity in screen coordinates (x right, y up on the screen as it's displayed).
  const sx = g.x * Math.cos(r) - g.y * Math.sin(r);
  const sy = g.x * Math.sin(r) + g.y * Math.cos(r);
  if (Math.hypot(sx, sy) < 2.5) return; // lying nearly flat: no clear wheel angle, keep the last
  const raw = Math.atan2(sx, sy);
  // Light smoothing against hand shake.
  tilt.angle = tilt.angle === null ? raw : tilt.angle + wrap(raw - tilt.angle) * 0.5;
  // Straight starts as "level". Browsers disagree on gravity's sign, so level is whichever of
  // the two upright readings is nearer; CENTER can set straight to any angle.
  if (tilt.center === null) tilt.center = Math.abs(wrap(tilt.angle)) < Math.PI / 2 ? 0 : Math.PI;
  const turned = (-wrap(tilt.angle - tilt.center) * 180) / Math.PI;
  const v = Math.max(-1, Math.min(1, turned / TILT_FULL_LOCK));
  tilt.turn = v;
  tilt.steer = steerCurve(v);
  if (tilt.on && mode === 'race') pad.steer = tilt.steer;
  tilt.listening = true;
  onTilt?.();
}
let onTilt: (() => void) | null = null;

/** Turns on the motion sensors. iPhones ask once, and only from a tap on a secure page. */
let asking: Promise<boolean> | null = null;
function startTilt(): Promise<boolean> {
  if (tilt.armed) return Promise.resolve(true);
  return (asking ??= askForMotion().finally(() => (asking = null)));
}
async function askForMotion(): Promise<boolean> {
  if (!window.isSecureContext || typeof DeviceMotionEvent === 'undefined') return false;
  const DM = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
  try {
    if (DM.requestPermission && (await DM.requestPermission()) !== 'granted') {
      tilt.note =
        'Motion access is off. Close this tab, open the link from the TV again and tap Allow.';
      return false;
    }
  } catch {
    tilt.note = 'Tap TILT again to allow motion access.';
    return false;
  }
  if (!tilt.armed) addEventListener('devicemotion', onMotion);
  tilt.armed = true;
  tilt.note = '';
  return true;
}

async function chooseSteering(choice: 'slide' | 'tilt'): Promise<void> {
  tilt.note = '';
  if (choice === 'tilt' && !window.isSecureContext) {
    // Hop to the server's secure link, keeping the name and the choice.
    try {
      const info = (await (await fetch('/api/info')).json()) as { controllerUrl: string };
      if (info.controllerUrl.startsWith('https:')) {
        location.href = `${info.controllerUrl}?name=${encodeURIComponent(name)}&steer=tilt`;
        return;
      }
    } catch {
      /* fall through */
    }
    tilt.note =
      'Tilt needs the secure link. Restart the game on the laptop and scan the new QR code.';
  } else if (choice === 'slide' || (await startTilt())) {
    tilt.on = choice === 'tilt';
    store.set('epic.steer', choice);
  } else {
    tilt.note ||= 'This phone has no motion sensor the browser can read.';
  }
  if (mode === 'lobby') renderLobby();
}

// ---------- networking ----------
function connect(): void {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}${WS_PATH}?role=pad`);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    connected = true;
    send({ t: 'hello', playerId: playerId!, name });
    updateDot();
  };
  ws.onclose = () => {
    connected = false;
    updateDot();
    setTimeout(connect, 1000);
  };
  ws.onmessage = (e) => {
    if (typeof e.data !== 'string') return;
    onHost(JSON.parse(e.data) as HostToPad);
  };
}

function send(m: object): void {
  if (ws?.readyState === 1) ws.send(JSON.stringify(m));
}

let lastSent = '';
let lastSentAt = 0;
/** An ITEM press not yet sent: even a tap shorter than one send tick must reach the TV. */
let itemTap = false;
function pump(): void {
  if (mode !== 'race' || ws?.readyState !== 1) return;
  const out = itemTap ? { ...pad, item: true } : pad;
  const key = `${out.steer.toFixed(2)}|${out.throttle}|${out.brake}|${out.drift}|${out.item}`;
  const now = performance.now();
  if (key === lastSent && now - lastSentAt < 100) return;
  itemTap = false;
  lastSent = key;
  lastSentAt = now;
  ws.send(encodeInput(out, seq++));
  framesSent++;
}
setInterval(pump, 16);

function onHost(m: HostToPad): void {
  switch (m.t) {
    case 'welcome':
      color = m.color;
      document.documentElement.style.setProperty('--me', color);
      if (mode === 'join') showLobby();
      break;
    case 'lobby':
      vehicle = m.vehicle;
      ready = m.ready;
      trackName = m.track ?? '';
      canChangeTrack = !!m.canChangeTrack;
      if (mode !== 'lobby') showLobby();
      else renderLobby();
      break;
    case 'race':
      if (mode !== 'race') showRace(); // a repeat must not rebuild the pad and drop held buttons
      break;
    case 'hud':
      updateHud(m.place, m.lap, m.laps, m.item, m.boost);
      break;
    case 'results':
      showResults(m.place);
      break;
  }
}

// ---------- screens ----------
function showJoin(): void {
  mode = 'join';
  app.innerHTML = `<div class="screen">
    <h1>EPIC RACER</h1>
    <div class="sub">Type your racer name</div>
    <input id="nm" type="text" maxlength="10" autocomplete="off" value="${name}" placeholder="NAME" />
    <button class="big" id="go">JOIN</button>
  </div>`;
  const input = document.getElementById('nm') as HTMLInputElement;
  document.getElementById('go')!.onclick = () => {
    name = (input.value.trim() || 'Player').toUpperCase().slice(0, 10);
    store.set('epic.name', name);
    keepAwake();
    if (!ws) connect();
    else send({ t: 'hello', playerId: playerId!, name });
  };
}

function showLobby(): void {
  mode = 'lobby';
  renderLobby();
}

function renderLobby(): void {
  const cars = VEHICLES.map(
    (v) => `<div class="car ${v.id === vehicle ? 'sel' : ''}" data-id="${v.id}">
      ${ICONS[v.id] ?? ''}
      <div class="n">${v.name}</div>
      ${(['speed', 'handling', 'weight'] as const).map((k) => `<div class="stat"><span>${{ speed: 'SPD', handling: 'HDL', weight: 'WGT' }[k]}</span><i style="width:${v[k] * 20}%"></i></div>`).join('')}
    </div>`,
  ).join('');
  app.innerHTML = `<div class="screen">
    <div class="badge">${name}</div>
    <div class="sub">Choose your ride</div>
    <div class="cars">${cars}</div>
    ${trackName ? `<div class="trackpick">${canChangeTrack ? '<button id="tprev">◀</button>' : ''}<span>Track: <b>${trackName}</b></span>${canChangeTrack ? '<button id="tnext">▶</button>' : ''}</div>` : ''}
    <div class="steerpick"><span>Steering</span>${(['slide', 'tilt'] as const).map((k) => `<button data-s="${k}" class="${(k === 'tilt') === tilt.on ? 'sel' : ''}">${k.toUpperCase()}</button>`).join('')}</div>
    ${tilt.on && !tilt.note ? '<div class="tiltmeter"><b>◀</b><i></i><b>▶</b></div><div class="sub">Hold the phone sideways like a wheel and turn it</div>' : ''}
    ${tilt.note ? `<div class="sub warn">${tilt.note}</div>` : ''}
    <button class="big ${ready ? 'ready' : ''}" id="ready">${ready ? 'READY!' : 'READY?'}</button>
    <div class="sub">Watch the TV. The race starts when everyone is ready.</div>
  </div>`;
  app.querySelectorAll<HTMLElement>('.car').forEach((el) => {
    el.onclick = () => {
      vehicle = el.dataset.id!;
      send({ t: 'pickVehicle', vehicle });
      renderLobby();
    };
  });
  const tp = document.getElementById('tprev'),
    tn = document.getElementById('tnext');
  if (tp) tp.onclick = () => send({ t: 'menu', action: 'prev' });
  if (tn) tn.onclick = () => send({ t: 'menu', action: 'next' });
  app.querySelectorAll<HTMLElement>('.steerpick button').forEach((b) => {
    b.onclick = () => void chooseSteering(b.dataset.s as 'slide' | 'tilt');
  });
  const meter = app.querySelector<HTMLElement>('.tiltmeter i');
  onTilt = meter ? () => (meter.style.left = `${50 + tilt.turn * 45}%`) : null;
  document.getElementById('ready')!.onclick = () => {
    ready = !ready;
    send({ t: 'ready', ready });
    renderLobby();
  };
}

let hudEls: { place: HTMLElement; lap: HTMLElement; item: HTMLElement; flash: HTMLElement } | null =
  null;

function showRace(): void {
  mode = 'race';
  Object.assign(pad, neutralPad());
  if (tilt.on) {
    tilt.center = null; // each race starts with level as straight
    tilt.angle = null;
  }
  app.innerHTML = `<div class="pad">
    <div class="bar"><span>${name}</span><span class="place">-</span><span class="lap">LAP 1</span><span class="item" hidden></span><span class="dot"></span></div>
    <div class="zones">
      <div class="btns">
        <div class="btn item" data-b="item">ITEM</div>
        <div class="btn drift" data-b="drift">DRIFT</div>
        <div class="btn brake" data-b="brake">BRAKE</div>
      </div>
      <div class="drive">
        <div class="rail"></div>
        <div class="knob"><span>◀</span><b>GAS</b><span>▶</span></div>
        ${tilt.on ? '<div class="center">⟲ CENTER</div>' : ''}
        <div class="hint">hold for gas · ${tilt.on ? 'turn the phone' : 'slide'} to steer</div>
      </div>
    </div>
    <div class="flash"></div>
    <div class="rotate"><div style="font-size:48px">↻</div>Turn your phone sideways</div>
  </div>`;
  hudEls = {
    place: app.querySelector('.place')!,
    lap: app.querySelector('.lap')!,
    item: app.querySelector('.item')!,
    flash: app.querySelector('.flash')!,
  };
  bindPad();
  updateDot();
}

function showResults(place: number): void {
  mode = 'results';
  const suffix =
    ['th', 'st', 'nd', 'rd'][
      place % 100 > 10 && place % 100 < 14 ? 0 : Math.min(place % 10, 4) % 4
    ] ?? 'th';
  app.innerHTML = `<div class="screen"><div class="sub">You finished</div><div class="big-place">${place}${suffix}</div>
    <button class="big" id="again">CONTINUE</button></div>`;
  document.getElementById('again')!.onclick = () => send({ t: 'menu', action: 'confirm' });
}

function updateHud(
  place: number,
  lap: number,
  laps: number,
  item: string | null,
  boost: number,
): void {
  if (!hudEls) return;
  hudEls.place.textContent = ordinal(place);
  hudEls.lap.textContent = `LAP ${lap}/${laps}`;
  // The held item shows on the ITEM button itself (icon + name), so a glance is enough.
  const [icon, label] = (item ?? '').split('|');
  hudEls.item.hidden = true;
  const btn = app.querySelector<HTMLElement>('.btn.item');
  if (btn) {
    const html = item
      ? `<span class="ic">${icon}</span><span class="lb">${label ?? ''}</span>`
      : 'ITEM';
    if (btn.dataset.html !== html) {
      btn.dataset.html = html;
      btn.innerHTML = html;
      btn.classList.toggle('has', !!item);
    }
  }
  if (boost > 0) {
    hudEls.flash.style.background =
      'radial-gradient(circle, rgba(255,160,40,0.35), transparent 70%)';
    hudEls.flash.style.opacity = '1';
    setTimeout(() => hudEls && (hudEls.flash.style.opacity = '0'), 150);
  }
}

function updateDot(): void {
  app.querySelector('.dot')?.classList.toggle('bad', !connected);
}

const ordinal = (n: number) =>
  n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th');

// ---------- touch handling ----------
// Right thumb: anywhere on the right half holds the gas, and sliding it sideways from where it
// landed steers (or, with tilt on, turning the phone does), so the gas never has to be let go.
// Left thumb: DRIFT, ITEM and BRAKE.
function bindPad(): void {
  const drive = app.querySelector<HTMLElement>('.drive')!;
  const knob = drive.querySelector<HTMLElement>('.knob')!;
  const rail = drive.querySelector<HTMLElement>('.rail')!;
  const btns = [...app.querySelectorAll<HTMLElement>('.btn')];
  let driveTouch: number | null = null;
  let originX = 0;
  let box = drive.getBoundingClientRect();
  const btnTouches = new Map<number, HTMLElement | null>();
  // Full lock sits about 1 cm either side of where the thumb landed.
  const range = () => box.width * 0.16;

  const center = drive.querySelector<HTMLElement>('.center');
  const showTilt = () => (knob.style.transform = `translateX(${tilt.turn * range()}px)`);
  // Until the sensors answer (say the page reloaded mid-race) the slide steers instead, and
  // a tap on the corner button wakes the sensors.
  const tilting = () => tilt.on && tilt.listening;
  const labelCenter = () =>
    center && (center.textContent = tilting() ? '⟲ CENTER' : 'TAP FOR TILT');
  labelCenter();
  center?.addEventListener('touchend', () => {
    if (!tilt.listening) void startTilt().then(labelCenter);
  });
  onTilt = tilt.on
    ? () => {
        if (center?.textContent !== '⟲ CENTER') labelCenter();
        showTilt();
      }
    : null;

  const steerTo = (x: number) => {
    if (tilting()) return showTilt();
    const r = range();
    // The landing spot stays the centre, so putting the thumb back there is always straight.
    const v = Math.max(-1, Math.min(1, (x - originX) / r));
    pad.steer = steerCurve(v);
    knob.style.transform = `translateX(${v * r}px)`;
  };
  const startDrive = (id: number, x: number, y: number) => {
    driveTouch = id;
    box = drive.getBoundingClientRect();
    originX = x;
    rail.style.left = knob.style.left = `${x - box.left}px`;
    rail.style.width = `${2 * range() + knob.offsetWidth}px`;
    rail.style.top = knob.style.top = `${y - box.top}px`;
    drive.classList.add('on');
    steerTo(x);
    navigator.vibrate?.(8);
  };
  const endDrive = () => {
    driveTouch = null;
    if (!tilting()) pad.steer = 0;
    drive.classList.remove('on');
    for (const el of [knob, rail]) el.style.left = el.style.top = el.style.transform = '';
  };
  const inDrive = (x: number, y: number) => {
    const r = drive.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  const refreshButtons = () => {
    const held = new Set([...btnTouches.values()].filter(Boolean).map((b) => b!.dataset.b));
    btns.forEach((b) => b.classList.toggle('down', held.has(b.dataset.b)));
    pad.brake = held.has('brake') ? 1 : 0;
    // Braking wins over the gas: hold both to stop or reverse while still steering.
    pad.throttle = driveTouch !== null && !pad.brake ? 1 : 0;
    pad.drift = held.has('drift');
    const item = held.has('item');
    if (item && !pad.item) itemTap = true;
    const changed = item !== pad.item;
    pad.item = item;
    if (changed) pump(); // buttons go out at once rather than on the next tick
  };

  // Played without looking: a press in a gap takes the nearest button if it's close.
  const btnAt = (x: number, y: number): HTMLElement | null => {
    let best: HTMLElement | null = null;
    let bestGap = Math.min(innerWidth, innerHeight) * 0.07;
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      const gap = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2) - r.width / 2;
      if (gap < bestGap) {
        bestGap = gap;
        best = b;
      }
    }
    return best;
  };

  // A finger whose lift went missing (its element was redrawn under it) must not stay held
  // forever: each touch event lists every finger still down, so drop the rest.
  const forgetLost = (e: TouchEvent) => {
    const down = new Set(Array.from(e.touches, (t) => t.identifier));
    for (const id of btnTouches.keys()) if (!down.has(id)) btnTouches.delete(id);
    if (driveTouch !== null && driveTouch >= 0 && !down.has(driveTouch)) endDrive();
  };

  const onStart = (e: TouchEvent) => {
    e.preventDefault();
    forgetLost(e);
    for (const t of Array.from(e.changedTouches)) {
      if (center && t.target instanceof Node && center.contains(t.target)) {
        tilt.center = tilt.angle; // however the phone is held right now is straight
        navigator.vibrate?.(15);
      } else if (inDrive(t.clientX, t.clientY)) {
        if (driveTouch === null) startDrive(t.identifier, t.clientX, t.clientY);
      } else {
        const b = btnAt(t.clientX, t.clientY);
        btnTouches.set(t.identifier, b);
        if (b) navigator.vibrate?.(8);
      }
    }
    refreshButtons();
  };
  const onMove = (e: TouchEvent) => {
    e.preventDefault();
    forgetLost(e);
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === driveTouch) steerTo(t.clientX);
      else if (btnTouches.has(t.identifier))
        btnTouches.set(t.identifier, btnAt(t.clientX, t.clientY)); // slide between buttons
    }
    refreshButtons();
  };
  const onEnd = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === driveTouch) endDrive();
      btnTouches.delete(t.identifier);
    }
    forgetLost(e);
    refreshButtons();
  };
  const root = app.querySelector<HTMLElement>('.pad')!;
  root.addEventListener('touchstart', onStart, { passive: false });
  root.addEventListener('touchmove', onMove, { passive: false });
  root.addEventListener('touchend', onEnd, { passive: false });
  root.addEventListener('touchcancel', onEnd, { passive: false });

  // Mouse fallback so the pad can be tested on a laptop browser.
  root.addEventListener('mousedown', (e) => {
    if (inDrive(e.clientX, e.clientY)) startDrive(-1, e.clientX, e.clientY);
    else btnTouches.set(-1, btnAt(e.clientX, e.clientY));
    refreshButtons();
  });
  window.addEventListener('mousemove', (e) => driveTouch === -1 && steerTo(e.clientX));
  window.addEventListener('mouseup', () => {
    if (driveTouch === -1) endDrive();
    btnTouches.delete(-1);
    refreshButtons();
  });
}

// Keep the screen on during races (iOS 16.4+, Android Chrome).
async function keepAwake(): Promise<void> {
  try {
    await (
      navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<unknown> } }
    ).wakeLock?.request('screen');
  } catch {
    /* not supported or denied */
  }
}
document.addEventListener(
  'visibilitychange',
  () => document.visibilityState === 'visible' && keepAwake(),
);

// With tilt chosen, the first tap anywhere wakes the sensors (iPhones need a tap for that).
document.addEventListener('click', () => tilt.on && void startTilt());

showJoin();
if (name) connect();
