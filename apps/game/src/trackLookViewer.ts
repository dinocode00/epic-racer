import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLAYER_COLORS, VEHICLES } from '@epic/shared';
import { FarmScene } from './farm/farmScene.ts';
import DRAFT from './farm/racetrackDraft.json';
import { type Draft, type GlassStyle, buildTrackLook } from './farm/trackLook.ts';
import { KartView } from './render/kartView.ts';
import { View } from './render/view.ts';

/**
 * The racetrack's look, for approval: the first stretch of the approved route (start, under
 * the clothes lines, the loops in the spruces, the sky tube over the house, the drop and the
 * barn ramp) built in glass in the real farm, with a kart riding it.
 *
 * Hash options: #ride (default), #start, #loops, #sky, #over, #yard; ?style=clear|smoky|frosted.
 */

const view = new View(document.getElementById('stage')!);
const farm = new FarmScene(view.renderer);
const S = 10; // FARM_SCALE
const look = buildTrackLook(DRAFT as unknown as Draft, [
  'start',
  'clothes',
  'spruces',
  'sky',
  'drop',
  'ramp',
]);
farm.addToFarm(look.group);
const F = look.frames;

const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 60000);
const controls = new OrbitControls(camera, view.renderer.domElement);
controls.enableDamping = true;

const kart = new KartView(VEHICLES[3]!.id, PLAYER_COLORS[0]!);
farm.scene.add(kart.root);

// Where along the stretch (frame index, fractional) the kart is, and how fast it goes.
let u = 0;
const SPEED = 3.6; // real m/s (36 m/s in the game)
const seg: number[] = [0];
for (let i = 1; i < F.length; i++) seg.push(seg[i - 1]! + F[i]!.p.distanceTo(F[i - 1]!.p));
const total = seg[seg.length - 1]!;

const w = (v: THREE.Vector3) => farm.farmToWorld(v.clone());
const kp = new THREE.Vector3(),
  kt = new THREE.Vector3(),
  ku = new THREE.Vector3();
function placeKart(dist: number): void {
  let i = seg.findIndex((x) => x > dist);
  if (i < 1) i = 1;
  const a = F[i - 1]!,
    b = F[i]!;
  const k = (dist - seg[i - 1]!) / Math.max(1e-6, seg[i]! - seg[i - 1]!);
  kp.lerpVectors(a.p, b.p, k);
  kt.lerpVectors(a.t, b.t, k).normalize();
  ku.lerpVectors(a.up, b.up, k).normalize();
  const pos = w(kp);
  const fw = w(kp.clone().add(kt)).sub(pos).normalize();
  const up = w(kp.clone().add(ku)).sub(pos).normalize();
  const right = fw.clone().cross(up).normalize();
  kart.root.position.copy(pos);
  kart.root.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(right, up, fw.clone().negate()),
  );
}

// ---------------------------------------------------------------- views

type Mode = 'ride' | 'free';
let mode: Mode = 'ride';
const at = (x: number, y: number, h: number) =>
  new THREE.Vector3((x - 50) * S, h * S, -(y - 100) * S);
const VIEWS: Record<string, { name: string; pos: THREE.Vector3; target: THREE.Vector3 } | null> = {
  ride: null,
  start: { name: 'Start straight', pos: at(17, 171, 1.4), target: at(34, 167, 0.3) },
  loops: { name: 'Under the loops', pos: at(41, 179, 1.0), target: at(33, 187, 5) },
  sky: { name: 'Sky tube', pos: at(29, 188, 23), target: at(41, 174, 22) },
  over: { name: 'Over the house', pos: at(36, 168, 32), target: at(41, 175, 12) },
  yard: { name: 'From the front yard', pos: at(50, 147, 1.6), target: at(41, 175, 16) },
};
const ground = (p: THREE.Vector3) => farm.heightAt(p.x, p.z);
for (const v of Object.values(VIEWS))
  if (v) {
    v.pos.y += ground(v.pos);
    v.target.y += ground(v.target);
  }

