import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { meshHeight } from './ground.ts';

/**
 * The look of the farm racetrack, for the owner to approve before the whole track is built:
 * a stretch of the approved route (docs/farm/racetrack_draft.json) in glass. The road is a
 * tinted glass slab with an etched grid (so you can always read the surface and feel your
 * speed) and glowing edge lines; clear glass walls with a lit rail along the top; tubes of
 * clear glass with frosted ribs; thin steel posts holding up whatever is off the ground.
 * Boost pads and kickers are lit so they read from far off. Real metres, in the farm group.
 */

/** One point of the draft centre line: x, y (map), h above ground, width, kind, section, ground, s. */
export type DraftPoint = [number, number, number, number, string, string, number, number];
export interface DraftFeature {
  kind: string;
  label: string;
  s: number;
  x: number;
  y: number;
  h: number;
}
export interface Draft {
  length: number;
  pts: DraftPoint[];
  features: DraftFeature[];
}

export type GlassStyle = 'clear' | 'smoky' | 'frosted';
const STYLES: Record<
  GlassStyle,
  {
    tint: number;
    floor: number;
    edge: number;
    wall: number;
    tube: number;
    rough: number;
    etch: number;
  }
> = {
  // Clear, faintly blue glass: the ground shows through clearly, the edges catch the light.
  clear: { tint: 0xbfe4ff, floor: 0.26, edge: 0.8, wall: 0.1, tube: 0.07, rough: 0.06, etch: 0.55 },
  // Darker smoked glass: more solid underfoot, still see-through.
  smoky: {
    tint: 0x5d6b78,
    floor: 0.42,
    edge: 0.85,
    wall: 0.16,
    tube: 0.12,
    rough: 0.08,
    etch: 0.45,
  },
  // Frosted: easiest to read, the ground below only a soft blur of colour.
  frosted: {
    tint: 0xe9f4ff,
    floor: 0.62,
    edge: 0.9,
    wall: 0.3,
    tube: 0.18,
    rough: 0.45,
    etch: 0.35,
  },
};

const WALL_H = 0.28; // real metres (2.8 m in the game)
const SLAB = 0.05;
const TUBE_R = 1.05;
const TUBE_UP = 0.55; // tube centre above the road surface
const LOOP_R = 2.6;
const LOOP_SHIFT = 2.4;

/** A frame along the road: where, which way along, which way is up, how wide, what kind. */
export interface Frame {
  p: THREE.Vector3;
  t: THREE.Vector3;
  up: THREE.Vector3;
  w: number;
  kind: string;
  s: number;
}

