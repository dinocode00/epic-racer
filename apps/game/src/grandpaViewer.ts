import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildGrandpa } from './farm/grandpa.ts';
import { buildSky } from './render/scenery.ts';
import { View } from './render/view.ts';

/**
 * Character sheet for Grandpa before he goes on the farm: see him from every side, close up
 * on his face, gloves and boots, stand him beside a height stick, and watch his slow,
 * heel-dragging walk. Real metres throughout.
 *
 * Hash options: #walk #stand #turn, plus #face #feet #side #back for a starting view.
 */

const view = new View(document.getElementById('stage')!);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfe3f2);
const sunDir = new THREE.Vector3(0.55, 0.75, -0.65).normalize(); // in front of him, to one side
const sky = buildSky(0x3f86d9, 0xd9ebf6, sunDir);
sky.scale.setScalar(0.05);
scene.add(sky);
scene.add(new THREE.HemisphereLight(0xd6e8ff, 0x5a6b3a, 1.2));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.8);
sun.position.copy(sunDir).multiplyScalar(8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -3;
sun.shadow.camera.right = sun.shadow.camera.top = 3;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);

// A patch of mowed lawn that scrolls under him while he walks, so his feet read against it.
const grassTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#6fa645';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    x.fillStyle = ['#68a040', '#77ae4b', '#62973c', '#7bb352', '#5b8f37'][(Math.random() * 5) | 0]!;
    x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2 + Math.random() * 3);
  }
  x.fillStyle = 'rgba(255,255,230,0.08)';
  x.fillRect(0, 0, 256, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(6, 48).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }),
);
ground.receiveShadow = true;
scene.add(ground);

// Height stick: feet marked, with 6 ft and 6 ft 1 in picked out.
const FT = 0.3048;
const stick = new THREE.Group();
stick.add(
  new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 2.0, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8 }),
  ).translateY(1.0),
);
for (let f = 1; f <= 6; f++) {
  const mark = new THREE.Mesh(
    new THREE.BoxGeometry(f === 6 ? 0.16 : 0.09, 0.012, 0.06),
    new THREE.MeshStandardMaterial({ color: f === 6 ? 0xc0392b : 0x333333 }),
  );
  mark.position.y = f * FT;
  stick.add(mark);
}
const sixOne = new THREE.Mesh(
  new THREE.BoxGeometry(0.22, 0.012, 0.06),
  new THREE.MeshStandardMaterial({ color: 0x2d6cdf }),
);
sixOne.position.y = 6 * FT + 0.0254;
stick.add(sixOne);
stick.position.set(0.65, 0, 0);
stick.traverse((o) => ((o as THREE.Mesh).castShadow = true));
scene.add(stick);

const gp = buildGrandpa();
scene.add(gp.group);

const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.05, 100);
const controls = new OrbitControls(camera, view.renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.0, 0);
camera.position.set(1.6, 1.5, -4.2);

type Mode = 'stand' | 'walk' | 'turn';
let mode: Mode = 'turn';
const VIEWS: Record<string, [THREE.Vector3, THREE.Vector3]> = {
  full: [new THREE.Vector3(1.6, 1.4, -4.4), new THREE.Vector3(0.2, 0.95, 0)],
  face: [new THREE.Vector3(0.0, 1.72, -0.72), new THREE.Vector3(0, 1.69, 0)],
  face3q: [new THREE.Vector3(0.45, 1.74, -0.6), new THREE.Vector3(0, 1.69, 0)],
  side: [new THREE.Vector3(-4.2, 1.2, 0), new THREE.Vector3(0, 0.95, 0)],
  back: [new THREE.Vector3(-1.2, 1.4, 4.2), new THREE.Vector3(0, 0.95, 0)],
  feet: [new THREE.Vector3(-1.4, 0.35, -0.9), new THREE.Vector3(0, 0.15, 0)],
  hands: [new THREE.Vector3(-0.9, 1.0, -0.9), new THREE.Vector3(-0.2, 0.85, 0)],
};
function setView(name: string): void {
  const v = VIEWS[name];
  if (!v) return;
  camera.position.copy(v[0]);
  controls.target.copy(v[1]);
  controls.update();
}
function setMode(m: Mode): void {
  mode = m;
  if (m !== 'turn') gp.group.rotation.y = 0;
}

// Overlay.
const ui = document.getElementById('ui')!;
ui.innerHTML = `<div class="farm-title">Grandpa<small>6 ft 1 in · NPC for the farm · agree the look first</small></div>`;
const panel = document.createElement('div');
panel.className = 'farm-panel';
ui.appendChild(panel);
const btn = (label: string, fn: () => void) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', fn);
  panel.appendChild(b);
};
btn('Turn around', () => setMode('turn'));
btn('Walk', () => setMode('walk'));
btn('Stand', () => setMode('stand'));
btn('Whole', () => setView('full'));
btn('Face', () => setView('face'));
btn('Side', () => setView('side'));
btn('Back', () => setView('back'));
btn('Gloves', () => setView('hands'));
btn('Boots', () => setView('feet'));

const hash = location.hash.slice(1);
if (hash === 'walk' || hash === 'stand' || hash === 'turn') setMode(hash);
else if (VIEWS[hash]) (setView(hash), setMode('stand'));
else setView('full');

let t = 0,
  last = performance.now(),
  frozen = false;
function frame(now: number): void {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  if (!frozen) step(dt);
  controls.update();
  view.renderer.shadowMap.needsUpdate = true;
  view.render(scene, [{ x: 0, y: 0, w: 1, h: 1, camera }]);
  requestAnimationFrame(frame);
}
function step(dt: number): void {
  t += dt;
  const speed = mode === 'walk' ? gp.strollSpeed : 0;
  gp.animate(t, speed);
  if (mode === 'turn') gp.group.rotation.y += dt * 0.5;
  // The lawn slides back under his feet at his walking speed (he walks toward -z).
  grassTex.offset.y += (speed * dt * 6) / 12;
}
requestAnimationFrame(frame);

// For screenshots: freeze the clock and step it by hand.
(window as unknown as { __grandpa: unknown }).__grandpa = {
  gp,
  setMode,
  setView,
  camera,
  controls,
  freeze(on: boolean) {
    frozen = on;
  },
  step,
  rotate(a: number) {
    gp.group.rotation.y = a;
  },
};
