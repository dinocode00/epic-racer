import * as THREE from 'three';
import { DETAIL, MAT, foldedLathe, loftBody, tube } from './modelKit.ts';
import { buildHorse } from './horse.ts';
import * as tex from './textures.ts';

/** Film characters as scenery and hazards. All face -Z, standing on y = 0. */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function shadows(g: THREE.Object3D): void {
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
}

// ---------------------------------------------------------------- Gandalf the Grey

/** Gandalf, seated (on his cart) or standing (on the bridge, staff raised). */
export function gandalf(pose: 'seated' | 'standing'): { group: THREE.Group; staff: THREE.Group } {
  const g = new THREE.Group();
  const grey = DETAIL.fabric(0x8a8a86);
  grey.side = THREE.FrontSide;
  const darkGrey = DETAIL.fabric(0x6e6e6a);
  const skin = MAT.skin();
  const beardMat = new THREE.MeshStandardMaterial({
    color: 0xd8d6cf,
    roughness: 1,
    bumpMap: tex.coatBump(),
    bumpScale: 1.5,
  });
  const H = pose === 'seated' ? 0.55 : 0;
  // Robe (long and flowing when standing).
  const robe = new THREE.Mesh(
    foldedLathe(
      pose === 'standing'
        ? [
            [0.5, 0],
            [0.42, 0.4],
            [0.3, 1.0],
            [0.26, 1.35],
            [0.3, 1.55],
            [0.14, 1.66],
            [0.0, 1.68],
          ]
        : [
            [0.42, 0.55],
            [0.3, 1.0],
            [0.26, 1.35],
            [0.3, 1.55],
            [0.14, 1.66],
            [0.0, 1.68],
          ],
      12,
      0.08,
      40,
    ),
    grey,
  );
  g.add(robe);
  if (pose === 'seated') {
    // Knees and legs forward, over the seat edge.
    for (const s of [-1, 1]) {
      const thigh = new THREE.Mesh(
        tube(
          new THREE.CatmullRomCurve3([
            V(s * 0.15, 0.62, 0),
            V(s * 0.16, 0.6, -0.45),
            V(s * 0.16, 0.2, -0.55),
          ]),
          [
            { t: 0, w: 0.14, h: 0.14 },
            { t: 1, w: 0.1, h: 0.1 },
          ],
          12,
          10,
          V(0, 0, -1),
        ),
        grey,
      );
      g.add(thigh);
    }
  }
  // Cloak over the shoulders.
  const cloak = new THREE.Mesh(
    foldedLathe(
      [
        [0.36, 0.7 + H * 0.3],
        [0.34, 1.2],
        [0.3, 1.52],
        [0.16, 1.62],
      ],
      10,
      0.1,
      30,
      Math.PI * 0.3,
      Math.PI * 1.4,
    ),
    darkGrey,
  );
  g.add(cloak);
  // Head, long beard and hair.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 14), skin);
  head.position.set(0, 1.78, -0.02);
  head.scale.set(0.9, 1.1, 1);
  g.add(head);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 8).rotateX(-Math.PI / 2), skin);
  nose.position.set(0, 1.78, -0.14);
  g.add(nose);
  const beard = new THREE.Mesh(
    tube(
      new THREE.CatmullRomCurve3([V(0, 1.74, -0.09), V(0, 1.55, -0.16), V(0, 1.28, -0.2)]),
      [
        { t: 0, w: 0.12, h: 0.06 },
        { t: 0.4, w: 0.13, h: 0.07 },
        { t: 1, w: 0.02, h: 0.02 },
      ],
      14,
      12,
      V(0, 0, -1),
    ),
    beardMat,
  );
  g.add(beard);
  const hair = new THREE.Mesh(
    foldedLathe(
      [
        [0.14, 1.5],
        [0.15, 1.7],
        [0.12, 1.85],
      ],
      14,
      0.15,
      24,
      Math.PI * 0.4,
      Math.PI * 1.2,
    ),
    beardMat,
  );
  g.add(hair);
  // The pointed hat with its wide, drooping brim.
  const hatMat = DETAIL.fabric(0x7c7a74);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.03, 32), hatMat);
  brim.position.set(0, 1.88, -0.02);
  brim.rotation.x = 0.12;
  g.add(brim);
  const crown = new THREE.Mesh(
    tube(
      new THREE.CatmullRomCurve3([
        V(0, 1.88, 0),
        V(0, 2.2, 0.03),
        V(0.03, 2.5, 0.12),
        V(0.08, 2.62, 0.25),
      ]),
      [
        { t: 0, w: 0.14, h: 0.14 },
        { t: 0.5, w: 0.08, h: 0.08 },
        { t: 1, w: 0.01, h: 0.01 },
      ],
      16,
      14,
      V(0, 0, -1),
    ),
    hatMat,
  );
  g.add(crown);
  // Arms and the staff in the right hand.
  const staff = new THREE.Group();
  const shaftCurve = new THREE.CatmullRomCurve3([
    V(0, -1.0, 0),
    V(0.02, 0, 0.01),
    V(-0.02, 0.8, 0),
    V(0.05, 1.05, 0),
    V(0.12, 1.12, 0.02),
    V(0.08, 1.02, 0.05),
  ]);
  staff.add(
    new THREE.Mesh(new THREE.TubeGeometry(shaftCurve, 30, 0.028, 8), MAT.paint(0x5a4028, 0.8, 0)),
  );
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(
      tube(
        new THREE.CatmullRomCurve3([
          V(s * 0.27, 1.5, 0),
          V(s * 0.33, 1.2, -0.12),
          V(s * 0.22, 1.05, -0.38),
        ]),
        [
          { t: 0, w: 0.09, h: 0.09 },
          { t: 0.7, w: 0.11, h: 0.11 },
          { t: 1, w: 0.05, h: 0.05 },
        ],
        14,
        10,
        V(0, 0, -1),
      ),
      grey,
    );
    g.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skin);
    hand.position.set(s * 0.22, 1.05, -0.4);
    g.add(hand);
  }
  staff.position.set(0.22, 1.05, -0.4);
  staff.rotation.x = pose === 'seated' ? -0.5 : 0;
  g.add(staff);
  shadows(g);
  return { group: g, staff };
}