/** Glass that gets more opaque toward grazing angles, like the real thing. */
function glass(
  opacity: number,
  edge: number,
  tint: number,
  rough: number,
): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: tint,
    transparent: true,
    opacity,
    roughness: rough,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.4,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const u = { uEdgeA: { value: edge } };
  m.userData.edge = u.uEdgeA;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uEdgeA;')
      .replace(
        '#include <opaque_fragment>',
        `{
          float fres = pow(1.0 - abs(dot(normal, geometryViewDir)), 3.0);
          diffuseColor.a = mix(diffuseColor.a, uEdgeA, fres);
        }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'track-glass';
  return m;
}

/** The etched pattern on the road: a fine diamond grid and a dashed centre line. */
function etchTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 2;
  for (let k = -256; k <= 512; k += 32) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + 256, 256);
    g.moveTo(k, 256);
    g.lineTo(k + 256, 0);
    g.stroke();
  }
  // Centre dashes.
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.fillRect(122, 20, 12, 96);
  g.fillRect(122, 148, 12, 96);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Glowing chevrons for the boost pads. */
function chevronTexture(blue = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = blue ? 'rgba(30,130,255,0.75)' : 'rgba(255,190,20,0.35)';
  g.fillRect(0, 0, 128, 256);
  g.strokeStyle = blue ? 'rgba(170,230,255,1)' : 'rgba(255,214,60,1)';
  g.lineWidth = 16;
  g.lineJoin = 'round';
  for (const y of [40, 120, 200]) {
    g.beginPath();
    g.moveTo(18, y + 40);
    g.lineTo(64, y);
    g.lineTo(110, y + 40);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- the centre line

/** The draft's centre line for a few sections, with real loop-de-loops put in at the loops. */
export function framesFor(d: Draft, sections: string[]): Frame[] {
  const raw = d.pts.filter((p) => sections.includes(p[5]));
  // Resample to 0.25 m, and lift onto the actual ground mesh.
  const P: { p: THREE.Vector3; w: number; kind: string; s: number }[] = [];
  for (let i = 0; i < raw.length - 1; i++) {
    const a = raw[i]!,
      b = raw[i + 1]!;
    // (Ground-level road sits a few centimetres up, clear of the lawn.)
    const pa = new THREE.Vector3(a[0], meshHeight(a[0], a[1]) + Math.max(a[2], 0.06), -a[1]);
    const pb = new THREE.Vector3(b[0], meshHeight(b[0], b[1]) + Math.max(b[2], 0.06), -b[1]);
    const n = Math.max(1, Math.round(pa.distanceTo(pb) / 0.25));
    for (let k = 0; k < n; k++)
      P.push({
        p: pa.clone().lerp(pb, k / n),
        w: a[3] + (b[3] - a[3]) * (k / n),
        kind: k / n < 0.5 ? a[4] : b[4],
        s: a[7] + (b[7] - a[7]) * (k / n),
      });
  }
  // Soften the corners a little.
  for (let pass = 0; pass < 3; pass++)
    for (let i = 1; i < P.length - 1; i++)
      P[i]!.p.lerpVectors(P[i - 1]!.p, P[i + 1]!.p, 0.5).lerp(P[i]!.p, 0.5);

  const loops = d.features.filter(
    (f) => f.kind === 'loop' && P.some((q) => Math.abs(q.s - f.s) < 0.5),
  );
  const out: Frame[] = [];
  const up0 = new THREE.Vector3(0, 1, 0);
  let shift = new THREE.Vector3(),
    shiftLeft = 0;
  for (let i = 0; i < P.length; i++) {
    const q = P[i]!;
    const t = P[Math.min(i + 1, P.length - 1)]!.p.clone()
      .sub(P[Math.max(i - 1, 0)]!.p)
      .normalize();
    // After a loop the road comes out a little to one side and eases back over 8 m.
    const ease = shiftLeft > 0 ? (shiftLeft / 8) ** 2 * (3 - 2 * (shiftLeft / 8)) : 0;
    const p = q.p.clone().addScaledVector(shift, ease);
    const up = up0.clone().addScaledVector(t, -up0.dot(t)).normalize();
    out.push({ p, t, up, w: q.w, kind: q.kind, s: q.s });
    if (shiftLeft > 0) shiftLeft = Math.max(0, shiftLeft - 0.25);
    const lp = loops.find((f) => q.s <= f.s && P[i + 1] && P[i + 1]!.s > f.s);
    if (lp) {
      // A full vertical loop: up and over, coming out shifted to the right.
      const right = t.clone().cross(up).normalize();
      const N = Math.round((Math.PI * 2 * LOOP_R) / 0.25);
      for (let k = 1; k < N; k++) {
        const th = (k / N) * Math.PI * 2;
        const sh = (k / N) * (k / N) * (3 - 2 * (k / N)) * LOOP_SHIFT;
        const c = p.clone().addScaledVector(up, LOOP_R).addScaledVector(right, sh);
        const pos = p
          .clone()
          .addScaledVector(t, Math.sin(th) * LOOP_R)
          .addScaledVector(up, LOOP_R * (1 - Math.cos(th)))
          .addScaledVector(right, sh);
        const lt = t
          .clone()
          .multiplyScalar(Math.cos(th))
          .addScaledVector(up, Math.sin(th))
          .addScaledVector(right, (LOOP_SHIFT / (Math.PI * 2 * LOOP_R)) * 6 * (k / N) * (1 - k / N))
          .normalize();
        const lu = c.sub(pos).normalize();
        out.push({ p: pos, t: lt, up: lu, w: q.w, kind: 'tube', s: q.s });
      }
      shift = right.multiplyScalar(LOOP_SHIFT);
      shiftLeft = 8;
    }
  }
  return out;
}

// ---------------------------------------------------------------- geometry

/** A strip of quads through cross-section points made by `at(frame) -> [points]`. */
function sweep(
  F: Frame[],
  at: (f: Frame) => THREE.Vector3[],
  closed = false,
  uvAcross?: number[],
): THREE.BufferGeometry {
  const pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  let len = 0;
  let m = 0;
  F.forEach((f, i) => {
    if (i) len += f.p.distanceTo(F[i - 1]!.p);
    const ring = at(f);
    m = ring.length;
    ring.forEach((q, j) => {
      pos.push(q.x, q.y, q.z);
      uv.push(uvAcross ? uvAcross[j]! : j / (m - 1), len);
    });
  });
  const cols = closed ? m : m - 1;
  for (let i = 0; i < F.length - 1; i++)
    for (let j = 0; j < cols; j++) {
      const a = i * m + j,
        b = i * m + ((j + 1) % m),
        c = a + m,
        d = b + m;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const side = (f: Frame) => f.t.clone().cross(f.up).normalize();

/** Consecutive runs of frames of the given kinds (overlapping by a frame so they join). */
function runs(F: Frame[], ok: (k: string) => boolean): Frame[][] {
  const out: Frame[][] = [];
  let cur: Frame[] = [];
  for (const f of F) {
    if (ok(f.kind)) cur.push(f);
    else if (cur.length) {
      cur.push(f);
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) out.push(cur);
  return out.filter((r) => r.length > 1);
}

/** Split a run into pieces about `len` metres long, so the glass sorts well. */
function chunks(R: Frame[], len = 24): Frame[][] {
  const out: Frame[][] = [];
  let cur: Frame[] = [R[0]!];
  let d = 0;
  for (let i = 1; i < R.length; i++) {
    cur.push(R[i]!);
    d += R[i]!.p.distanceTo(R[i - 1]!.p);
    if (d > len && i < R.length - 2) {
      out.push(cur);
      cur = [R[i]!];
      d = 0;
    }
  }
  out.push(cur);
  return out;
}

export interface TrackLook {
  group: THREE.Group;
  frames: Frame[];
  setStyle(s: GlassStyle): void;
}

/** Where the lit marks go along the road (same arc length as the frames' `s`). */
export interface GlassMarks {
  /** `lat` and `width` (real metres) place a pad across the road; otherwise it's centred. */
  marks: {
    kind: 'pad' | 'jump' | 'bigjump' | 'start';
    s: number;
    lat?: number;
    width?: number;
    /** A blue super pad. */
    super?: boolean;
  }[];
  /** Spread the work: posts every this many metres (real). */
  postEvery?: number;
}

/** The first stretch of the draft in glass (the look preview). */
export function buildTrackLook(d: Draft, sections: string[]): TrackLook {
  const F = framesFor(d, sections);
  const marks: GlassMarks['marks'] = [];
  for (const ft of d.features) {
    if (!F.some((f) => Math.abs(f.s - ft.s) < 0.6)) continue;
    const kind = ft.kind === 'boost' ? 'pad' : ft.kind;
    if (kind === 'pad' || kind === 'jump' || kind === 'bigjump' || kind === 'start')
      marks.push({ kind, s: ft.s });
  }
  return buildGlass(F, { marks });
}

/** A run of road frames built in glass, with its lit marks. */
export function buildGlass(F: Frame[], opts: GlassMarks, style: GlassStyle = 'clear'): TrackLook {
  const group = new THREE.Group();
  group.name = 'track-look';
  const st = STYLES.clear;
  const floorM = glass(st.floor, st.edge, st.tint, st.rough);
  const wallM = glass(st.wall, 0.55, st.tint, st.rough);
  const tubeM = glass(st.tube, 0.45, st.tint, st.rough);
  const etch = etchTexture();
  etch.repeat.set(1, 1 / 1.6);
  const etchM = new THREE.MeshBasicMaterial({
    map: etch,
    transparent: true,
    opacity: st.etch,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const glow = new THREE.MeshBasicMaterial({ color: 0xbff4ff });
  const rib = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    roughness: 0.6,
    depthWrite: false,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x8b949c,
    metalness: 0.85,
    roughness: 0.35,
  });
  const boostM = new THREE.MeshBasicMaterial({
    map: chevronTexture(),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const kickM = new THREE.MeshBasicMaterial({ color: 0xff7a1a });
  // Super pads are blue (flat on the road, like the others).
  const superM = new THREE.MeshBasicMaterial({
    map: chevronTexture(true),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const groups: [boolean, (k: string) => boolean][] = [
    [false, (k) => k !== 'air' && k !== 'tube'],
    [true, (k) => k === 'tube'],
  ];
  for (const [tube, ok] of groups)
    for (const R of runs(F, ok))
      for (const C of chunks(R)) {
        // The slab: top, underside and its two edges.
        const slab = sweep(
          C,
          (f) => {
            const r = side(f),
              h = f.w / 2;
            const b = f.up.clone().multiplyScalar(-SLAB);
            return [
              f.p.clone().addScaledVector(r, -h),
              f.p.clone().addScaledVector(r, h),
              f.p.clone().addScaledVector(r, h).add(b),
              f.p.clone().addScaledVector(r, -h).add(b),
            ];
          },
          true,
        );
        const m = new THREE.Mesh(slab, floorM);
        m.renderOrder = 1;
        group.add(m);
        // Etched grid and centre line just above the surface.
        const top = sweep(
          C,
          (f) => {
            const r = side(f),
              h = f.w / 2 - 0.04;
            const lift = f.up.clone().multiplyScalar(0.003);
            return [
              f.p.clone().addScaledVector(r, -h).add(lift),
              f.p.clone().addScaledVector(r, h).add(lift),
            ];
          },
          false,
          [0, 1],
        );
        const e = new THREE.Mesh(top, etchM);
        e.renderOrder = 2;
        group.add(e);
        // Glowing edge lines along both sides of the road (and the rails, below): one mesh.
        const glows: THREE.BufferGeometry[] = [];
        for (const s of [-1, 1]) {
          const g = sweep(C, (f) => {
            const r = side(f),
              h = f.w / 2 - 0.05;
            const lift = f.up.clone().multiplyScalar(0.005);
            const a = f.p
              .clone()
              .addScaledVector(r, s * h)
              .add(lift);
            return [a.clone().addScaledVector(r, -0.018), a.clone().addScaledVector(r, 0.018)];
          });
          glows.push(g);
        }
        if (!tube) {
          // Glass walls, a lit rail along the top of each.
          const walls: THREE.BufferGeometry[] = [];
          for (const s of [-1, 1]) {
            const w = sweep(C, (f) => {
              const a = f.p.clone().addScaledVector(side(f), (s * f.w) / 2);
              return [a, a.clone().addScaledVector(f.up, WALL_H)];
            });
            walls.push(w);
            const rail = sweep(
              C,
              (f) => {
                const r = side(f);
                const a = f.p
                  .clone()
                  .addScaledVector(r, (s * f.w) / 2)
                  .addScaledVector(f.up, WALL_H);
                return [0, 1, 2, 3].map((k) => {
                  const ang = (k / 4) * Math.PI * 2;
                  return a
                    .clone()
                    .addScaledVector(r, Math.cos(ang) * 0.018)
                    .addScaledVector(f.up, Math.sin(ang) * 0.018);
                });
              },
              true,
            );
            glows.push(rail);
          }
          const wm = new THREE.Mesh(mergeGeometries(walls), wallM);
          wm.renderOrder = 3;
          group.add(wm);
        } else {
          // The tube, round the road, and frosted ribs every metre and a half.
          const ring = (f: Frame, r0: number) => {
            const r = side(f);
            const c = f.p.clone().addScaledVector(f.up, TUBE_UP);
            return Array.from({ length: 28 }, (_, k) => {
              const a = (k / 28) * Math.PI * 2;
              return c
                .clone()
                .addScaledVector(r, Math.cos(a) * r0)
                .addScaledVector(f.up, Math.sin(a) * r0);
            });
          };
          const tm = new THREE.Mesh(
            sweep(C, (f) => ring(f, TUBE_R), true),
            tubeM,
          );
          tm.renderOrder = 4;
          group.add(tm);
          let acc = 0;
          const ribs: THREE.BufferGeometry[] = [];
          for (let i = 1; i < C.length; i++) {
            acc += C[i]!.p.distanceTo(C[i - 1]!.p);
            if (acc < 1.5) continue;
            acc = 0;
            const f = C[i]!;
            const band: Frame[] = [-0.03, 0.03].map((o) => ({
              ...f,
              p: f.p.clone().addScaledVector(f.t, o),
            }));
            ribs.push(sweep(band, (q) => ring(q, TUBE_R + 0.01), true));
          }
          if (ribs.length) {
            const rm = new THREE.Mesh(mergeGeometries(ribs), rib);
            rm.renderOrder = 5;
            group.add(rm);
          }
        }
        group.add(new THREE.Mesh(mergeGeometries(glows), glow));
      }

  // Steel posts under anything off the ground (not under the loops themselves).
  const posts: THREE.BufferGeometry[] = [];
  let acc = 0;
  for (let i = 1; i < F.length; i++) {
    const f = F[i]!;
    acc += f.p.distanceTo(F[i - 1]!.p);
    if (acc < (opts.postEvery ?? 4) || f.kind === 'air' || f.up.y < 0.95) continue;
    const ground = meshHeight(f.p.x, -f.p.z);
    const bottom = f.p.y - (f.kind === 'tube' ? TUBE_R - TUBE_UP : SLAB);
    const h = bottom - ground;
    if (h < 0.5) continue;
    acc = 0;
    for (const s of f.w > 3 ? [-1, 1] : [0]) {
      const at = f.p.clone().addScaledVector(side(f), s * (f.w / 2 - 0.3));
      const g = new THREE.CylinderGeometry(0.03, 0.04, h, 8);
      g.translate(at.x, ground + h / 2, at.z);
      posts.push(g);
      const foot = new THREE.CylinderGeometry(0.09, 0.11, 0.04, 12);
      foot.translate(at.x, ground + 0.02, at.z);
      posts.push(foot);
    }
  }
  if (posts.length) {
    const pm = new THREE.Mesh(mergeGeometries(posts), steel);
    pm.castShadow = true;
    group.add(pm);
  }

  // Boost pads and kickers.
  const at = (s: number) =>
    F.reduce((b, f) => (Math.abs(f.s - s) < Math.abs(b.s - s) ? f : b), F[0]!);
  for (const ft of opts.marks) {
    const f = at(ft.s);
    const r = side(f);
    if (ft.kind === 'pad') {
      const g = new THREE.PlaneGeometry(ft.width ?? f.w * 0.7, ft.super ? 1.6 : 1.1);
      const m = new THREE.Mesh(g, ft.super ? superM : boostM);
      const basis = new THREE.Matrix4().makeBasis(r, f.t, f.up);
      m.quaternion.setFromRotationMatrix(basis);
      m.position
        .copy(f.p)
        .addScaledVector(f.up, 0.008)
        .addScaledVector(r, ft.lat ?? 0);
      m.renderOrder = 6;
      group.add(m);
    }
    if (ft.kind === 'jump' || ft.kind === 'bigjump') {
      // A glass wedge across the road with lit orange edges.
      const L = ft.kind === 'bigjump' ? 1.8 : 1.0,
        H = ft.kind === 'bigjump' ? 0.5 : 0.22;
      const shape = new THREE.Shape([
        new THREE.Vector2(0, 0),
        new THREE.Vector2(L, 0),
        new THREE.Vector2(L, H),
      ]);
      const g = new THREE.ExtrudeGeometry(shape, { depth: f.w * 0.9, bevelEnabled: false });
      g.translate(-L, 0, (-f.w * 0.9) / 2);
      const basis = new THREE.Matrix4().makeBasis(f.t, f.up, r);
      const wedge = new THREE.Mesh(g, floorM);
      wedge.quaternion.setFromRotationMatrix(basis);
      wedge.position.copy(f.p);
      wedge.renderOrder = 6;
      group.add(wedge);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, f.w * 0.9), kickM);
      lip.quaternion.copy(wedge.quaternion);
      lip.position.copy(f.p).addScaledVector(f.up, H);
      group.add(lip);
    }
    if (ft.kind === 'start') {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 16;
      const g2 = c.getContext('2d')!;
      for (let i = 0; i < 16; i++)
        for (let j = 0; j < 4; j++) {
          g2.fillStyle = (i + j) % 2 ? '#111' : '#fff';
          g2.fillRect(i * 4, j * 4, 4, 4);
        }
      const tx = new THREE.CanvasTexture(c);
      tx.magFilter = THREE.NearestFilter;
      tx.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(f.w, 0.4),
        new THREE.MeshBasicMaterial({ map: tx, side: THREE.DoubleSide }),
      );
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, f.t, f.up));
      m.position.copy(f.p).addScaledVector(f.up, 0.009);
      group.add(m);
    }
  }

  const setStyle = (name: GlassStyle) => {
    const s = STYLES[name];
    for (const [m, op, edge] of [
      [floorM, s.floor, s.edge],
      [wallM, s.wall, 0.55],
      [tubeM, s.tube, 0.45],
    ] as const) {
      m.color.set(s.tint);
      m.opacity = op;
      m.roughness = s.rough;
      (m.userData.edge as { value: number }).value = edge;
    }
    etchM.opacity = s.etch;
  };
  setStyle(style);
  return { group, frames: F, setStyle };
}
