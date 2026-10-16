import * as THREE from 'three';
import type { Frame, Track, Vec3 } from '@epic/sim';
import { MAT } from '../modelKit.ts';
import * as tex from '../textures.ts';
import type { DressContext } from '../themes.ts';
import { off, sweep, tv } from '../trackMesh.ts';

/**
 * Moria: the Doors of Durin by the dark lake, the pillared halls of Dwarrowdelf,
 * Balin's tomb, the chasm and the Bridge of Khazad-dûm, the East Gate.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const smooth = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Section {
  half: number;
  height: number;
  /** Depth of the floor below the road (big = chasm). */
  floor: number;
}

export function dressMoria(ctx: DressContext): (t: number, dt: number) => void {
  const { scene, track } = ctx;
  const marks = track.def.marks ?? {};
  const [t0, t1] = track.def.tunnels?.[0] ?? [0, 0];
  const bridge0 = marks.khazadDum ?? t0,
    bridge1 = marks.moriaExit ?? t1;
  const corridor0 = (marks.dwarrowdelf ?? t0) + 230;

  // Cave cross-section along the halls.
  const section = (s: number): Section => {
    const hall = { half: 34, height: 36, floor: 0.2 };
    const corr = { half: 16, height: 20, floor: 0.2 };
    const chasm = { half: 44, height: 70, floor: 90 };
    const blend = (a: Section, b: Section, k: number): Section => ({
      half: a.half + (b.half - a.half) * k,
      height: a.height + (b.height - a.height) * k,
      floor: a.floor + (b.floor - a.floor) * k,
    });
    let sec = blend(hall, corr, smooth(s, corridor0 - 30, corridor0 + 30));
    sec = blend(
      sec,
      chasm,
      smooth(s, bridge0 - 25, bridge0 + 5) * (1 - smooth(s, bridge1 - 5, bridge1 + 20)),
    );
    // Narrow mouths at both gates.
    const mouth = Math.min(smooth(s, t0, t0 + 40), 1 - smooth(s, t1 - 40, t1));
    return blend({ half: 11, height: 13, floor: 0.2 }, sec, mouth);
  };

  const rockMat = new THREE.MeshStandardMaterial({
    map: tex.caveRock(),
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const P = (f: Frame, lat: number, h: number): Vec3 => off(f, lat, h);
  const cave = new THREE.Mesh(
    sweep(track, t0 - 4, t1 + 4, 2, 14, (f, s) => {
      const sec = section(s);
      const hw = f.width / 2;
      const inward = (lat: number, h: number) => {
        // Normal pointing back toward the road axis (so the inside is the front face).
        const n = V(-f.right.x * Math.sign(lat), 0, -f.right.z * Math.sign(lat));
        if (h > 0.5) n.add(V(0, -1, 0).multiplyScalar(h / sec.height));
        n.normalize();
        return { x: n.x, y: n.y, z: n.z };
      };
      const pts: [number, number][] = [
        [-hw - 0.8, -0.2],
        [-sec.half, -sec.floor],
        [-sec.half - 2, sec.height * 0.6],
        [-sec.half * 0.7, sec.height],
        [0, sec.height + 3],
        [sec.half * 0.7, sec.height],
        [sec.half + 2, sec.height * 0.6],
        [sec.half, -sec.floor],
        [hw + 0.8, -0.2],
      ];
      return pts.map(([lat, h], i) => ({
        p: P(f, lat, h),
        n: inward(lat || 0.01, h),
        u: (i / (pts.length - 1)) * 6,
      }));
    }),
    rockMat,
  );
  cave.receiveShadow = true;
  scene.add(cave);

  const animated: ((t: number) => void)[] = [];

  // ---------------- Dwarrowdelf: rows of colossal pillars into the dark.
  const stone = new THREE.MeshStandardMaterial({
    map: tex.dwarvenTiles(),
    roughness: 0.85,
    color: 0x8a8680,
  });
  const pillarGeo = new THREE.CylinderGeometry(1.6, 1.9, 40, 8).translate(0, 18, 0);
  const capGeo = new THREE.CylinderGeometry(4, 1.8, 5, 8).translate(0, 34, 0);
  const spots: THREE.Matrix4[] = [];
  for (let s = (marks.dwarrowdelf ?? t0) + 10; s < corridor0 - 20; s += 22)
    for (const lat of [-26, -16, 16, 26]) {
      const f = track.frameAtS(s);
      const p = P(f, lat, -0.2);
      spots.push(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
    }
  for (const geo of [pillarGeo, capGeo]) {
    const im = new THREE.InstancedMesh(geo, stone, spots.length);
    spots.forEach((m, i) => im.setMatrixAt(i, m));
    im.receiveShadow = true;
    scene.add(im);
  }
  // Glowing blue crystals scattered on the walls, for a cold underground light.
  const crystalMat = MAT.glow(0x5a98ff, 1.3);
  const crystals: THREE.Matrix4[] = [];
  for (let s = t0 + 10; s < t1 - 10; s += 7) {
    const f = track.frameAtS(s);
    const sec = section(s);
    if (sec.floor > 1) continue; // no floor to grow from over the chasm
    for (const side of [-1, 1]) {
      // Clusters at the foot of the walls, so none hang in mid-air.
      const p = P(f, side * (sec.half - 1), 0.4 + ((s * 7) % 3));
      crystals.push(
        new THREE.Matrix4().compose(
          V(p.x, p.y, p.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(s, s * 2, 0)),
          V(0.6, 1.4, 0.6),
        ),
      );
    }
  }
  const cim = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(1, 0),
    crystalMat,
    crystals.length,
  );
  crystals.forEach((m, i) => cim.setMatrixAt(i, m));
  scene.add(cim);
  // Cold lights along the halls.
  for (const s of [t0 + 60, (marks.dwarrowdelf ?? t0) + 160, corridor0 + 60]) {
    const l = new THREE.PointLight(0x7aa0ff, 120, 120, 1.4);
    l.position.copy(tv(P(track.frameAtS(s), 0, 22)));
    scene.add(l);
  }
  // Balin's tomb: a shaft of daylight on a stone tomb by the road.
  {
    const s = (marks.dwarrowdelf ?? t0) + 120;
    const f = track.frameAtS(s);
    const tomb = new THREE.Mesh(
      new THREE.BoxGeometry(3, 1.4, 5),
      new THREE.MeshStandardMaterial({ color: 0xcfcac0, roughness: 0.6 }),
    );
    tomb.position.copy(tv(P(f, -14, 0.5)));
    tomb.rotation.y = Math.atan2(f.tan.x, f.tan.z);
    scene.add(tomb);
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 4, 36, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff2d0,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    shaft.position.copy(tomb.position).add(V(0, 17, 0));
    scene.add(shaft);
    const sun = new THREE.SpotLight(0xfff2d0, 400, 60, 0.25, 0.5, 1);
    sun.position.copy(tomb.position).add(V(0, 34, 0));
    sun.target = tomb;
    scene.add(sun);
  }

  // ---------------- The chasm: fire glowing far below, embers rising.
  const mid = (bridge0 + bridge1) / 2;
  const fm = track.frameAtS(mid);
  const deep = new THREE.PointLight(0xff5a14, 900, 160, 1.3);
  deep.position.copy(tv(P(fm, 0, -60)));
  scene.add(deep);
  const lavaFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 200),
    new THREE.MeshBasicMaterial({ color: 0xff4a10 }),
  );
  lavaFloor.rotation.x = -Math.PI / 2;
  lavaFloor.position.copy(tv(P(fm, 0, -85)));
  scene.add(lavaFloor);
  animated.push((t) => (deep.intensity = 800 + Math.sin(t * 3) * 150));

  // ---------------- Doors of Durin: cliff, ithildin arch, the dark lake, holly trees.
  scene.add(gateCliff(track, t0, true));
  scene.add(gateCliff(track, t1, false));
  const doors0 = marks.doorsOfDurin ?? t0 - 70;
  const lake = new THREE.Mesh(
    sweep(track, doors0 - 20, t0 - 2, 4, 30, (f) => [
      { p: off(f, -70, -1.4), n: f.up, u: 0 },
      { p: off(f, -f.width / 2 - 1, -1.4), n: f.up, u: 1 },
    ]),
    new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.05, metalness: 0.6 }),
  );
  scene.add(lake);
  for (const side of [-1, 1]) {
    const f = track.frameAtS(t0 - 8);
    const p = tv(P(f, side * 13, 0));
    const holly = new THREE.Group();
    holly.add(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.8, 9, 8).translate(0, 4.5, 0),
        MAT.paint(0x3a2c22, 0.9, 0),
      ),
    );
    for (let k = 0; k < 5; k++)
      holly.add(
        new THREE.Mesh(
          new THREE.IcosahedronGeometry(2.4, 1).translate(
            Math.sin(k) * 1.5,
            8 + k * 1.2,
            Math.cos(k) * 1.5,
          ),
          new THREE.MeshStandardMaterial({ color: 0x1f3a24, flatShading: true, roughness: 0.8 }),
        ),
      );
    holly.position.copy(p);
    scene.add(holly);
  }

  return (t: number) => animated.forEach((a) => a(t));
}

