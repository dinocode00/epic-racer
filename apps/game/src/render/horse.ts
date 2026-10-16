import * as THREE from 'three';
import { DETAIL, MAT, type Ring, loftBody, tube } from './modelKit.ts';
import * as tex from './textures.ts';

/**
 * An anatomical horse on a galloping rig: lofted body, one continuous neck-and-head
 * sweep, jointed legs, strand mane and tail. Used by the Nazgûl, the Rohirrim and
 * Gandalf's cart pony. Faces -Z, hooves on y = 0.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const FWD = V(0, 0, -1);

let tatterTex: THREE.Texture | null = null;
/** White cloth with a ragged, torn lower edge and a few holes (used as an alpha map). */
export function tatters(): THREE.Texture {
  if (tatterTex) return tatterTex;
  tatterTex = tex.decal(
    (x, w, h) => {
      x.fillStyle = '#fff';
      x.fillRect(0, 0, w, h);
      x.fillStyle = '#000';
      x.beginPath();
      x.moveTo(0, h);
      for (let px = 0; px <= w; px += 6) {
        const depth = 12 + tex.rnd() * (tex.rnd() < 0.3 ? 110 : 45);
        x.lineTo(px, h - depth);
        x.lineTo(px + 3, h - 4 - tex.rnd() * 10);
      }
      x.lineTo(w, h);
      x.closePath();
      x.fill();
      for (let i = 0; i < 18; i++) {
        const side = i % 2 ? 0 : w;
        x.beginPath();
        x.ellipse(
          side,
          h * (0.45 + tex.rnd() * 0.5),
          4 + tex.rnd() * 8,
          6 + tex.rnd() * 14,
          0,
          0,
          Math.PI * 2,
        );
        x.fill();
      }
      for (let i = 0; i < 9; i++) {
        x.beginPath();
        x.ellipse(
          tex.rnd() * w,
          h * (0.5 + tex.rnd() * 0.35),
          2 + tex.rnd() * 5,
          4 + tex.rnd() * 9,
          tex.rnd(),
          0,
          Math.PI * 2,
        );
        x.fill();
      }
    },
    128,
    256,
  );
  return tatterTex;
}

export function ragMaterial(color = 0x15151a): THREE.MeshStandardMaterial {
  const m = DETAIL.fabric(color);
  m.alphaMap = tatters();
  m.alphaTest = 0.5;
  return m;
}

export function rag(w: number, h: number, segX = 4, segY = 8, color?: number): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, h, segX, segY).translate(0, -h / 2, 0);
  return new THREE.Mesh(g, ragMaterial(color));
}

export interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  front: boolean;
  offset: number;
}

