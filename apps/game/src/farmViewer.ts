import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLAYER_COLORS, VEHICLES } from '@epic/shared';
import { FarmScene } from './farm/farmScene.ts';
import { FARM, FARM_SCALE, type XY, mid } from './farm/layout.ts';
import { KartView } from './render/kartView.ts';
import { View } from './render/view.ts';

/**
 * Grandparents' Farm viewer: see the farm before any racetrack exists. Fly over it like a
 * drone, jump to each landmark, or drop in a miniature kart and drive around to feel the
 * scale (1:10, so a kart is RC-car sized).
 *
 * Hash options: #drive  #drone  #<landmark id> (e.g. #barn) for a starting view.
 */

const view = new View(document.getElementById('stage')!);
const farm = new FarmScene(view.renderer);
const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 60000);
const controls = new OrbitControls(camera, view.renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 8;
controls.maxDistance = 9000;
controls.zoomSpeed = 1.2;

// ---------------------------------------------------------------- landmarks

interface Landmark {
  id: string;
  name: string;
  at: XY;
  /** Viewing distance in game metres and orbit angle (radians from map south, clockwise). */
  dist: number;
  yaw: number;
  pitch?: number;
  lift?: number;
}
const avg = (pts: XY[]): XY => [
  pts.reduce((s, p) => s + p[0], 0) / pts.length,
  pts.reduce((s, p) => s + p[1], 0) / pts.length,
];
const orchardC = avg(FARM.orchard.map(([x, y]) => [x, y] as XY));
const LANDMARKS: Landmark[] = [
  { id: 'overview', name: 'Whole farm', at: [52, 95], dist: 2700, yaw: -0.15, pitch: 0.9 },
  {
    id: 'house',
    name: '1 · Farmhouse',
    at: FARM.house.main.c,
    dist: 300,
    yaw: -2.3,
    pitch: 0.28,
    lift: 30,
  },
  {
    id: 'barn',
    name: '3 · Barn, ramp and lilacs',
    at: mid(FARM.ramp[2]!, FARM.ramp[3]!),
    dist: 380,
    yaw: -1.7,
    pitch: 0.3,
    lift: 40,
  },
  {
    id: 'south-door',
    name: '3 · Barn south door and hoop',
    at: FARM.barn.c,
    dist: 300,
    yaw: 0.35,
    pitch: 0.18,
    lift: 20,
  },
  {
    id: 'windmill',
    name: '6 · Windmill and arborvitae',
    at: FARM.windmill,
    dist: 260,
    yaw: -1.4,
    pitch: 0.22,
    lift: 60,
  },
  { id: 'orchard', name: '7 · Orchard', at: orchardC, dist: 420, yaw: -0.8, pitch: 0.32 },
  {
    id: 'garage',
    name: '8–9 · Grapes and red garage',
    at: FARM.red_garage.c,
    dist: 260,
    yaw: -0.4,
    pitch: 0.3,
    lift: 15,
  },
  {
    id: 'crib',
    name: '10–12 · Crib, shed, greenhouse, wagons',
    at: FARM.shed.c,
    dist: 260,
    yaw: 0.9,
    pitch: 0.3,
  },
  {
    id: 'christmas',
    name: '13 · Christmas trees',
    at: avg(FARM.christmas_block),
    dist: 800,
    yaw: -0.2,
    pitch: 0.42,
  },
  {
    id: 'pumpkins',
    name: '14 · Pumpkin patch',
    at: avg(FARM.pumpkin_patch),
    dist: 520,
    yaw: 0.1,
    pitch: 0.3,
  },
  {
    id: 'stove',
    name: '15 · Stove and the big Scotch pine',
    at: FARM.stove,
    dist: 260,
    yaw: -0.9,
    pitch: 0.22,
    lift: 20,
  },
  {
    id: 'yard',
    name: '16–17 · Clothes lines and playhouse',
    at: FARM.playhouse.c,
    dist: 220,
    yaw: 2.6,
    pitch: 0.28,
  },
  { id: 'well', name: 'Old well and sandbox', at: FARM.well, dist: 140, yaw: -2.0, pitch: 0.4 },
];

let flight: {
  from: [THREE.Vector3, THREE.Vector3];
  to: [THREE.Vector3, THREE.Vector3];
  t: number;
} | null = null;

function landmarkPose(l: Landmark): [THREE.Vector3, THREE.Vector3] {
  const target = FarmScene.world(l.at, l.lift ?? 10);
  const pitch = l.pitch ?? 0.3;
  const dir = new THREE.Vector3(
    Math.sin(l.yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(l.yaw) * Math.cos(pitch),
  );
  return [target.clone().addScaledVector(dir, l.dist), target];
}

function flyTo(l: Landmark, instant = false): void {
  setMode('drone');
  const [pos, target] = landmarkPose(l);
  if (instant) {
    camera.position.copy(pos);
    controls.target.copy(target);
    flight = null;
  } else
    flight = { from: [camera.position.clone(), controls.target.clone()], to: [pos, target], t: 0 };
  for (const b of panel.querySelectorAll('button[data-lm]'))
    b.classList.toggle('on', (b as HTMLElement).dataset.lm === l.id);
}

// ---------------------------------------------------------------- the miniature kart

let vehicleIndex = 3;
let kart = new KartView(VEHICLES[vehicleIndex]!.id, PLAYER_COLORS[0]!);
farm.scene.add(kart.root);
const car = {
  pos: FarmScene.world(add2(FARM.barn.c, [-24, -6])),
  yaw: 2.4,
  speed: 0,
};
function add2(a: XY, b: XY): XY {
  return [a[0] + b[0], a[1] + b[1]];
}
const keys = new Set<string>();
const touch = { gas: false, brake: false, left: false, right: false };
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyV') swapVehicle();
  if (e.code === 'KeyC') setMode(mode === 'drive' ? 'drone' : 'drive');
});
addEventListener('keyup', (e) => keys.delete(e.code));
const held = (...codes: string[]) => codes.some((c) => keys.has(c));