function setView(id: string): void {
  const v = VIEWS[id];
  mode = v ? 'free' : 'ride';
  controls.enabled = !!v;
  if (v) {
    camera.position.copy(v.pos);
    controls.target.copy(v.target);
    controls.update();
  }
  for (const b of panel.querySelectorAll('button[data-view]'))
    b.classList.toggle('on', (b as HTMLElement).dataset.view === id);
}

// ---------------------------------------------------------------- UI

const ui = document.getElementById('ui')!;
ui.insertAdjacentHTML(
  'beforeend',
  `<div class="farm-title">The racetrack's look<small>Draft for approval · the first stretch, in glass</small></div>
   <div class="farm-panel" id="panel"></div>
   <div class="farm-help">Drag to look around in the fixed views. The kart rides the track on its own.</div>`,
);
const panel = document.getElementById('panel')!;
const add = (label: string, data: Record<string, string>, fn: () => void) => {
  const b = document.createElement('button');
  b.textContent = label;
  Object.assign(b.dataset, data);
  b.addEventListener('click', fn);
  panel.append(b);
  return b;
};
add('🏎 Ride along', { view: 'ride' }, () => setView('ride'));
for (const [id, v] of Object.entries(VIEWS)) if (v) add(v.name, { view: id }, () => setView(id));
panel.append(Object.assign(document.createElement('div'), { className: 'sep' }));
const STYLES: [GlassStyle, string][] = [
  ['clear', 'Glass: clear'],
  ['smoky', 'Glass: smoky'],
  ['frosted', 'Glass: frosted'],
];
function setStyle(s: GlassStyle): void {
  look.setStyle(s);
  for (const b of panel.querySelectorAll('button[data-style]'))
    b.classList.toggle('on', (b as HTMLElement).dataset.style === s);
}
for (const [s, label] of STYLES) add(label, { style: s }, () => setStyle(s));

const q = new URLSearchParams(location.search).get('style') as GlassStyle | null;
setStyle(q && ['clear', 'smoky', 'frosted'].includes(q) ? q : 'clear');
setView(location.hash.slice(1) in VIEWS ? location.hash.slice(1) : 'ride');

// ---------------------------------------------------------------- loop

const chase = {
  pos: new THREE.Vector3(),
  look: new THREE.Vector3(),
  up: new THREE.Vector3(0, 1, 0),
  init: false,
};
function rideCam(dt: number): void {
  const fw = new THREE.Vector3(0, 0, -1).applyQuaternion(kart.root.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(kart.root.quaternion);
  const want = kart.root.position.clone().addScaledVector(fw, -11).addScaledVector(up, 4);
  const lookAt = kart.root.position.clone().addScaledVector(fw, 8).addScaledVector(up, 1.2);
  const k = chase.init ? 1 - Math.exp(-dt * 5) : 1;
  chase.pos.lerp(want, k);
  chase.look.lerp(lookAt, k);
  chase.up.lerp(up, k).normalize();
  chase.init = true;
  camera.position.copy(chase.pos);
  camera.up.copy(chase.up);
  camera.lookAt(chase.look);
}

let last = performance.now(),
  t = 0;
function frame(now: number): void {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  step(dt);
  view.render(farm.scene, [{ x: 0, y: 0, w: 1, h: 1, camera }]);
  requestAnimationFrame(frame);
}
function step(dt: number): void {
  t += dt;
  u = (u + SPEED * dt) % total;
  placeKart(u);
  kart.model.userData.animate?.(t, SPEED * S, dt);
  if (mode === 'ride') rideCam(dt);
  else {
    camera.up.set(0, 1, 0);
    controls.update();
  }
  farm.focusSun(mode === 'ride' ? kart.root.position : controls.target, 400);
  farm.update(dt, camera);
}
requestAnimationFrame(frame);

// For screenshots: put the kart somewhere along the stretch and step the clock by hand.
(window as unknown as { __track: unknown }).__track = {
  farm,
  camera,
  controls,
  setView,
  setStyle,
  total,
  seek: (d: number) => {
    u = d;
    chase.init = false;
    step(0.016);
  },
  step,
};