/** Horse leg: muscled upper segment, knee/hock, slim cannon, fetlock, pastern, hoof. */
export function buildLeg(
  front: boolean,
  x: number,
  z: number,
  offset: number,
  coat: THREE.Material,
): Leg {
  const hip = new THREE.Group();
  hip.position.set(x, front ? 1.3 : 1.36, z);
  const upperLen = front ? 0.62 : 0.68;
  const upperRings: Ring[] = front
    ? [
        { t: 0, w: 0.1, h: 0.15 },
        { t: 0.35, w: 0.085, h: 0.12 },
        { t: 0.85, w: 0.05, h: 0.065 },
        { t: 1, w: 0.06, h: 0.07 },
      ]
    : [
        { t: 0, w: 0.13, h: 0.2 },
        { t: 0.4, w: 0.1, h: 0.14 },
        { t: 0.85, w: 0.05, h: 0.08 },
        { t: 1, w: 0.06, h: 0.08 },
      ];
  // Hind gaskins angle back; forearms hang straight.
  const upperCurve = new THREE.CatmullRomCurve3([
    V(0, 0, 0),
    V(0, -upperLen * 0.5, front ? 0 : 0.06),
    V(0, -upperLen, front ? 0.01 : 0.1),
  ]);
  hip.add(new THREE.Mesh(tube(upperCurve, upperRings, 14, 14, FWD), coat));
  const knee = new THREE.Group();
  knee.position.set(0, -upperLen, front ? 0.01 : 0.1);
  hip.add(knee);
  const lowerLen = front ? 0.62 : 0.6;
  const lowerCurve = new THREE.CatmullRomCurve3([
    V(0, 0, 0),
    V(0, -lowerLen * 0.7, 0),
    V(0, -lowerLen * 0.86, -0.04),
    V(0, -lowerLen, -0.09),
  ]);
  knee.add(
    new THREE.Mesh(
      tube(
        lowerCurve,
        [
          { t: 0, w: 0.055, h: 0.06 },
          { t: 0.15, w: 0.04, h: 0.05 },
          { t: 0.6, w: 0.036, h: 0.045 },
          { t: 0.75, w: 0.05, h: 0.058 }, // fetlock
          { t: 0.92, w: 0.04, h: 0.045 }, // pastern
          { t: 1, w: 0.05, h: 0.05 },
        ],
        16,
        12,
        FWD,
      ),
      coat,
    ),
  );
  // Feathering at the fetlock and a dark hoof.
  const feather = new THREE.Mesh(
    new THREE.ConeGeometry(0.075, 0.16, 10, 1, true),
    ragMaterial(0x101014),
  );
  feather.position.set(0, -lowerLen * 0.82, -0.02);
  knee.add(feather);
  const hoof = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.07, 0.08, 14),
    MAT.paint(0x141416, 0.55, 0.3),
  );
  hoof.position.set(0, -lowerLen - 0.035, -0.1);
  knee.add(hoof);
  return { hip, knee, front, offset };
}

export interface HorseOpts {
  coat: number;
  mane?: number;
  /** Glowing eye colour (Nazgûl steeds), or none. */
  eyes?: number | null;
  /** Spiked steel face plate. */
  armor?: boolean;
  /** Ragged cloth hanging from the saddle, in this colour. */
  barding?: number | null;
  /** Glowing trim behind the saddle (player colour). */
  trim?: number | null;
  saddle?: boolean;
}

export interface Horse {
  rig: THREE.Group;
  /** World-in-rig position of the bit, for reins. */
  bit: THREE.Vector3;
  mane: THREE.Mesh[];
  animate: (t: number, speed: number, dt: number) => void;
}