function swapVehicle(): void {
  farm.scene.remove(kart.root);
  vehicleIndex = (vehicleIndex + 1) % VEHICLES.length;
  kart = new KartView(
    VEHICLES[vehicleIndex]!.id,
    PLAYER_COLORS[vehicleIndex % PLAYER_COLORS.length]!,
  );
  farm.scene.add(kart.root);
}

const TOP = 38; // game top speed (m/s), as on the race tracks
const up = new THREE.Vector3();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
function driveStep(dt: number): void {
  const gas = held('ArrowUp', 'KeyW') || touch.gas;
  const brake = held('ArrowDown', 'KeyS') || touch.brake;
  const steer =
    (held('ArrowLeft', 'KeyA') || touch.left ? 1 : 0) -
    (held('ArrowRight', 'KeyD') || touch.right ? 1 : 0);
  const boost = held('ShiftLeft', 'ShiftRight');
  const max = boost ? TOP * 1.35 : TOP;
  if (gas) car.speed += (car.speed < 0 ? 40 : 16) * dt;
  else if (brake) car.speed -= (car.speed > 0 ? 34 : 9) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 7 * dt);
  car.speed = Math.max(-12, Math.min(max, car.speed));
  const grip = Math.min(1, Math.abs(car.speed) / 6);
  car.yaw +=
    steer *
    1.9 *
    grip *
    Math.sign(car.speed || 1) *
    dt *
    (1 - 0.35 * Math.min(1, Math.abs(car.speed) / TOP));
  fwd.set(-Math.sin(car.yaw), 0, -Math.cos(car.yaw));
  car.pos.addScaledVector(fwd, car.speed * dt);
  if (farm.collide(car.pos, 1.6)) car.speed *= 0.5;
  // Keep to the painted land.
  const [mx, my] = FarmScene.map(car.pos.x, car.pos.z);
  if (mx < -70 || mx > 180 || my < -80 || my > 252) {
    car.pos.addScaledVector(fwd, -car.speed * dt);
    car.speed = 0;
  }
  // Sit on the ground, tilted to its slope.
  const h = (x: number, z: number) => farm.heightAt(x, z);
  car.pos.y = h(car.pos.x, car.pos.z);
  right.set(Math.cos(car.yaw), 0, -Math.sin(car.yaw));
  const e = 1.4;
  const dz =
    h(car.pos.x + fwd.x * e, car.pos.z + fwd.z * e) -
    h(car.pos.x - fwd.x * e, car.pos.z - fwd.z * e);
  const dx =
    h(car.pos.x + right.x * e, car.pos.z + right.z * e) -
    h(car.pos.x - right.x * e, car.pos.z - right.z * e);
  const f3 = fwd
    .clone()
    .multiplyScalar(2 * e)
    .setY(dz)
    .normalize();
  const r3 = right
    .clone()
    .multiplyScalar(2 * e)
    .setY(dx)
    .normalize();
  up.crossVectors(r3, f3).normalize();
  kart.root.position.copy(car.pos);
  if (kart.model.userData.hover) kart.model.position.y = 0.7;
  kart.root.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(r3, up, f3.clone().negate()),
  );
  kart.model.userData.animate?.(performance.now() / 1000, Math.abs(car.speed), dt);
}

const chase = { pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false };
function chaseCam(dt: number): void {
  const back = new THREE.Vector3(-Math.sin(car.yaw), 0, -Math.cos(car.yaw));
  const want = car.pos
    .clone()
    .addScaledVector(back, -10.5)
    .add(new THREE.Vector3(0, 4.2, 0));
  want.y = Math.max(want.y, farm.heightAt(want.x, want.z) + 1.5);
  const look = car.pos
    .clone()
    .addScaledVector(back, 7)
    .add(new THREE.Vector3(0, 1.6, 0));
  const k = chase.init ? 1 - Math.exp(-dt * 6) : 1;
  chase.pos.lerp(want, k);
  chase.look.lerp(look, k);
  chase.init = true;
  camera.position.copy(chase.pos);
  camera.lookAt(chase.look);
}

