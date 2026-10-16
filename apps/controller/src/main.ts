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
 * on the TV laptop. Works over plain HTTP on the home Wi-Fi (no permissions needed).
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
};

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
setInterval(() => {
  if (mode !== 'race' || ws?.readyState !== 1) return;
  const key = `${pad.steer.toFixed(2)}|${pad.throttle}|${pad.brake}|${pad.drift}|${pad.item}`;
  const now = performance.now();
  if (key === lastSent && now - lastSentAt < 100) return;
  lastSent = key;
  lastSentAt = now;
  ws.send(encodeInput(pad, seq++));
  framesSent++;
}, 16);

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
      if (mode !== 'lobby') showLobby();
      else renderLobby();
      break;
    case 'race':
      showRace();
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
  app.innerHTML = `<div class="pad">
    <div class="bar"><span>${name}</span><span class="place">-</span><span class="lap">LAP 1</span><span class="item" hidden></span><span class="dot"></span></div>
    <div class="zones">
      <div class="steer"><div class="track"></div><div class="knob"></div><div class="hint">drag to steer</div></div>
      <div class="btns">
        <div class="btn drift" data-b="drift">DRIFT</div>
        <div class="btn item" data-b="item">ITEM</div>
        <div class="btn brake" data-b="brake">BRAKE</div>
        <div class="btn gas" data-b="gas">GAS</div>
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
  hudEls.item.hidden = !item;
  hudEls.item.textContent = item ?? '';
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
function bindPad(): void {
  const steerZone = app.querySelector<HTMLElement>('.steer')!;
  const knob = app.querySelector<HTMLElement>('.knob')!;
  const btns = [...app.querySelectorAll<HTMLElement>('.btn')];
  let steerTouch: number | null = null;
  let steerOrigin = 0;
  const btnTouches = new Map<number, HTMLElement | null>();
  const RANGE = () => steerZone.clientWidth * 0.32;

  const setSteer = (dx: number) => {
    const r = RANGE();
    const v = Math.max(-1, Math.min(1, dx / r));
    pad.steer = Math.abs(v) < 0.06 ? 0 : v;
    knob.style.transform = `translateX(${v * r}px)`;
  };

  const refreshButtons = () => {
    const held = new Set([...btnTouches.values()].filter(Boolean).map((b) => b!.dataset.b));
    btns.forEach((b) => b.classList.toggle('down', held.has(b.dataset.b)));
    pad.throttle = held.has('gas') ? 1 : 0;
    pad.brake = held.has('brake') ? 1 : 0;
    pad.drift = held.has('drift');
    pad.item = held.has('item');
  };

  const btnAt = (x: number, y: number): HTMLElement | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return el?.closest<HTMLElement>('.btn') ?? null;
  };

  const onStart = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      const inSteer = steerZone.contains(document.elementFromPoint(t.clientX, t.clientY));
      if (inSteer && steerTouch === null) {
        steerTouch = t.identifier;
        steerOrigin = t.clientX;
        setSteer(0);
      } else {
        btnTouches.set(t.identifier, btnAt(t.clientX, t.clientY));
        navigator.vibrate?.(8);
      }
    }
    refreshButtons();
  };
  const onMove = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === steerTouch) setSteer(t.clientX - steerOrigin);
      else if (btnTouches.has(t.identifier))
        btnTouches.set(t.identifier, btnAt(t.clientX, t.clientY)); // slide between buttons
    }
    refreshButtons();
  };
  const onEnd = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === steerTouch) {
        steerTouch = null;
        setSteer(0);
      }
      btnTouches.delete(t.identifier);
    }
    refreshButtons();
  };
  const root = app.querySelector<HTMLElement>('.pad')!;
  root.addEventListener('touchstart', onStart, { passive: false });
  root.addEventListener('touchmove', onMove, { passive: false });
  root.addEventListener('touchend', onEnd, { passive: false });
  root.addEventListener('touchcancel', onEnd, { passive: false });

  // Mouse fallback so the pad can be tested on a laptop browser.
  let mouseSteer = false;
  root.addEventListener('mousedown', (e) => {
    if (steerZone.contains(e.target as Node)) {
      mouseSteer = true;
      steerOrigin = e.clientX;
    } else {
      btnTouches.set(-1, btnAt(e.clientX, e.clientY));
      refreshButtons();
    }
  });
  window.addEventListener('mousemove', (e) => mouseSteer && setSteer(e.clientX - steerOrigin));
  window.addEventListener('mouseup', () => {
    mouseSteer = false;
    setSteer(0);
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

showJoin();
if (name) connect();