let ithildin: THREE.Texture | null = null;
/** The silver tracery of the Doors of Durin: arch, pillars with trees, crown, stars, star of Fëanor. */
function ithildinTex(): THREE.Texture {
  if (ithildin) return ithildin;
  ithildin = tex.decal(
    (x, w, h) => {
      x.fillStyle = '#000';
      x.fillRect(0, 0, w, h);
      x.strokeStyle = '#dfefff';
      x.fillStyle = '#dfefff';
      x.lineWidth = 5;
      x.shadowColor = '#bfe0ff';
      x.shadowBlur = 12;
      const cx = w / 2;
      // Arch and pillars.
      x.beginPath();
      x.moveTo(cx - 170, h - 10);
      x.lineTo(cx - 170, 230);
      x.arc(cx, 230, 170, Math.PI, 0);
      x.lineTo(cx + 170, h - 10);
      x.stroke();
      x.beginPath();
      x.arc(cx, 230, 140, Math.PI, 0);
      x.stroke();
      // Two trees climbing the pillars.
      for (const s of [-1, 1]) {
        const px = cx + s * 150;
        x.beginPath();
        x.moveTo(px, h - 10);
        x.lineTo(px, 200);
        x.stroke();
        for (let k = 0; k < 6; k++) {
          x.beginPath();
          x.moveTo(px, 200 + k * 30);
          x.quadraticCurveTo(px - s * 30, 180 + k * 30, px - s * 50, 170 + k * 30);
          x.stroke();
        }
      }
      // Crown and seven stars above, star of Fëanor in the centre.
      for (let k = 0; k < 7; k++) {
        const a = Math.PI + ((k + 1) / 8) * Math.PI;
        x.beginPath();
        x.arc(cx + Math.cos(a) * 110, 230 + Math.sin(a) * 110, 7, 0, Math.PI * 2);
        x.fill();
      }
      x.beginPath();
      x.moveTo(cx - 40, 120);
      x.lineTo(cx - 25, 90);
      x.lineTo(cx, 110);
      x.lineTo(cx + 25, 90);
      x.lineTo(cx + 40, 120);
      x.closePath();
      x.stroke();
      x.save();
      x.translate(cx, 330);
      for (let k = 0; k < 8; k++) {
        x.rotate(Math.PI / 4);
        x.beginPath();
        x.moveTo(0, 0);
        x.lineTo(0, -60);
        x.stroke();
      }
      x.restore();
    },
    512,
    512,
  );
  return ithildin;
}