// ---------------------------------------------------------------- UI

type Mode = 'drone' | 'drive';
let mode: Mode = 'drone';
const ui = document.getElementById('ui')!;
ui.insertAdjacentHTML(
  'beforeend',
  `<div class="farm-title">Grandparents' Farm<small>1:10 scale · first look, no racetrack yet</small></div>
   <div class="farm-panel" id="panel"></div>
   <div class="farm-help" id="help"></div>
   <div class="farm-speed" id="speed"></div>
   <div class="farm-touch left" id="tl" hidden><button data-t="left" aria-label="Steer left">◀</button><button data-t="right" aria-label="Steer right">▶</button></div>
   <div class="farm-touch right" id="tr" hidden><button data-t="brake" aria-label="Brake">▼</button><button data-t="gas" aria-label="Accelerate">▲</button></div>`,
);
const panel = document.getElementById('panel')!;
const help = document.getElementById('help')!;
const speedEl = document.getElementById('speed')!;
const driveBtn = document.createElement('button');
driveBtn.textContent = '🏎 Drive a mini kart';
driveBtn.addEventListener('click', () => setMode(mode === 'drive' ? 'drone' : 'drive'));
panel.append(driveBtn, Object.assign(document.createElement('div'), { className: 'sep' }));
for (const l of LANDMARKS) {
  const b = document.createElement('button');
  b.textContent = l.name;
  b.dataset.lm = l.id;
  b.addEventListener('click', () => flyTo(l));
  panel.append(b);
}
const isTouch = matchMedia('(pointer: coarse)').matches;
for (const b of ui.querySelectorAll<HTMLButtonElement>('.farm-touch button')) {
  const k = b.dataset.t as keyof typeof touch;
  const on = (v: boolean) => (e: Event) => {
    e.preventDefault();
    touch[k] = v;
  };
  b.addEventListener('pointerdown', on(true));
  b.addEventListener('pointerup', on(false));
  b.addEventListener('pointercancel', on(false));
  b.addEventListener('pointerleave', on(false));
}

function setMode(m: Mode): void {
  mode = m;
  controls.enabled = m === 'drone';
  driveBtn.classList.toggle('on', m === 'drive');
  driveBtn.textContent = m === 'drive' ? '✈ Back to the drone' : '🏎 Drive a mini kart';
  document.getElementById('tl')!.hidden = !(m === 'drive' && isTouch);
  document.getElementById('tr')!.hidden = !(m === 'drive' && isTouch);
  chase.init = false;
  if (m === 'drive') flight = null;
  help.textContent =
    m === 'drive'
      ? 'Arrows or WASD to drive · Shift for a burst · V changes the ride · C back to the drone. Buildings are solid; the barn ramp is drivable.'
      : 'Drag to look around · scroll or pinch to zoom · right-drag to pan · pick a landmark to fly there.';
  speedEl.textContent = '';
}

// ---------------------------------------------------------------- loop

const start = location.hash.slice(1);
const startLm = LANDMARKS.find((l) => l.id === start) ?? LANDMARKS[0]!;
flyTo(startLm, true);
if (start === 'drive') setMode('drive');
else setMode('drone');
addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (h === 'drive') setMode('drive');
  const l = LANDMARKS.find((x) => x.id === h);
  if (l) flyTo(l);
});

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (mode === 'drive') {
    driveStep(dt);
    chaseCam(dt);
    farm.focusSun(car.pos, 220);
    const kmh = Math.abs(car.speed) * 3.6;
    // At 1:10 a kart's 38 m/s is ~14 km/h for a real RC car; show the game speed.
    speedEl.textContent = `${kmh.toFixed(0)} km/h`;
  } else {
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / 1.6);
      const k = flight.t * flight.t * (3 - 2 * flight.t);
      camera.position.lerpVectors(flight.from[0], flight.to[0], k);
      controls.target.lerpVectors(flight.from[1], flight.to[1], k);
      if (flight.t >= 1) flight = null;
    }
    controls.update();
    driveStep(0); // keep the parked kart settled on the ground
    const d = camera.position.distanceTo(controls.target);
    farm.focusSun(controls.target, Math.min(2600, Math.max(160, d * 0.85)));
  }
  farm.update(dt, camera);
  view.render(farm.scene, [{ x: 0, y: 0, w: 1, h: 1, camera }]);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// For screenshots and tests.
(window as unknown as { __farm: unknown }).__farm = {
  farm,
  camera,
  controls,
  flyTo,
  LANDMARKS,
  setMode,
  car,
  FARM_SCALE,
};