/** Gandalf's cart, loaded with fireworks, pulled by a grey pony. */
export function gandalfCart(): {
  group: THREE.Group;
  animate: (t: number, speed: number, dt: number) => void;
} {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: tex.planks(), roughness: 0.85 });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 2.2), wood);
  bed.position.set(0, 0.95, 0.6);
  g.add(bed);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 2.2), wood);
    side.position.set(s * 0.75, 1.25, 0.6);
    g.add(side);
    const wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 8, 24), wood);
    rim.rotation.y = Math.PI / 2;
    wheel.add(rim);
    for (let k = 0; k < 6; k++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.15, 0.04), wood);
      spoke.rotation.x = (k / 6) * Math.PI;
      wheel.add(spoke);
    }
    wheel.position.set(s * 0.85, 0.6, 0.9);
    g.add(wheel);
  }
  // Firework crates: bundles of colourful rockets.
  for (let i = 0; i < 4; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), wood);
    crate.position.set(i % 2 ? 0.35 : -0.35, 1.3, 0.9 + Math.floor(i / 2) * 0.55);
    g.add(crate);
    for (let k = 0; k < 5; k++) {
      const rocket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8),
        MAT.paint([0xd8292b, 0x2f7de1, 0xf5c518, 0x3fbf5f][(i + k) % 4]!, 0.5, 0),
      );
      rocket.position.copy(crate.position).add(V((k - 2) * 0.08, 0.35, (k % 2) * 0.1));
      g.add(rocket);
    }
  }
  const wizard = gandalf('seated');
  wizard.group.position.set(0, 0.6, 0.0);
  g.add(wizard.group);
  // Shafts and the pony.
  for (const s of [-1, 1]) {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), wood);
    shaft.rotation.x = Math.PI / 2 - 0.15;
    shaft.position.set(s * 0.45, 0.95, -1.4);
    g.add(shaft);
  }
  const pony = buildHorse({ coat: 0x8f8a84, mane: 0xd8d4cc, saddle: false });
  pony.rig.scale.setScalar(0.72);
  pony.rig.position.set(0, 0, -2.4);
  g.add(pony.rig);
  shadows(g);
  return { group: g, animate: (t, speed, dt) => pony.animate(t, speed, dt) };
}

// ---------------------------------------------------------------- the Balrog

let lavaCracks: THREE.Texture | null = null;