/** A cliff face across the road with an arched gateway for it. */
function gateCliff(track: Track, s: number, durin: boolean): THREE.Group {
  const g = new THREE.Group();
  const f = track.frameAtS(s);
  const W = 260,
    H = 120,
    gw = 11,
    gh = 13;
  const shape = new THREE.Shape(
    [V(-W / 2, -10, 0), V(W / 2, -10, 0), V(W / 2, H, 0), V(-W / 2, H, 0)].map(
      (v) => new THREE.Vector2(v.x, v.y),
    ),
  );
  const hole = new THREE.Path();
  hole.moveTo(-gw, -1);
  hole.lineTo(gw, -1);
  hole.lineTo(gw, gh - gw * 0.5);
  hole.absarc(0, gh - gw * 0.5, gw, 0, Math.PI, false);
  hole.lineTo(-gw, -1);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 24,
    bevelEnabled: false,
    curveSegments: 20,
  });
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 12, uv.getY(i) / 12);
  const cliff = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ map: tex.rock('#5c5a58'), roughness: 1 }),
  );
  cliff.castShadow = cliff.receiveShadow = true;
  // Local z (extrusion) runs along the road; place it so the face is at s.
  const along = V(f.tan.x, 0, f.tan.z).normalize();
  const right = new THREE.Vector3().crossVectors(along, V(0, 1, 0));
  const basis = new THREE.Matrix4().makeBasis(right, V(0, 1, 0), along.clone());
  cliff.quaternion.setFromRotationMatrix(basis);
  cliff.position.copy(tv(f.pos)).addScaledVector(along, durin ? 0 : -24);
  g.add(cliff);
  if (durin) {
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(gw * 3.4, gw * 3.4),
      new THREE.MeshBasicMaterial({
        map: ithildinTex(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    door.position
      .copy(tv(f.pos))
      .add(V(0, gw * 1.2, 0))
      .addScaledVector(along, -0.3);
    door.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right.clone().negate(), V(0, 1, 0), along.clone().negate()),
    );
    g.add(door);
  }
  return g;
}
