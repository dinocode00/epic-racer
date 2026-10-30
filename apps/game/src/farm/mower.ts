import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvasTex, leatherBump } from './grandpa/kit.ts';

/**
 * Grandpa's lawn tractor, in the style of a late-1990s AGCO Allis (the Simplicity-built 1600
 * series, e.g. the 1616H): Allis orange sheet metal, a long rounded hood sloping down to a
 * black grille with the headlights set in it, a black dash and steering wheel on a raked
 * column, a black high-back seat on the fender pan, chunky turf tyres (20 in rear, 15 in
 * front), a 44 in mower deck slung between the axles with its discharge chute on the right,
 * and a plain black stripe down each side of the hood (no badging).
 *
 * Real metres, sitting on y = 0, facing -Z. `update(t, speed, steer)` spins the wheels,
 * turns the steering and shakes it with the engine.
 */

export interface Mower {
  group: THREE.Group;
  /** The seat cushion's top under the driver's hips: put the driver's group here. */
  seat: THREE.Object3D;
  /** The steering wheel (rim in its local x/z plane). */
  wheel: THREE.Object3D;
  wheelR: number;
  /** The footrests, in the seat's frame. */
  feet: [THREE.Vector3, THREE.Vector3];
  /** steer: -1 full left lock .. +1 full right lock. */
  update(t: number, speed: number, steer: number): void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Front wheels' angle at full lock (radians), and the wheelbase (m). */
export const MAX_LOCK = 0.85;
export const WHEELBASE = 1.2;

function decals() {
  // A plain black stripe with cream pinstripes along each side of the hood.
  const side = canvasTex(1024, 128, (x) => {
    x.clearRect(0, 0, 1024, 128);
    x.fillStyle = '#141414';
    x.beginPath();
    x.moveTo(0, 30);
    x.lineTo(1024, 30);
    x.lineTo(1024, 98);
    x.lineTo(0, 98);
    x.fill();
    x.fillStyle = '#e9e4d8';
    x.fillRect(0, 24, 1024, 4);
    x.fillRect(0, 100, 1024, 4);
  });
  side.wrapS = side.wrapT = THREE.ClampToEdgeWrapping;
  // Grille: black mesh with the headlights' bezels.
  const grille = canvasTex(256, 256, (x) => {
    x.fillStyle = '#121212';
    x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#2a2a2a';
    for (let j = 0; j < 16; j++)
      for (let i = 0; i < 16; i++)
        if ((i + j) % 2 === 0) x.fillRect(i * 16 + 2, j * 16 + 2, 12, 12);
  });
  return { side, grille };
}

export function buildMower(): Mower {
  const group = new THREE.Group();
  group.name = 'mower';
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const orange = std({ color: 0xd9601a, roughness: 0.35, metalness: 0.15 });
  const black = std({ color: 0x151515, roughness: 0.55 });
  const satin = std({ color: 0x222222, roughness: 0.4, metalness: 0.4 });
  const deckGrey = std({ color: 0x3a3c3e, roughness: 0.6, metalness: 0.3 });
  const steel = std({ color: 0x9a9da0, roughness: 0.35, metalness: 0.8 });
  const rubber = std({ color: 0x1b1b1b, roughness: 0.9 });
  const vinyl = std({ color: 0x161616, roughness: 0.5, bumpMap: leatherBump(), bumpScale: 0.4 });
  const lens = std({ color: 0xf6f0d8, roughness: 0.1, emissive: 0x332a10 });
  const D = decals();
  const stripe = std({ map: D.side, transparent: true, roughness: 0.4 });
  const grilleMat = std({ map: D.grille, roughness: 0.6 });
  const add = (o: THREE.Object3D) => {
    group.add(o);
    return o;
  };
  const box = (
    w: number,
    h: number,
    d: number,
    m: THREE.Material,
    x: number,
    y: number,
    z: number,
    r = 0.02,
  ) => {
    const b = new THREE.Mesh(
      new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)),
      m,
    );
    b.position.set(x, y, z);
    return add(b);
  };

  // ---- Wheels: chunky turf tyres with a shallow tread, steel-grey rims.
  const RR = 0.255,
    RW = 0.2,
    FR = 0.19,
    FW = 0.15;
  const tyre = (r: number, w: number) => {
    const g = new THREE.Group();
    // Rounded tyre section by lathe, with tread blocks.
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = -Math.PI / 2 + (i / 16) * Math.PI;
      prof.push(new THREE.Vector2(r * 0.62 + Math.cos(a) * (r * 0.38), (Math.sin(a) * w) / 2));
    }
    const t = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), rubber);
    t.rotation.z = Math.PI / 2;
    g.add(t);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      for (const s of [-1, 1]) {
        const lug = new THREE.Mesh(new THREE.BoxGeometry(w * 0.38, 0.02, 0.03), rubber);
        lug.position.set(
          s * w * 0.2,
          Math.cos(a + s * 0.06) * (r - 0.004),
          Math.sin(a + s * 0.06) * (r - 0.004),
        );
        lug.rotation.x = -a;
        lug.rotation.y = s * 0.35;
        g.add(lug);
      }
    }
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w * 0.82, 24), steel);
    rim.rotation.z = Math.PI / 2;
    g.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.18, r * 0.2, w * 0.95, 12), satin);
    hub.rotation.z = Math.PI / 2;
    g.add(hub);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, w, 6), steel);
      nut.rotation.z = Math.PI / 2;
      nut.position.set(0, Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32);
      g.add(nut);
    }
    return g;
  };
  const rearZ = 0.38,
    frontZ = -0.82,
    track = 0.36;
  const spinners: THREE.Object3D[] = [];
  const steerers: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const w = tyre(RR, RW);
    w.position.set(s * (track + 0.03), RR, rearZ);
    add(w);
    spinners.push(w);
    const pivot = new THREE.Group();
    pivot.position.set(s * (track - 0.05), FR, frontZ);
    const f = tyre(FR, FW);
    pivot.add(f);
    add(pivot);
    spinners.push(f);
    steerers.push(pivot);
  }
  // Axles and the frame.
  box(0.08, 0.06, 1.55, satin, -0.17, 0.27, -0.2, 0.01);
  box(0.08, 0.06, 1.55, satin, 0.17, 0.27, -0.2, 0.01);
  box(2 * track + 0.04, 0.06, 0.07, satin, 0, FR, frontZ, 0.015);
  box(0.62, 0.05, 0.08, satin, 0, RR, rearZ, 0.015);

  // ---- Mower deck: 44 in, slung between the axles, chute out to the right.
  const deck = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.6, 0.12, 40, 1), deckGrey);
  shell.scale.set(1, 1, 0.62);
  deck.add(shell);
  const rimD = new THREE.Mesh(new THREE.TorusGeometry(0.59, 0.015, 6, 48), deckGrey);
  rimD.rotation.x = Math.PI / 2;
  rimD.scale.set(1, 0.62, 1);
  rimD.position.y = -0.055;
  deck.add(rimD);
  for (const x of [-0.27, 0.27]) {
    const pul = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 20), satin);
    pul.position.set(x, 0.075, 0);
    deck.add(pul);
  }
  const chute = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.09, 0.22, 2, 0.02), black);
  chute.position.set(-0.66, -0.01, 0.05);
  chute.rotation.z = -0.25;
  deck.add(chute);
  for (const s of [-1, 1]) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 12), black);
    roller.rotation.z = Math.PI / 2;
    roller.position.set(s * 0.56, -0.03, -0.3);
    deck.add(roller);
  }
  deck.position.set(0, 0.11, -0.22);
  add(deck);

  // ---- Floor pans / footrests, running boards either side.
  for (const s of [-1, 1]) box(0.2, 0.025, 0.55, black, s * 0.29, 0.27, -0.15, 0.008);
  const feet: [THREE.Vector3, THREE.Vector3] = [V(-0.22, 0.285, -0.3), V(0.22, 0.285, -0.3)];

  // ---- Hood: long, rounded on top, sloping down to the grille; side panels with the stripe.
  {
    const hood = new THREE.Group();
    const len = 0.7;
    const prof = new THREE.Shape();
    // Side profile (z forward = -, y up), extruded across the width.
    prof.moveTo(0, 0.0);
    prof.lineTo(0, 0.4);
    prof.quadraticCurveTo(-0.02, 0.45, -0.12, 0.45);
    prof.lineTo(-len + 0.12, 0.4);
    prof.quadraticCurveTo(-len, 0.39, -len - 0.02, 0.3);
    prof.lineTo(-len + 0.04, 0.0);
    prof.closePath();
    const g = new THREE.ExtrudeGeometry(prof, {
      depth: 0.5,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 6,
      curveSegments: 16,
    });
    g.translate(0, 0, -0.25);
    g.rotateY(-Math.PI / 2); // shape x -> z (so -len runs forward), extrude -> x
    const shellM = new THREE.Mesh(g, orange);
    hood.add(shellM);
    // Grille and headlights on the nose.
    const gr = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.24), grilleMat);
    gr.position.set(0, 0.18, -len - 0.07);
    gr.rotation.y = Math.PI;
    gr.rotation.x = -0.18;
    hood.add(gr);
    for (const s of [-1, 1]) {
      const bez = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.07, 0.03, 2, 0.012), black);
      bez.position.set(s * 0.15, 0.36, -len - 0.04);
      hood.add(bez);
      const l = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.05, 0.02, 2, 0.01), lens);
      l.position.set(s * 0.15, 0.36, -len - 0.055);
      hood.add(l);
      // The stripe along each side.
      const st = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.087), stripe);
      st.position.set(s * 0.302, 0.3, -0.42);
      st.rotation.y = (s * Math.PI) / 2;
      if (s < 0) st.scale.x = 1;
      hood.add(st);
      // Louvres behind the stripe.
      for (let i = 0; i < 5; i++) {
        const lv = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.12), black);
        lv.position.set(s * 0.302, 0.17 - i * 0.025, -0.16);
        hood.add(lv);
      }
    }
    hood.position.set(0, 0.24, -0.36);
    add(hood);
  }
  // ---- Dash with the gauge panel, ignition and the raked steering column.
  const dash = box(0.5, 0.36, 0.14, black, 0, 0.82, -0.32, 0.04);
  void dash;
  box(0.3, 0.1, 0.05, satin, 0, 0.93, -0.25, 0.015);
  const key = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 10), steel);
  key.rotation.x = Math.PI / 2;
  key.position.set(0.1, 0.93, -0.22);
  add(key);
  // Throttle and lift levers on the fender pan.
  for (const [x, h] of [
    [0.27, 0.16],
    [-0.27, 0.13],
  ] as const) {
    const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, h, 8), steel);
    lever.position.set(x, 0.66 + h / 2, 0.02);
    lever.rotation.x = -0.25;
    add(lever);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), black);
    knob.position.set(x, 0.66 + h, 0.0);
    add(knob);
  }
  const column = new THREE.Group();
  column.position.set(0, 0.9, -0.24);
  column.rotation.x = 0.55; // raked back toward the driver
  add(column);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.24, 12), black);
  shaft.position.y = 0.12;
  column.add(shaft);
  const wheel = new THREE.Group();
  wheel.position.y = 0.25;
  column.add(wheel);
  const wheelR = 0.175;
  const rimW = new THREE.Mesh(new THREE.TorusGeometry(wheelR, 0.014, 10, 48), black);
  rimW.rotation.x = Math.PI / 2;
  wheel.add(rimW);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(wheelR, 0.012, 0.03), black);
    spoke.position.set((Math.cos(a) * wheelR) / 2, -0.01, (-Math.sin(a) * wheelR) / 2);
    spoke.rotation.y = a;
    wheel.add(spoke);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.03, 18), black);
  cap.position.y = -0.005;
  wheel.add(cap);
  const emblem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.004, 18), orange);
  emblem.position.y = 0.012;
  wheel.add(emblem);

  // ---- Fender pan over the rear wheels, and the high-back seat on its spring.
  {
    const pan = new THREE.Group();
    // A flat deck over the rear wheels, its edges rolled down, the seat on top.
    const top = new THREE.Mesh(new RoundedBoxGeometry(0.92, 0.05, 0.66, 4, 0.022), orange);
    top.position.set(0, 0.64, 0.36);
    pan.add(top);
    // Fenders arching over each tyre: a ring segment swept across the tyre's width.
    for (const s of [-1, 1]) {
      const arc = new THREE.Shape();
      const r0 = RR + 0.035,
        r1 = RR + 0.06,
        a0 = Math.PI * 0.08,
        a1 = Math.PI * 0.92;
      arc.absarc(0, 0, r1, a0, a1, false);
      arc.absarc(0, 0, r0, a1, a0, true);
      const g = new THREE.ExtrudeGeometry(arc, {
        depth: RW + 0.06,
        bevelEnabled: true,
        bevelThickness: 0.008,
        bevelSize: 0.008,
        bevelSegments: 2,
        curveSegments: 24,
      });
      g.translate(0, 0, -(RW + 0.06) / 2);
      g.rotateY(Math.PI / 2);
      const f = new THREE.Mesh(g, orange);
      f.position.set(s * (track + 0.03), RR, rearZ);
      pan.add(f);
    }
    // The pan's sides drop down between deck and fenders.
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.22, 0.6, 2, 0.01), orange);
      side.position.set(s * 0.27, 0.53, 0.36);
      pan.add(side);
    }
    add(pan);
  }
  const seat = new THREE.Group();
  {
    const s = new THREE.Group();
    // Cushion, rolled front edge, the high back with its roll, and the pivot bracket.
    const cushion = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.08, 0.42, 4, 0.035), vinyl);
    cushion.position.y = 0.04;
    s.add(cushion);
    const back = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.38, 0.07, 4, 0.03), vinyl);
    back.position.set(0, 0.24, 0.2);
    back.rotation.x = -0.18;
    s.add(back);
    for (let i = 0; i < 3; i++) {
      const pleat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.004, 0.004), black);
      pleat.position.set(0, 0.14 + i * 0.09, 0.163 - i * 0.016);
      pleat.rotation.x = -0.18;
      s.add(pleat);
    }
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.25), satin);
    bracket.position.set(0, -0.03, 0.02);
    s.add(bracket);
    s.position.set(0, 0.69, 0.32);
    add(s);
    // The driver's hips sit just above the cushion, a little forward of the back.
    seat.position.set(0, 0.77, 0.28);
    add(seat);
  }
  // Rear hitch plate and the light under the seat.
  box(0.24, 0.12, 0.02, satin, 0, 0.36, rearZ + 0.32, 0.005);

  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });

  let lastT = 0,
    roll = 0;
  const base = group.position.y;
  return {
    group,
    seat,
    wheel,
    wheelR,
    feet: feet.map((f) => f.clone().sub(seat.position)) as [THREE.Vector3, THREE.Vector3],
    update(t, speed, steer) {
      const dt = Math.min(0.1, Math.max(0, t - lastT));
      lastT = t;
      roll += (speed * dt) / RR;
      spinners.forEach((w, i) => (w.rotation.x = -roll * (i % 2 ? RR / FR : 1)));
      // The steering box: 2.4 rad at the wheel (most of a half turn) for full lock.
      for (const p of steerers) p.rotation.y = -steer * MAX_LOCK;
      wheel.rotation.y = -steer * 2.4;
      // Engine shake, and a little pitch and roll over the lawn.
      group.position.y = base + Math.sin(t * 53) * 0.0015 + Math.sin(t * 1.7) * 0.003 * speed;
      group.rotation.x = Math.sin(t * 1.3) * 0.006 * speed;
      group.rotation.z = Math.sin(t * 0.9 + 1) * 0.008 * speed;
    },
  };
}