/** The Balrog of Moria: shadow and flame, horns, smoky wings, fire whip. ~11 m tall. */
export function balrog(): {
  group: THREE.Group;
  whipHand: THREE.Object3D;
  animate: (t: number) => void;
} {
  const g = new THREE.Group();
  lavaCracks ??= tex.volcanicGlow();
  const hide = new THREE.MeshStandardMaterial({
    color: 0x1a1210,
    roughness: 0.8,
    emissive: 0xff5a14,
    emissiveMap: lavaCracks,
    emissiveIntensity: 1.6,
    bumpMap: tex.steelBump(),
    bumpScale: 3,
  });
  // Torso: lofted from hips to massive shoulders.
  const torso = new THREE.Mesh(
    loftBody(
      [
        { z: 0, w: 0.9, top: 0.6, bottom: -0.6 },
        { z: -2, w: 1.4, top: 0.9, bottom: -0.8 },
        { z: -3.6, w: 2.2, top: 1.2, bottom: -0.9 },
        { z: -4.4, w: 1.2, top: 0.8, bottom: -0.6 },
      ],
      0,
      0.2,
      28,
      0.9,
    ),
    hide,
  );
  torso.rotation.x = -Math.PI / 2; // loft z -> up
  torso.position.y = 5;
  g.add(torso);
  // Legs (digitigrade) and arms.
  for (const s of [-1, 1]) {
    g.add(
      new THREE.Mesh(
        tube(
          new THREE.CatmullRomCurve3([
            V(s * 0.7, 5, 0),
            V(s * 1.0, 3, -0.8),
            V(s * 1.1, 1.6, 0.6),
            V(s * 1.1, 0, -0.2),
          ]),
          [
            { t: 0, w: 0.7, h: 0.8 },
            { t: 0.5, w: 0.45, h: 0.5 },
            { t: 1, w: 0.3, h: 0.35 },
          ],
          20,
          12,
          V(0, 0, -1),
        ),
        hide,
      ),
    );
  }
  const shoulderL = V(-2.0, 8.6, 0),
    shoulderR = V(2.0, 8.6, 0);
  const handL = V(-3.4, 6.2, -1.6),
    handR = V(3.6, 9.4, -0.8);
  for (const [sh, hd] of [
    [shoulderL, handL],
    [shoulderR, handR],
  ] as const) {
    const elbow = sh
      .clone()
      .lerp(hd, 0.5)
      .add(V(Math.sign(sh.x) * 0.8, -0.6, 0.4));
    g.add(
      new THREE.Mesh(
        tube(
          new THREE.CatmullRomCurve3([sh, elbow, hd]),
          [
            { t: 0, w: 0.6, h: 0.6 },
            { t: 0.5, w: 0.42, h: 0.42 },
            { t: 1, w: 0.28, h: 0.28 },
          ],
          16,
          12,
          V(0, 0, -1),
        ),
        hide,
      ),
    );
  }
  const whipHand = new THREE.Object3D();
  whipHand.position.copy(handR);
  g.add(whipHand);
  // Head: bull-like skull, burning eyes, great curved horns.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 16), hide);
  head.scale.set(1, 0.9, 1.3);
  head.position.set(0, 10.0, -0.6);
  g.add(head);
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(
      tube(
        new THREE.CatmullRomCurve3([
          V(s * 0.6, 10.4, -0.5),
          V(s * 1.7, 11.2, -0.2),
          V(s * 2.3, 10.6, -1.2),
          V(s * 2.0, 10.0, -2.0),
        ]),
        [
          { t: 0, w: 0.3, h: 0.3 },
          { t: 1, w: 0.02, h: 0.02 },
        ],
        20,
        10,
      ),
      MAT.paint(0x2a2420, 0.6, 0.2),
    );
    g.add(horn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), MAT.glow(0xffc040, 5));
    eye.position.set(s * 0.4, 10.1, -1.6);
    g.add(eye);
  }
  const maw = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), MAT.glow(0xff6a10, 4));
  maw.scale.set(1.2, 0.4, 0.6);
  maw.position.set(0, 9.6, -1.6);
  g.add(maw);
  // Wings of shadow: vast, smoky, translucent.
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0x0a0806,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    roughness: 1,
    emissive: 0x401006,
    emissiveIntensity: 0.4,
  });
  const wings: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(3, 4, 7, 6, 10, 5);
    for (let i = 0; i < 5; i++) shape.lineTo(10 - i * 2, 1 - (i % 2) * 2.2 - i * 0.3);
    shape.lineTo(0, -1);
    shape.closePath();
    const w = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), wingMat);
    w.scale.set(s, 1, 1);
    w.position.set(s * 1.2, 8.8, 0.8);
    w.rotation.y = s * -0.5;
    g.add(w);
    wings.push(w);
  }
  // Mane of fire: glowing flame tongues around head and shoulders.
  const flames: THREE.Mesh[] = [];
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xff7a1a,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (let i = 0; i < 26; i++) {
    const f = new THREE.Mesh(
      new THREE.ConeGeometry(0.35 + tex.rnd() * 0.3, 1.6 + tex.rnd() * 1.6, 8).translate(0, 0.8, 0),
      flameMat,
    );
    const a = tex.rnd() * Math.PI * 2;
    f.position.set(Math.cos(a) * (1 + tex.rnd() * 1.4), 9 + tex.rnd() * 2, Math.sin(a) * 1.2 + 0.4);
    f.rotation.set((tex.rnd() - 0.5) * 0.6, 0, (tex.rnd() - 0.5) * 0.6);
    g.add(f);
    flames.push(f);
  }
  // A fiery glow so the chasm lights up.
  const glow = new THREE.PointLight(0xff6a20, 60, 60, 1.5);
  glow.position.set(0, 9, -2);
  g.add(glow);
  shadows(g);
  return {
    group: g,
    whipHand,
    animate: (t) => {
      flames.forEach((f, i) => (f.scale.y = 0.8 + Math.sin(t * 9 + i) * 0.25));
      wings.forEach((w, i) => (w.rotation.z = Math.sin(t * 1.3 + i) * 0.08));
      glow.intensity = 55 + Math.sin(t * 11) * 10;
    },
  };
}

