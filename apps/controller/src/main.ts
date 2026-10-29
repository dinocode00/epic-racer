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
      <div class="btns">
        <div class="btn item" data-b="item">ITEM</div>
        <div class="btn drift" data-b="drift">DRIFT</div>
        <div class="btn brake" data-b="brake">BRAKE</div>
      </div>
      <div class="drive">
        <div class="rail"></div>
        <div class="knob"><span>◀</span><b>GAS</b><span>▶</span></div>
        <div class="hint">hold for gas · slide to steer</div>
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
// landed steers, so the gas never has to be let go. Left thumb: DRIFT, ITEM and BRAKE.
function bindPad(): void {
  const drive = app.querySelector<HTMLElement>('.drive')!;
  const knob = drive.querySelector<HTMLElement>('.knob')!;
  const rail = drive.querySelector<HTMLElement>('.rail')!;
  const btns = [...app.querySelectorAll<HTMLElement>('.btn')];
  let driveTouch: number | null = null;
  let originX = 0;
  let box = drive.getBoundingClientRect();
  const btnTouches = new Map<number, HTMLElement | null>();
  // Full lock sits about 1.3 cm either side of where the thumb landed: enough travel to hold a
  // gentle line without the thumb wandering into a full turn.
  const range = () => box.width * 0.22;

  const steerTo = (x: number) => {
    const r = range();
    // The landing spot stays the centre, so putting the thumb back there is always straight.
    const v = Math.max(-1, Math.min(1, (x - originX) / r));
    // Small dead zone for thumb jitter. Near the middle a slight slide gives a usable
    // correction straight away; further out the curve steepens, so the turn gets sharper the
    // further the thumb goes, up to full lock at the end of the travel.
    const a = Math.max(0, (Math.abs(v) - 0.04) / 0.96);
    pad.steer = Math.sign(v) * (0.6 * a + 0.4 * a ** 3);
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
    pad.steer = 0;
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
    pad.item = held.has('item');
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

  const onStart = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (inDrive(t.clientX, t.clientY)) {
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

showJoin();
if (name) connect();