export function buildHorse(o: HorseOpts): Horse {
  const rig = new THREE.Group(); // bobs and pitches with the gallop
  const coat = DETAIL.coat(o.coat);
  const steel = DETAIL.steel();

  // ---------------- Horse body ----------------
  const torso = new THREE.Mesh(
    loftBody(
      [
        { z: 1.05, w: 0.1, top: 1.7, bottom: 1.56 },
        { z: 0.95, w: 0.28, top: 1.82, bottom: 1.26 },
        { z: 0.6, w: 0.37, top: 1.84, bottom: 1.12 },
        { z: 0.15, w: 0.37, top: 1.76, bottom: 1.06 },
        { z: -0.3, w: 0.36, top: 1.8, bottom: 1.1 },
        { z: -0.7, w: 0.31, top: 1.92, bottom: 1.18 },
        { z: -0.92, w: 0.22, top: 1.86, bottom: 1.3 },
        { z: -1.0, w: 0.08, top: 1.74, bottom: 1.48 },
      ],
      0,
      0.2,
      36,
      0.92,
    ),
    coat,
  );
  rig.add(torso);
  for (const sx of [-1, 1]) {
    const haunch = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), coat);
    haunch.scale.set(0.16, 0.34, 0.38);
    haunch.position.set(sx * 0.22, 1.5, 0.66);
    rig.add(haunch);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), coat);
    shoulder.scale.set(0.13, 0.36, 0.22);
    shoulder.position.set(sx * 0.21, 1.56, -0.66);
    shoulder.rotation.x = 0.35;
    rig.add(shoulder);
  }

  // ---------------- Neck and head: one continuous sweep ----------------
  const neckCurve = new THREE.CatmullRomCurve3([
    V(0, 1.62, -0.78),
    V(0, 1.98, -1.02),
    V(0, 2.34, -1.24),
    V(0, 2.56, -1.4),
    V(0, 2.44, -1.62),
    V(0, 2.2, -1.86),
    V(0, 2.02, -1.98),
  ]);
  const neck = new THREE.Mesh(
    tube(
      neckCurve,
      [
        { t: 0, w: 0.28, h: 0.36 },
        { t: 0.18, w: 0.2, h: 0.3, dy: 0.02 },
        { t: 0.42, w: 0.14, h: 0.2, dy: 0.02 },
        { t: 0.52, w: 0.12, h: 0.15 }, // poll
        { t: 0.6, w: 0.15, h: 0.18, dy: -0.04 }, // cheeks / jaw
        { t: 0.75, w: 0.115, h: 0.13, dy: -0.01 },
        { t: 0.9, w: 0.1, h: 0.105 },
        { t: 0.97, w: 0.095, h: 0.1 }, // muzzle
        { t: 1, w: 0.04, h: 0.04 },
      ],
      48,
      20,
      V(0, 1, 0.3).normalize(),
    ),
    coat,
  );
  rig.add(neck);
  const headAt = (t: number) => neckCurve.getPointAt(t);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.17, 8), coat);
    ear.position.copy(headAt(0.53)).add(V(s * 0.07, 0.13, 0.02));
    ear.rotation.set(0.25, 0, -s * 0.2);
    rig.add(ear);
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 10, 8),
      MAT.glow(o.eyes ?? 0x000000, o.eyes ? 3 : 0),
    );
    eye.position.copy(headAt(0.62)).add(V(s * 0.13, 0.04, 0));
    rig.add(eye);
    const nostril = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 8, 6),
      MAT.paint(0x050505, 0.9, 0),
    );
    nostril.position.copy(headAt(0.97)).add(V(s * 0.05, 0.02, -0.06));
    rig.add(nostril);
  }
  // Spiked steel chanfron along the face, with a crest spike.
  if (o.armor) {
    const faceTop = new THREE.CatmullRomCurve3([
      headAt(0.55).add(V(0, 0.13, 0)),
      headAt(0.75).add(V(0, 0.12, 0)),
      headAt(0.92).add(V(0, 0.1, 0)),
    ]);
    rig.add(
      new THREE.Mesh(
        tube(
          faceTop,
          [
            { t: 0, w: 0.1, h: 0.025 },
            { t: 1, w: 0.07, h: 0.02 },
          ],
          10,
          10,
          V(0, 1, 0),
        ),
        steel,
      ),
    );
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.24, 8), steel);
    spike.position.copy(headAt(0.56)).add(V(0, 0.2, -0.02));
    spike.rotation.x = -0.5;
    rig.add(spike);
  }
  // Bridle and bit.
  const bit = headAt(0.94);
  for (const s of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 12), steel);
    ring.position.copy(bit).add(V(s * 0.1, -0.04, 0));
    ring.rotation.y = Math.PI / 2;
    rig.add(ring);
  }

  // Mane: many fine strands along the crest. Tail: a bundle of wavy strands.
  const mane: THREE.Mesh[] = [];
  const maneMat = ragMaterial(o.mane ?? 0x0c0c10);
  for (let i = 0; i < 26; i++) {
    const t = 0.06 + (i / 25) * 0.42;
    const p = neckCurve.getPointAt(t);
    const len = 0.22 + tex.rnd() * 0.22;
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(0.05, len, 1, 3).translate(0, -len / 2, 0),
      maneMat,
    );
    strip.position.copy(p).add(V(0.03, 0.26 - t * 0.25, 0.02));
    strip.rotation.set(-0.4, tex.rnd() * 0.5, 0.6 + tex.rnd() * 0.3);
    rig.add(strip);
    mane.push(strip);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 1.74, 1.02);
  rig.add(tail);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const spread = 0.05 + tex.rnd() * 0.06;
    const len = 1.0 + tex.rnd() * 0.4;
    const pts = [
      V(0, 0, 0),
      V(Math.cos(a) * spread, -len * 0.35, 0.12),
      V(Math.cos(a) * spread * 2 + (tex.rnd() - 0.5) * 0.1, -len * 0.7, 0.18),
      V(Math.cos(a) * spread * 2.5, -len, 0.16),
    ];
    const strand = new THREE.Mesh(
      tube(
        new THREE.CatmullRomCurve3(pts),
        [
          { t: 0, w: 0.035, h: 0.035 },
          { t: 0.6, w: 0.025, h: 0.03 },
          { t: 1, w: 0.004, h: 0.004 },
        ],
        10,
        6,
        FWD,
      ),
      coat,
    );
    tail.add(strand);
  }

  // Saddle, girth, and ragged barding in the player's colour trim.
  if (o.saddle !== false) {
    const saddle = new THREE.Mesh(
      tube(
        new THREE.CatmullRomCurve3([V(0, 1.86, 0.32), V(0, 1.84, -0.05), V(0, 1.9, -0.38)]),
        [
          { t: 0, w: 0.3, h: 0.07, dy: 0.04 },
          { t: 0.5, w: 0.27, h: 0.05 },
          { t: 1, w: 0.2, h: 0.09, dy: 0.05 },
        ],
        12,
        16,
      ),
      MAT.paint(0x2a1d16, 0.6, 0.1),
    );
    rig.add(saddle);
    const girth = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.025, 6, 30),
      MAT.paint(0x2a1d16, 0.7, 0),
    );
    girth.position.set(0, 1.48, -0.25);
    girth.rotation.y = Math.PI / 2;
    girth.scale.set(1, 1.0, 0.92);
    rig.add(girth);
    if (o.trim !== undefined && o.trim !== null) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.05), MAT.glow(o.trim, 1.2));
      trim.position.set(0, 1.83, 0.42);
      rig.add(trim);
    }
    for (const s of [-1, 1]) {
      if (o.barding !== undefined && o.barding !== null) {
        const drape = rag(1.0, 0.6, 6, 5, o.barding);
        drape.position.set(s * 0.37, 1.84, 0.02);
        drape.rotation.y = (s * Math.PI) / 2;
        drape.rotation.z = s * -0.06;
        rig.add(drape);
      }
      // Stirrup.
      const stirrup = new THREE.Mesh(
        new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI * 1.4),
        steel,
      );
      stirrup.position.set(s * 0.45, 1.3, -0.15);
      stirrup.rotation.y = Math.PI / 2;
      rig.add(stirrup);
    }
  }
  // Legs.
  const legs: Leg[] = [
    buildLeg(true, -0.19, -0.66, 0.5, coat),
    buildLeg(true, 0.19, -0.66, 0.62, coat),
    buildLeg(false, -0.19, 0.68, 0.0, coat),
    buildLeg(false, 0.19, 0.68, 0.1, coat),
  ];
  legs.forEach((l) => rig.add(l.hip));

  rig.traverse((m) => {
    m.castShadow = true;
    m.receiveShadow = true;
  });
  mane.forEach((m) => (m.castShadow = false));

  let phase = 0;
  let gait = 0;
  const animate = (t: number, speed: number, dt: number): void => {
    const v = Math.abs(speed);
    gait += ((v > 0.8 ? 1 : 0) - gait) * Math.min(1, dt * 4);
    phase = (phase + dt * Math.min(2.6, 0.6 + v / 5)) % 1;
    for (const l of legs) {
      const a = 2 * Math.PI * (phase + l.offset);
      l.hip.rotation.x = Math.sin(a) * (l.front ? 0.6 : 0.52) * gait;
      const fold = Math.max(0, Math.cos(a)) * gait;
      l.knee.rotation.x = l.front ? -fold * 1.35 : fold * 1.0;
    }
    rig.position.y = Math.sin(phase * 4 * Math.PI) * 0.05 * gait;
    rig.rotation.x = Math.sin(phase * 2 * Math.PI) * 0.045 * gait;
    tail.rotation.x = 0.35 + Math.min(1, v / 30) * 0.9 + Math.sin(t * 7) * 0.08;
    tail.rotation.z = Math.sin(t * 3.3) * 0.12;
    mane.forEach((m, i) => (m.rotation.z = 0.6 + Math.sin(t * 9 + i * 0.7) * 0.25 * (0.3 + gait)));
  };
  animate(0, 0, 0);
  return { rig, bit, mane, animate };
}