// ---------------------------------------------------------------- Oliphaunt (mûmak)

export function oliphaunt(): { group: THREE.Group; animate: (t: number, walking: number) => void } {
  const g = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({
    color: 0x6e6258,
    roughness: 0.95,
    bumpMap: tex.steelBump(),
    bumpScale: 4,
  });
  const ivory = MAT.paint(0xe8dcc0, 0.5, 0.05);
  const body = new THREE.Mesh(
    loftBody(
      [
        { z: 5.5, w: 1.6, top: 8.8, bottom: 6.6 },
        { z: 4.5, w: 3.0, top: 10.4, bottom: 5.4 },
        { z: 1.5, w: 3.4, top: 10.8, bottom: 4.9 },
        { z: -1.5, w: 3.2, top: 11.2, bottom: 5.2 },
        { z: -3.8, w: 2.6, top: 11.4, bottom: 6.2 },
        { z: -4.8, w: 1.2, top: 10.6, bottom: 7.6 },
      ],
      0,
      0.2,
      28,
      0.9,
    ),
    hide,
  );
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(2.2, 20, 16), hide);
  head.scale.set(1, 1.05, 1.1);
  head.position.set(0, 10.4, -5.6);
  g.add(head);
  // Ears.
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CircleGeometry(2.0, 16), hide);
    (ear.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    ear.position.set(s * 2.0, 10.6, -4.6);
    ear.rotation.y = s * 1.1;
    ear.scale.set(1, 1.3, 1);
    g.add(ear);
  }
  // Trunk.
  const trunk = new THREE.Mesh(
    tube(
      new THREE.CatmullRomCurve3([
        V(0, 9.8, -7.4),
        V(0, 7.5, -8.4),
        V(0, 4.8, -8.2),
        V(0, 3.2, -7.4),
        V(0, 2.6, -7.9),
      ]),
      [
        { t: 0, w: 0.75, h: 0.75 },
        { t: 1, w: 0.28, h: 0.28 },
      ],
      24,
      12,
    ),
    hide,
  );
  g.add(trunk);
  // Four tusks: two huge upper, two lower.
  for (const s of [-1, 1]) {
    g.add(
      new THREE.Mesh(
        tube(
          new THREE.CatmullRomCurve3([
            V(s * 1.0, 9.0, -7.0),
            V(s * 1.6, 6.5, -9.5),
            V(s * 2.0, 6.8, -12),
            V(s * 2.2, 8.4, -13.4),
          ]),
          [
            { t: 0, w: 0.35, h: 0.35 },
            { t: 1, w: 0.04, h: 0.04 },
          ],
          24,
          10,
        ),
        ivory,
      ),
    );
    g.add(
      new THREE.Mesh(
        tube(
          new THREE.CatmullRomCurve3([
            V(s * 0.8, 8.0, -7.2),
            V(s * 1.3, 6.4, -8.6),
            V(s * 1.6, 6.6, -10),
          ]),
          [
            { t: 0, w: 0.22, h: 0.22 },
            { t: 1, w: 0.03, h: 0.03 },
          ],
          16,
          8,
        ),
        ivory,
      ),
    );
  }
  // Legs as pillars.
  const legs: THREE.Group[] = [];
  for (const [x, z] of [
    [-2.1, -3.0],
    [2.1, -3.0],
    [-2.1, 3.6],
    [2.1, 3.6],
  ] as const) {
    const hip = new THREE.Group();
    hip.position.set(x, 7, z);
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 0.9, 7, 14).translate(0, -3.5, 0),
      hide,
    );
    const foot = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.15, 0.6, 14).translate(0, -6.8, 0),
      hide,
    );
    hip.add(leg, foot);
    g.add(hip);
    legs.push(hip);
  }
  // War tower (howdah) with red banners.
  const wood = new THREE.MeshStandardMaterial({ map: tex.planks(), roughness: 0.85 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.4, 7), wood);
  deck.position.set(0, 11.6, 0);
  g.add(deck);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.4, 4, 6, 1, true), wood);
  (tower.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  tower.position.set(0, 13.8, -0.5);
  g.add(tower);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 2.4, 6), MAT.paint(0x8a1a14, 0.8, 0));
  roof.position.set(0, 17, -0.5);
  g.add(roof);
  for (const s of [-1, 1]) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3), MAT.paint(0xb8241c, 0.9, 0));
    (banner.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    banner.position.set(s * 2.9, 10.2, 0);
    banner.rotation.y = Math.PI / 2;
    g.add(banner);
    for (let k = 0; k < 4; k++) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.15, 1.2, 6),
        MAT.paint(0x2a2420, 0.6, 0.4),
      );
      spike.position.set(s * 2.75, 12.2, -2.6 + k * 1.7);
      g.add(spike);
    }
  }
  shadows(g);
  return {
    group: g,
    animate: (t, walking) => {
      legs.forEach(
        (l, i) =>
          (l.rotation.x = Math.sin(t * 2.2 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.22 * walking),
      );
      trunk.rotation.x = Math.sin(t * 1.3) * 0.05;
    },
  };
}

// ---------------------------------------------------------------- Rohirrim rider

export function rohirrim(): {
  group: THREE.Group;
  animate: (t: number, speed: number, dt: number) => void;
} {
  const g = new THREE.Group();
  const horse = buildHorse({
    coat: [0x6b4a2e, 0xc9c3b8, 0x3a2a1e][Math.floor(tex.rnd() * 3)]!,
    mane: 0x2a1d14,
  });
  g.add(horse.rig);
  const rider = new THREE.Group();
  rider.position.set(0, 1.9, -0.05);
  horse.rig.add(rider);
  const green = DETAIL.fabric(0x3a5a2a);
  green.side = THREE.FrontSide;
  const mail = DETAIL.steel(0x8a8a80);
  rider.add(
    new THREE.Mesh(
      foldedLathe(
        [
          [0.34, -0.1],
          [0.27, 0.2],
          [0.25, 0.45],
          [0.28, 0.58],
          [0.12, 0.68],
        ],
        10,
        0.06,
        28,
      ),
      mail,
    ),
  );
  const cloak = new THREE.Mesh(
    foldedLathe(
      [
        [0.4, -0.2],
        [0.33, 0.3],
        [0.3, 0.6],
      ],
      9,
      0.1,
      24,
      Math.PI * 0.6,
      Math.PI * 0.8,
    ),
    green,
  );
  rider.add(cloak);
  const helm = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 16, 12),
    MAT.paint(0xc9a43a, 0.3, 0.8),
  );
  helm.position.y = 0.84;
  rider.add(helm);
  const crest = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.12, 0.34),
    MAT.paint(0xf2efe6, 0.9, 0),
  );
  crest.position.y = 1.0;
  rider.add(crest);
  const shield = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.06, 20),
    MAT.paint(0x2f5a2a, 0.6, 0.2),
  );
  shield.rotation.z = Math.PI / 2;
  shield.position.set(-0.34, 0.4, 0);
  rider.add(shield);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), MAT.paint(0xd4a23a, 0.3, 1));
  boss.position.set(-0.38, 0.4, 0);
  rider.add(boss);
  const spear = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 3.2, 6),
    MAT.paint(0x6b4a2e, 0.8, 0),
  );
  spear.rotation.x = Math.PI / 2 - 0.25;
  spear.position.set(0.3, 0.55, -0.5);
  rider.add(spear);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 6), DETAIL.steel());
  tip.rotation.x = -Math.PI / 2 - 0.25;
  tip.position.set(0.3, 0.95, -2.1);
  rider.add(tip);
  shadows(g);
  return { group: g, animate: horse.animate };
}
