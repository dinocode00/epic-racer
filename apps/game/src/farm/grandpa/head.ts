import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  G,
  V,
  canvasTex,
  clamp,
  leatherBump,
  rnd,
  smooth,
  smoothSeams,
  spline,
  white,
} from './kit.ts';

/**
 * Grandpa's head, sculpted from the photo: a long, lean face, high cheekbones over hollow
 * cheeks, deep-set eyes narrowed by a smile with crow's feet, a long prominent nose, deep
 * folds from nose to mouth, a thin-lipped closed smile, a long chin, big ears, short grey
 * hair at the sides and back, and weathered, ruddy skin. Under a navy trucker cap: tall
 * structured foam front with a white emblem, mesh sides and back with a snapback strap, and
 * a long pre-curved bill.
 *
 * Head-local metres: centre of the skull at the origin, eyes at y = 0, facing +z.
 */

// Face proportions (y): brow 0.026, eyes 0, nose tip -0.042, mouth -0.073, chin -0.122.
const Y0 = -0.136,
  Y1 = 0.121;
/** Half width, front depth and back depth of the head at each height. */
const W0 = spline([
  [-0.136, 0.0],
  [-0.13, 0.019],
  [-0.12, 0.033],
  [-0.108, 0.045],
  [-0.092, 0.057],
  [-0.072, 0.064],
  [-0.05, 0.069],
  [-0.025, 0.073],
  [0.0, 0.073],
  [0.025, 0.072],
  [0.05, 0.071],
  [0.08, 0.065],
  [0.1, 0.052],
  [0.112, 0.035],
  [0.121, 0.0],
]);
/** A broad-boned head: a little wider than the plain profile. */
const W = (y: number) => W0(y) * 1.05;
const F = spline([
  [-0.136, 0.044],
  [-0.13, 0.058],
  [-0.12, 0.073],
  [-0.108, 0.082],
  [-0.092, 0.085],
  [-0.072, 0.087],
  [-0.05, 0.087],
  [-0.025, 0.086],
  [0.0, 0.086],
  [0.025, 0.09],
  [0.05, 0.087],
  [0.08, 0.075],
  [0.1, 0.057],
  [0.112, 0.037],
  [0.121, 0.0],
]);
const B = spline([
  [-0.136, 0.0],
  [-0.12, 0.008],
  [-0.108, 0.024],
  [-0.092, 0.044],
  [-0.072, 0.064],
  [-0.05, 0.08],
  [-0.025, 0.09],
  [0.0, 0.096],
  [0.025, 0.099],
  [0.05, 0.098],
  [0.08, 0.088],
  [0.1, 0.07],
  [0.112, 0.046],
  [0.121, 0.0],
]);
const EXF = 2.35, // front cross-section: broad and flattish across the face
  EXB = 2.0;

/** Distance from p to the segment ab, and which side (+1 lateral, -1 medial). */
function seg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const vx = bx - ax,
    vy = by - ay;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy), 0, 1);
  const dx = px - (ax + vx * t),
    dy = py - (ay + vy * t);
  const side = Math.sign(vx * (py - ay) - vy * (px - ax));
  return { d: Math.hypot(dx, dy), side, t };
}

/** The face: how far (m) each point stands out from the plain head shape, and its cavity. */
function face(x: number, y: number): { dz: number; cav: number } {
  const ax = Math.abs(x);
  let up = 0,
    down = 0;
  const add = (v: number) => (v > 0 ? (up += v) : (down += v));
  // Brow ridge and the bridge between the brows.
  add(0.0055 * G(ax, y, 0.027, 0.027, 0.03, 0.008));
  add(0.003 * G(x, y, 0, 0.022, 0.01, 0.008));
  // Deep-set eye sockets, puffy lower lids, the tear trough under them.
  add(-0.0135 * G(ax, y, 0.032, 0.006, 0.0165, 0.0115));
  add(0.0026 * G(ax, y, 0.032, -0.0125, 0.013, 0.0042));
  add(-0.0018 * G(ax, y, 0.029, -0.0195, 0.014, 0.0028));
  // High cheekbones over hollow cheeks.
  add(0.0065 * G(ax, y, 0.048, -0.021, 0.016, 0.012));
  add(-0.0075 * G(ax, y, 0.048, -0.058, 0.0145, 0.019));
  // Temples sunk a little.
  add(-0.003 * G(ax, y, 0.064, 0.02, 0.01, 0.018));
  // Nose: long and prominent, a high bridge running down to a rounded, slightly drooping tip.
  {
    const y0 = 0.016,
      y1 = -0.043,
      y2 = -0.053;
    if (y < y0 + 0.006 && y > y2 - 0.002) {
      let P: number, w: number;
      if (y >= y1) {
        const t = clamp((y0 - y) / (y0 - y1), 0, 1);
        P = 0.003 + 0.028 * t ** 1.25 + 0.0016 * G(t, 0, 0.5, 0, 0.14, 1);
        w = 0.0074 + 0.0058 * t;
      } else {
        const t = clamp((y1 - y) / (y1 - y2), 0, 1);
        P = 0.031 * (1 - t ** 0.75);
        w = 0.0132;
      }
      if (y > y0) P *= 1 - (y - y0) / 0.006;
      add(P * Math.exp(-1.55 * (x / w) ** 2));
    }
    add(0.0042 * G(x, y, 0, -0.0395, 0.0078, 0.0068)); // tip
    add(0.0085 * G(ax, y, 0.0148, -0.0455, 0.0056, 0.0056)); // nostril wings
    add(-0.0016 * G(ax, y, 0.0208, -0.0425, 0.0022, 0.0065)); // the crease round each wing
  }
  // Deep folds from the nose wings past the mouth corners, with the cheek full above them.
  {
    const s = seg(ax, y, 0.019, -0.046, 0.034, -0.086);
    const fade = smooth(-0.098, -0.084, y);
    add(-0.0028 * Math.exp(-((s.d / 0.0034) ** 2)) * fade);
    // The cheek rolls softly over the fold on the outer side.
    const roll = s.side < 0 ? 1 : smooth(0.003, 0, s.d);
    add(0.0036 * Math.exp(-(((s.d - 0.007) / 0.0075) ** 2)) * fade * roll);
    // Long weathered creases down each cheek, outside the fold.
    for (const [ox, dep] of [
      [0.012, 0.0011],
      [0.019, 0.0008],
    ] as const) {
      const c = seg(ax, y, 0.019 + ox, -0.036, 0.032 + ox, -0.09);
      add(-dep * Math.exp(-((c.d / 0.0018) ** 2)) * smooth(-0.1, -0.08, y));
    }
    // Jowls sagging past the jawline beside the chin.
    add(0.003 * G(ax, y, 0.043, -0.094, 0.011, 0.012));
    // Marionette lines down from the mouth corners.
    const m = seg(ax, y, 0.028, -0.077, 0.034, -0.101);
    add(-0.0016 * Math.exp(-((m.d / 0.0022) ** 2)));
  }
  // Lines across the forehead (on show now the cap sits pushed back).
  for (const [fy, dep] of [
    [0.04, 0.0007],
    [0.0475, 0.0008],
    [0.055, 0.0007],
    [0.062, 0.0005],
  ] as const) {
    const wav = fy + Math.sin(x * 70 + fy * 300) * 0.0012;
    add(-dep * Math.exp(-(((y - wav) / 0.0013) ** 2)) * (1 - smooth(0.035, 0.05, ax)));
  }
  // Philtrum, thin upper lip, the mouth line in a closed smile, lower lip, mouth corners.
  add(-0.0014 * G(x, y, 0, -0.062, 0.0035, 0.0055));
  add(0.0006 * G(ax, y, 0.0058, -0.062, 0.0018, 0.005));
  add(0.0028 * G(x, y, 0, -0.0675, 0.019, 0.0045));
  {
    const ym = -0.0726 + 0.0062 * (x / 0.025) ** 2;
    const win = 1 - smooth(0.022, 0.029, ax);
    add(-0.0028 * Math.exp(-(((y - ym) / 0.0017) ** 2)) * win);
  }
  add(0.0032 * G(x, y, 0, -0.0785, 0.016, 0.0042));
  add(-0.0022 * G(ax, y, 0.0265, -0.0685, 0.003, 0.0032));
  // The crease under the lower lip, and the long chin.
  add(-0.0022 * G(x, y, 0, -0.0885, 0.014, 0.003));
  add(0.0095 * G(x, y, 0, -0.106, 0.018, 0.012));
  return { dz: up + down, cav: down };
}

/** Plain head shape at angle a (0 = front, +π/2 = +x) and height y. */
function shell(a: number, y: number): { x: number; z: number; front: number } {
  const s = Math.sin(a),
    c = Math.cos(a);
  const ex = c > 0 ? EXF : EXB;
  const sx = Math.sign(s) * Math.abs(s) ** (2 / ex),
    cz = Math.sign(c) * Math.abs(c) ** (2 / ex);
  return { x: W(y) * sx, z: (c > 0 ? F(y) : B(y)) * cz, front: smooth(0.2, 0.62, c) };
}

/** The face surface z at (x, y), front side: for setting eyes, brows and the like on it. */
export function faceZ(x: number, y: number): number {
  const w = W(y);
  const s = clamp((Math.abs(x) / w) ** (EXF / 2), 0, 1);
  const a = Math.asin(s) * Math.sign(x);
  const sh = shell(a, y);
  return sh.z + face(x, y).dz * sh.front;
}

// ---------------------------------------------------------------- skin textures

const TW = 1024,
  TH = 1024;
/** Canvas pixel for a point on the face. */
function px(x: number, y: number): [number, number] {
  const w = W(y);
  const s = clamp((Math.abs(x) / w) ** (EXF / 2), 0, 1);
  const a = Math.asin(s) * Math.sign(x);
  return [(a / (Math.PI * 2) + 0.5) * TW, (1 - (y - Y0) / (Y1 - Y0)) * TH];
}
/** Metres to pixels (roughly, on the front of the face). */
const PXM = TH / (Y1 - Y0);

function skinMaps(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const map = canvasTex(TW, TH, (x) => {
    // Weathered, sun-tanned skin, a touch ruddy.
    x.fillStyle = '#c08a74';
    x.fillRect(0, 0, TW, TH);
    // Mottling.
    for (let i = 0; i < 2600; i++) {
      const [cx, cy] = [rnd() * TW, rnd() * TH];
      const r = 4 + rnd() * 18;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      const c = rnd() < 0.5 ? '170,100,80' : '220,170,140';
      g.addColorStop(0, `rgba(${c},0.10)`);
      g.addColorStop(1, `rgba(${c},0)`);
      x.fillStyle = g;
      x.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    const glow = (fx: number, fy: number, r: number, col: string, a: number) => {
      for (const sx of fx === 0 ? [0] : [-fx, fx]) {
        const [cx, cy] = px(sx, fy);
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r * PXM);
        g.addColorStop(0, `rgba(${col},${a})`);
        g.addColorStop(1, `rgba(${col},0)`);
        x.fillStyle = g;
        x.fillRect(cx - r * PXM, cy - r * PXM, r * PXM * 2, r * PXM * 2);
      }
    };
    // Paler forehead where the cap always sits; ruddy cheeks, nose and chin; shadowed sockets.
    {
      const [, top] = px(0, 0.04);
      const g = x.createLinearGradient(0, top + 30, 0, top - 40);
      g.addColorStop(0, 'rgba(232,196,170,0)');
      g.addColorStop(1, 'rgba(232,196,170,0.55)');
      x.fillStyle = g;
      x.fillRect(0, 0, TW, top + 30);
    }
    glow(0.045, -0.032, 0.026, '196,92,78', 0.32);
    glow(0, -0.036, 0.016, '200,95,82', 0.4);
    glow(0, -0.105, 0.016, '196,110,92', 0.18);
    glow(0.032, 0.006, 0.016, '96,60,58', 0.32);
    glow(0.06, 0.0, 0.02, '150,96,80', 0.15);
    // Lips: thin, a little darker and pinker than the face.
    x.fillStyle = 'rgba(166,96,88,0.55)';
    x.beginPath();
    for (let i = 0; i <= 30; i++) {
      const fx = -0.024 + (i / 30) * 0.048;
      const p = px(fx, -0.0705 + 0.006 * (fx / 0.025) ** 2 + 0.0018);
      i ? x.lineTo(...p) : x.moveTo(...p);
    }
    for (let i = 30; i >= 0; i--) {
      const fx = -0.022 + (i / 30) * 0.044;
      const p = px(fx, -0.0815 + 0.003 * (fx / 0.022) ** 2);
      x.lineTo(...p);
    }
    x.closePath();
    x.fill();
    // Nostrils.
    x.fillStyle = 'rgba(60,30,28,0.85)';
    for (const s of [-1, 1]) {
      const [cx, cy] = px(s * 0.0078, -0.0505);
      x.beginPath();
      x.ellipse(cx, cy, 0.0045 * PXM, 0.0022 * PXM, s * 0.3, 0, Math.PI * 2);
      x.fill();
    }
    // Faint grey stubble on the jaw, chin and upper lip.
    for (let i = 0; i < 9000; i++) {
      const fx = (rnd() - 0.5) * 0.12,
        fy = -0.06 - rnd() * 0.07;
      if (Math.abs(fx) > W(fy) * 0.95) continue;
      if (fy > -0.075 && Math.abs(fx) < 0.024 && fy < -0.066) continue;
      const [cx, cy] = px(fx, fy);
      x.fillStyle = `rgba(${rnd() < 0.5 ? '90,80,76' : '170,166,160'},0.18)`;
      x.fillRect(cx, cy, 1, 1.5);
    }
    // Age spots on the temples, cheeks and forehead.
    for (let i = 0; i < 46; i++) {
      const fx = (rnd() - 0.5) * 0.13,
        fy = -0.04 + rnd() * 0.09;
      const [cx, cy] = px(fx, fy);
      x.fillStyle = `rgba(140,90,60,${0.15 + rnd() * 0.2})`;
      x.beginPath();
      x.ellipse(cx, cy, 1.5 + rnd() * 4, 1.5 + rnd() * 3, rnd() * 3, 0, Math.PI * 2);
      x.fill();
    }
  });
  // Wrinkles (bump): grooves drawn dark on mid grey.
  const bump = canvasTex(
    TW,
    TH,
    (x) => {
      x.fillStyle = '#808080';
      x.fillRect(0, 0, TW, TH);
      // Pores.
      for (let i = 0; i < 60000; i++) {
        const v = 110 + ((rnd() * 36) | 0);
        x.fillStyle = `rgb(${v},${v},${v})`;
        x.fillRect(rnd() * TW, rnd() * TH, 1, 1);
      }
      const line = (pts: [number, number][], w: number, a: number) => {
        x.strokeStyle = `rgba(20,20,20,${a})`;
        x.lineWidth = w;
        x.lineCap = 'round';
        x.beginPath();
        pts.forEach(([fx, fy], i) => (i ? x.lineTo(...px(fx, fy)) : x.moveTo(...px(fx, fy))));
        x.stroke();
      };
      x.filter = 'blur(2px)';
      for (const s of [-1, 1]) {
        // Crow's feet fanning from the outer corner of each eye.
        for (let k = 0; k < 4; k++) {
          const ang = -0.55 + k * 0.33 + (rnd() - 0.5) * 0.12;
          const len = 0.011 + rnd() * 0.009;
          const sx = 0.046,
            sy = 0.005 + (k - 2.5) * 0.0015;
          line(
            [
              [s * sx, sy],
              [s * (sx + Math.cos(ang) * len * 0.5), sy + Math.sin(ang) * len * 0.5 + 0.0005],
              [s * (sx + Math.cos(ang) * len), sy + Math.sin(ang) * len],
            ],
            2.6,
            0.45,
          );
        }
        // Lines under the eyes.
        for (let k = 0; k < 3; k++) {
          const yy = -0.012 - k * 0.0045;
          const pts: [number, number][] = [];
          for (let i = 0; i <= 8; i++) {
            const fx = 0.02 + i * 0.0035;
            pts.push([s * fx, yy - Math.sin((i / 8) * Math.PI) * 0.003]);
          }
          line(pts, 1.6, 0.5);
        }
        // Hooded upper lid crease.
        const lid: [number, number][] = [];
        for (let i = 0; i <= 10; i++) {
          const fx = 0.019 + i * 0.0028;
          lid.push([s * fx, 0.0165 + Math.sin((i / 10) * Math.PI) * 0.003]);
        }
        line(lid, 2, 0.55);
        // Fine cheek creases running down beside the nose folds.
        for (let k = 0; k < 4; k++) {
          const ox = 0.036 + k * 0.004;
          line(
            [
              [s * ox, -0.045 - k * 0.003],
              [s * (ox + 0.004), -0.07 - k * 0.003],
            ],
            1.6,
            0.18,
          );
        }
        // Wrinkles at the temples and in front of the ears.
        for (let k = 0; k < 4; k++)
          line(
            [
              [s * 0.064, 0.01 - k * 0.012],
              [s * 0.069, 0.004 - k * 0.012],
            ],
            1.5,
            0.4,
          );
      }
      // Forehead lines (mostly under the cap) and the frown lines between the brows.
      for (let k = 0; k < 3; k++) {
        const pts: [number, number][] = [];
        for (let i = 0; i <= 12; i++) {
          const fx = -0.045 + i * 0.0075;
          pts.push([fx, 0.036 + k * 0.006 + Math.sin(i * 0.7 + k) * 0.0008]);
        }
        line(pts, 2, 0.6);
      }
      for (const s of [-1, 1])
        line(
          [
            [s * 0.004, 0.018],
            [s * 0.006, 0.03],
          ],
          1.6,
          0.5,
        );
      // Little vertical lines on the upper lip.
      for (let k = 0; k < 7; k++) {
        const fx = -0.015 + k * 0.005;
        line(
          [
            [fx, -0.0675],
            [fx * 1.05, -0.0625],
          ],
          1,
          0.3,
        );
      }
    },
    false,
  );
  // The wrinkles also darken the skin colour a little (overlay keeps mid-grey neutral).
  {
    const x = (map.image as HTMLCanvasElement).getContext('2d')!;
    x.globalCompositeOperation = 'overlay';
    x.globalAlpha = 0.35;
    x.drawImage(bump.image as HTMLCanvasElement, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    map.needsUpdate = true;
  }
  return { map, bump };
}

// ---------------------------------------------------------------- head mesh

function headMesh(skin: THREE.Material): THREE.Mesh {
  // Angles bunch up across the face (about 1 mm apart there) and spread out round the back.
  const NA = 260,
    NY = 300;
  const pos: number[] = [],
    uv: number[] = [],
    col: number[] = [],
    idx: number[] = [];
  for (let j = 0; j <= NY; j++) {
    const y = Y0 + (j / NY) * (Y1 - Y0);
    for (let i = 0; i <= NA; i++) {
      const u = -1 + (2 * i) / NA;
      const a = Math.PI * (0.62 * u * u * u + 0.38 * u);
      const sh = shell(a, y);
      const f = face(sh.x, y);
      pos.push(sh.x, y, sh.z + f.dz * sh.front);
      uv.push(a / (Math.PI * 2) + 0.5, j / NY);
      const k = clamp(1 + f.cav * sh.front * 34, 0.55, 1);
      col.push(k, k * 0.97, k * 0.96);
    }
  }
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NA; i++) {
      const a = j * (NA + 1) + i,
        b = a + 1,
        c = a + NA + 1,
        d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  smoothSeams(g);
  // Faces wind clockwise from outside with this layout; flip if the normals point in.
  const n = g.attributes.normal!;
  const front = (Math.round(NY * 0.5) * (NA + 1) + NA / 2) | 0;
  if (n.getZ(front) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2]!, idx[i + 1]!];
    g.setIndex(idx);
    smoothSeams(g);
  }
  return new THREE.Mesh(g, skin);
}

/** Eyes narrowed in a smile: eyeballs under hooded upper lids, the lash line along them. */
function eyes(skin: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xcfc3b4, roughness: 0.2 });
  const iris = new THREE.MeshStandardMaterial({ color: 0x3b4855, roughness: 0.12 });
  const pupil = new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.1 });
  const lash = new THREE.MeshStandardMaterial({ color: 0x3a3029, roughness: 0.8 });
  const R = 0.0118;
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    const cx = s * 0.032,
      cy = 0.0055;
    e.position.set(cx, cy, faceZ(cx, cy) - R * 1.1 + 0.0032);
    e.add(new THREE.Mesh(new THREE.SphereGeometry(R, 24, 18), white));
    const ir = new THREE.Mesh(new THREE.SphereGeometry(R * 0.46, 18, 12), iris);
    ir.scale.z = 0.4;
    ir.position.set(-s * 0.0006, -0.0006, R * 0.93);
    e.add(ir);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(R * 0.2, 12, 8), pupil);
    pu.scale.z = 0.3;
    pu.position.set(-s * 0.0006, -0.0006, R * 1.0);
    e.add(pu);
    // Upper lid comes down past the top of the iris; the lower lid rises (he is smiling).
    const up = 0.5 * Math.PI - 0.13,
      lowStart = 0.5 * Math.PI + 0.2;
    const upper = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.1, 28, 16, 0, Math.PI * 2, 0, up),
      skin,
    );
    upper.rotation.x = 0.08;
    e.add(upper);
    const lower = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.08, 28, 12, 0, Math.PI * 2, lowStart, Math.PI - lowStart),
      skin,
    );
    e.add(lower);
    // Lash line along the lid edge (front arc only).
    const rr = R * 1.1 * Math.sin(up);
    const line = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.0007, 5, 24, 2.1), lash);
    line.rotation.set(Math.PI / 2 + 0.08, 0, Math.PI / 2 - 1.05);
    line.position.y = R * 1.1 * Math.cos(up) * Math.cos(0.08);
    line.position.z = -R * 1.1 * Math.cos(up) * Math.sin(0.08);
    line.rotation.order = 'XYZ';
    e.add(line);
    // The upper lid's rounded edge, and a puffy lower lid rim.
    const rimU = new THREE.Mesh(new THREE.TorusGeometry(rr * 1.01, 0.0013, 6, 24, 2.3), skin);
    rimU.rotation.copy(line.rotation);
    rimU.position.copy(line.position).add(V(0, 0.0007, 0));
    e.add(rimU);

    e.rotation.y = s * 0.12;
    g.add(e);
  }
  return g;
}

/** Bushy grey eyebrows: a few dozen short hairs each, lying along the brow ridge. */
function brows(): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const greys = [0x8a847b, 0x9f998f, 0x6f6961, 0xb3ada3, 0x5a554e, 0x7d776f];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 150; i++) {
      const t = rnd();
      const fx = 0.013 + t * 0.042;
      const fy = 0.0245 + Math.sin(t * Math.PI * 0.9) * 0.0045 - t * 0.002 + (rnd() - 0.5) * 0.004;
      const len = 0.0035 + rnd() * 0.0045;
      const h = new THREE.BoxGeometry(len, 0.0009, 0.0008);
      h.translate(len / 2, 0, 0);
      // Inner hairs point up and out, the rest lie outward along the brow.
      const ang = (1 - t) * 0.9 + (rnd() - 0.5) * 0.5;
      h.rotateZ(ang);
      h.rotateY(-0.12 + rnd() * 0.18);
      if (s < 0) h.scale(-1, 1, 1);
      h.translate(s * fx, fy, faceZ(s * fx, fy) + 0.0006 + rnd() * 0.0012);
      const c = new THREE.Color(greys[(rnd() * greys.length) | 0]!);
      const n = h.attributes.position!.count;
      const cc = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) cc.set([c.r, c.g, c.b], k * 3);
      h.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      h.deleteAttribute('uv');
      // Light the hairs like the skin under them, not by each tiny box face.
      const nn = h.attributes.normal!;
      for (let k = 0; k < nn.count; k++) nn.setXYZ(k, s * 0.25, 0.35, 0.9);
      parts.push(h);
    }
  }
  return new THREE.Mesh(
    mergeGeometries(parts)!,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: 0.3 }),
  );
}

/** A big, slightly stick-out ear: rim, inner fold, bowl, tragus and a long lobe. */
function ear(side: number, skin: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const deep = new THREE.MeshStandardMaterial({ color: 0xa06a58, roughness: 0.7 });
  // Outline in the ear plane (z forward, y up): taller than wide, wider at the top.
  const outline = (t: number) => {
    const a = t * Math.PI * 2;
    const top = Math.sin(a) > 0 ? 1.12 : 0.82;
    return new THREE.Vector2(-0.0015 + 0.0175 * Math.cos(a) * top, 0.035 * Math.sin(a));
  };
  const shape = new THREE.Shape();
  for (let i = 0; i <= 48; i++) {
    const p = outline(i / 48);
    i ? shape.lineTo(-p.x, p.y) : shape.moveTo(-p.x, p.y);
  }
  const plate = new THREE.ExtrudeGeometry(shape, {
    depth: 0.004,
    bevelEnabled: true,
    bevelThickness: 0.0022,
    bevelSize: 0.0022,
    bevelSegments: 3,
    curveSegments: 24,
  });
  plate.rotateY(Math.PI / 2); // extrusion -> +x (outward), shape x -> -z
  g.add(new THREE.Mesh(plate, skin));
  // The rim (helix) curling from the front-top, over and down the back to the lobe.
  const rim: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = 0.2 + (i / 24) * 0.62;
    const p = outline(t);
    rim.push(V(0.0068, p.y * 0.95, p.x * 0.95));
  }
  g.add(
    new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim), 40, 0.0029, 8), skin),
  );
  // The inner fold (antihelix), a smaller arc inside the rim.
  const anti: THREE.Vector3[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = 0.18 + (i / 14) * 0.5;
    const p = outline(t);
    anti.push(V(0.0062, p.y * 0.55 + 0.002, p.x * 0.55 - 0.002));
  }
  g.add(
    new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(anti), 24, 0.0022, 6), skin),
  );
  // The bowl, shadowed.
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.009, 16, 12), deep);
  bowl.scale.set(0.25, 1, 0.85);
  bowl.position.set(0.0045, -0.005, 0.002);
  g.add(bowl);
  const tragus = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), skin);
  tragus.position.set(0.004, -0.006, 0.012);
  g.add(tragus);
  // A long, fleshy lobe.
  const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 14, 10), skin);
  lobe.scale.set(0.55, 1.15, 0.9);
  lobe.position.set(0.003, -0.031, 0.002);
  g.add(lobe);
  if (side < 0) g.scale.x = -1;
  return g;
}

/** Short grey hair round the sides and back, below the cap, its lower edge in fine tufts. */
function hair(): THREE.Mesh {
  // Lower edge of the hair by angle from the front: sideburns, over the ears, down the nape.
  const edge = spline([
    [1.12, 0.002],
    [1.3, -0.013],
    [1.42, -0.011],
    [1.52, 0.029],
    [1.95, 0.031],
    [2.15, 0.0],
    [2.6, -0.05],
    [Math.PI, -0.064],
  ]);
  const top = 0.08;
  const NA = 160,
    NY = 40;
  const a0 = 1.12,
    a1 = Math.PI * 2 - 1.12;
  const pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  for (let j = 0; j <= NY; j++)
    for (let i = 0; i <= NA; i++) {
      const a = a0 + (i / NA) * (a1 - a0);
      const aa = a > Math.PI ? Math.PI * 2 - a : a;
      const lo = edge(aa) - 0.004;
      const t = j / NY;
      const y = lo + t * (top - lo);
      const sh = shell(a, y);
      // Thicker on top, thinning to nothing at the edge.
      const thick = 0.0008 + 0.0035 * smooth(0, 0.35, t);
      const r = Math.hypot(sh.x, sh.z) || 1;
      pos.push(sh.x + (sh.x / r) * thick, y, sh.z + (sh.z / r) * thick);
      uv.push(((a - a0) * 0.09) / 0.03, t);
    }
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NA; i++) {
      const a = j * (NA + 1) + i,
        b = a + 1,
        c = a + NA + 1,
        d = c + 1;
      idx.push(a, d, b, a, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const strands = canvasTex(256, 256, (x) => {
    x.clearRect(0, 0, 256, 256);
    // Solid above, combed strands breaking up toward the lower edge (bottom of the canvas).
    x.fillStyle = '#a59f96';
    x.fillRect(0, 0, 256, 150);
    for (let i = 0; i < 1600; i++) {
      const sx = rnd() * 256;
      const len = 40 + rnd() * 120;
      const y0 = 60 + rnd() * 80;
      const v = 120 + ((rnd() * 110) | 0);
      x.strokeStyle = `rgb(${v},${v - 3},${v - 9})`;
      x.lineWidth = 1 + rnd() * 1.6;
      x.beginPath();
      x.moveTo(sx, y0);
      x.quadraticCurveTo(sx + (rnd() - 0.5) * 6, y0 + len * 0.5, sx + (rnd() - 0.5) * 10, y0 + len);
      x.stroke();
    }
  });
  strands.wrapT = THREE.ClampToEdgeWrapping;
  strands.flipY = true;
  const m = new THREE.MeshStandardMaterial({
    map: strands,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.75,
    bumpMap: strands,
    bumpScale: 2,
  });
  return new THREE.Mesh(g, m);
}

// ---------------------------------------------------------------- trucker cap

/** Cap shape: band ellipse, centre shifted back, tall front and lower back. */
const CAP = {
  rx: 0.0815,
  rz: 0.102,
  cz: -0.006,
  yFront: 0.043,
  yBack: 0.036,
  hFront: 0.11,
  hBack: 0.072,
};
/** A point on the crown: a = angle from the front, k = 0 at the band to 1 at the button. */
function capPoint(a: number, k: number, lift = 0): THREE.Vector3 {
  const e = 2.9;
  const al = k * (Math.PI / 2);
  const s = Math.cos(al) ** (2 / e),
    c = Math.sin(al) ** (2 / e);
  const eh = 2.5;
  const sn = Math.sin(a),
    cs = Math.cos(a);
  const hx = Math.sign(sn) * Math.abs(sn) ** (2 / eh),
    hz = Math.sign(cs) * Math.abs(cs) ** (2 / eh);
  const fr = hz * s;
  const yb = (CAP.yFront + CAP.yBack) / 2 + ((CAP.yFront - CAP.yBack) / 2) * fr;
  const H = CAP.hBack + (CAP.hFront - CAP.hBack) * smooth(-0.55, 0.9, fr);
  const R = 1 + lift / 0.09;
  return V(CAP.rx * s * hx * R, yb + H * c + lift * c, CAP.cz + CAP.rz * s * hz * R);
}

function capTextures() {
  const navy = '#1c2238';
  // Foam front with the white emblem: a wheat sprig in an oval ring over a banner.
  const front = canvasTex(512, 384, (x) => {
    x.fillStyle = navy;
    x.fillRect(0, 0, 512, 384);
    for (let i = 0; i < 9000; i++) {
      x.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.05)';
      x.fillRect(rnd() * 512, rnd() * 384, 1, 1);
    }
    const cx = 256,
      cy = 165;
    x.strokeStyle = '#f2efe6';
    x.fillStyle = '#f2efe6';
    x.lineWidth = 9;
    x.beginPath();
    x.ellipse(cx, cy, 92, 70, 0, 0, Math.PI * 2);
    x.stroke();
    x.lineWidth = 6;
    x.beginPath();
    x.moveTo(cx, cy + 52);
    x.quadraticCurveTo(cx + 8, cy, cx - 2, cy - 54);
    x.stroke();
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      const sy = cy + 36 - t * 82;
      for (const s of [-1, 1]) {
        x.beginPath();
        x.ellipse(cx + s * 13 + 3 * t, sy, 7, 14, s * 0.6, 0, Math.PI * 2);
        x.fill();
      }
    }
    x.beginPath();
    x.ellipse(cx - 2, cy - 60, 6, 12, 0, 0, Math.PI * 2);
    x.fill();
    // Banner under the ring.
    x.beginPath();
    x.moveTo(cx - 130, cy + 70);
    x.quadraticCurveTo(cx, cy + 100, cx + 130, cy + 70);
    x.lineTo(cx + 130, cy + 102);
    x.quadraticCurveTo(cx, cy + 132, cx - 130, cy + 102);
    x.closePath();
    x.fill();
    x.fillStyle = navy;
    for (let i = 0; i < 9; i++)
      x.fillRect(cx - 100 + i * 24, cy + 96 + Math.sin(i / 2.6) * 3, 14, 8);
  });
  // Open mesh: dark holes in a navy net.
  const mesh = canvasTex(128, 128, (x) => {
    x.fillStyle = '#2a3150';
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#080a12';
    for (let j = 0; j < 8; j++)
      for (let i = 0; i < 8; i++) {
        x.beginPath();
        x.ellipse(i * 16 + (j % 2) * 8 + 4, j * 16 + 8, 5.2, 5.6, 0, 0, Math.PI * 2);
        x.fill();
      }
  });
  // Bill top: rows of stitching following the edge.
  const bill = canvasTex(512, 128, (x) => {
    x.fillStyle = navy;
    x.fillRect(0, 0, 512, 128);
    x.strokeStyle = 'rgba(120,130,170,0.55)';
    x.lineWidth = 1.5;
    x.setLineDash([5, 4]);
    for (const v of [0.22, 0.36, 0.5, 0.64, 0.78, 0.92]) {
      x.beginPath();
      x.moveTo(0, (1 - v) * 128);
      x.lineTo(512, (1 - v) * 128);
      x.stroke();
    }
  });
  bill.wrapS = bill.wrapT = THREE.ClampToEdgeWrapping;
  return { front, mesh, bill };
}

function trucker(): THREE.Group {
  const g = new THREE.Group();
  const T = capTextures();
  T.front.wrapS = T.front.wrapT = THREE.ClampToEdgeWrapping;
  const foam = new THREE.MeshStandardMaterial({ map: T.front, roughness: 0.9 });
  const net = new THREE.MeshStandardMaterial({
    map: T.mesh,
    bumpMap: T.mesh,
    bumpScale: 1.5,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const navy = new THREE.MeshStandardMaterial({ color: 0x1c2238, roughness: 0.85 });
  const under = new THREE.MeshStandardMaterial({ color: 0x2f3d33, roughness: 0.9 });
  const billTop = new THREE.MeshStandardMaterial({ map: T.bill, roughness: 0.85 });
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x111215, roughness: 0.45 });

  // The crown: foam front panels, mesh round the sides and back with the snapback opening.
  const FRONT = 1.02;
  const crown = (a0: number, a1: number, isFront: boolean) => {
    const NA = 80,
      NK = 36;
    const pos: number[] = [],
      uv: number[] = [],
      idx: number[] = [];
    for (let j = 0; j <= NK; j++)
      for (let i = 0; i <= NA; i++) {
        const a = a0 + (i / NA) * (a1 - a0);
        const p = capPoint(a, j / NK);
        pos.push(p.x, p.y, p.z);
        if (isFront)
          uv.push(0.5 + p.x / (CAP.rx * 2.05), (p.y - CAP.yFront + 0.004) / (CAP.hFront + 0.01));
        else uv.push(((a - a0) * 0.09) / 0.03, (j / NK) * 3.2);
      }
    for (let j = 0; j < NK; j++)
      for (let i = 0; i < NA; i++) {
        const a = j * (NA + 1) + i,
          b = a + 1,
          c = a + NA + 1,
          d = c + 1;
        if (!isFront) {
          // Snapback opening: an arch at the back above the strap.
          const p = capPoint(a0 + ((i + 0.5) / NA) * (a1 - a0), (j + 0.5) / NK);
          const hole = p.z < 0 && (p.x / 0.031) ** 2 + ((p.y - CAP.yBack) / 0.047) ** 2 < 1;
          if (hole) continue;
        }
        idx.push(a, b, d, a, d, c);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // Outward normals.
    const n = geo.attributes.normal!;
    const mid = ((NK / 3) | 0) * (NA + 1) + NA / 2;
    const out = V(pos[mid * 3]!, 0, pos[mid * 3 + 2]! - CAP.cz);
    if (out.dot(V(n.getX(mid), 0, n.getZ(mid))) < 0) {
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2]!, idx[i + 1]!];
      geo.setIndex(idx);
      geo.computeVertexNormals();
    }
    return geo;
  };
  g.add(new THREE.Mesh(crown(-FRONT, FRONT, true), foam));
  g.add(new THREE.Mesh(crown(FRONT, Math.PI * 2 - FRONT, false), net));
  // Piping along the seams, the sweatband edge and the button on top.
  const seamAt = (a: number, k1 = 1) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 30; i++) pts.push(capPoint(a, (i / 30) * k1, 0.0008));
    return new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0013, 6),
      navy,
    );
  };
  for (const a of [FRONT, -FRONT, 2.05, -2.05]) g.add(seamAt(a));
  const band: THREE.Vector3[] = [];
  for (let i = 0; i < 64; i++) band.push(capPoint((i / 64) * Math.PI * 2, 0, 0.0012));
  g.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(band, true), 96, 0.0022, 6, true),
      navy,
    ),
  );
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 16, 8), navy);
  button.scale.y = 0.45;
  button.position.copy(capPoint(0, 1)).add(V(0, 0.002, 0));
  g.add(button);
  // Edge of the arch, bound in navy.
  const arch: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = Math.PI * (i / 24);
    const x = -Math.cos(t) * 0.031,
      y = CAP.yBack + Math.sin(t) * 0.047;
    // Find the crown point at this x, y on the back.
    let best = capPoint(Math.PI, 0),
      bd = 1;
    for (let a = 2.4; a <= 3.9; a += 0.01)
      for (let k = 0; k < 0.8; k += 0.01) {
        const p = capPoint(a, k);
        const d = Math.abs(p.x - x) + Math.abs(p.y - y);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
    arch.push(best.clone().add(V(0, 0, -0.0008)));
  }
  g.add(
    new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arch), 40, 0.0018, 6), navy),
  );
  // The plastic snap strap across the bottom of the opening, with its row of snaps.
  const strap: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI - 0.62 + (i / 16) * 1.24;
    strap.push(capPoint(a, 0.05, 0.0028));
  }
  const strapCurve = new THREE.CatmullRomCurve3(strap);
  const sg = new THREE.TubeGeometry(strapCurve, 40, 0.006, 8);
  sg.scale(1, 1, 1);
  const strapMesh = new THREE.Mesh(sg, strapMat);
  strapMesh.scale.set(1, 1, 1);
  g.add(strapMesh);
  for (let i = 0; i < 7; i++) {
    const p = strapCurve.getPointAt(0.2 + i * 0.1);
    const snap = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.004, 10), strapMat);
    snap.position.copy(p).add(V(0, 0, -0.004));
    snap.rotation.x = Math.PI / 2;
    g.add(snap);
  }
  // The long, pre-curved bill.
  {
    const NU = 48,
      NK = 14,
      half = 1.32;
    const top: THREE.Vector3[] = [];
    for (let j = 0; j <= NK; j++)
      for (let i = 0; i <= NU; i++) {
        const u = -1 + (2 * i) / NU;
        const k = j / NK;
        const a = u * half;
        const base = capPoint(a, 0);
        const out = V(Math.sin(a) * CAP.rz, 0, Math.cos(a) * CAP.rx).normalize();
        const L = 0.07 * (1 - u * u) ** 0.5 + 0.004;
        const p = base.clone().addScaledVector(out, L * k);
        p.y += -0.008 * k - 0.026 * (p.x / 0.09) ** 2 * k;
        top.push(p);
      }
    const T2 = 0.0035;
    const build = (lower: boolean) => {
      const pos: number[] = [],
        uv: number[] = [],
        idx: number[] = [];
      top.forEach((p, n) => {
        pos.push(p.x, p.y - (lower ? T2 : 0), p.z);
        uv.push((n % (NU + 1)) / NU, Math.floor(n / (NU + 1)) / NK);
      });
      for (let j = 0; j < NK; j++)
        for (let i = 0; i < NU; i++) {
          const a = j * (NU + 1) + i,
            b = a + 1,
            c = a + NU + 1,
            d = c + 1;
          if (lower) idx.push(a, b, d, a, d, c);
          else idx.push(a, d, b, a, c, d);
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      if (geo.attributes.normal!.getY(NU / 2 + (NU + 1) * 5) * (lower ? -1 : 1) < 0) {
        for (let i = 0; i < idx.length; i += 3)
          [idx[i + 1], idx[i + 2]] = [idx[i + 2]!, idx[i + 1]!];
        geo.setIndex(idx);
        geo.computeVertexNormals();
      }
      return geo;
    };
    g.add(new THREE.Mesh(build(false), billTop), new THREE.Mesh(build(true), under));
    // Rounded edge round the outside of the bill.
    const rim: THREE.Vector3[] = [];
    for (let i = 0; i <= NU; i++) rim.push(top[NK * (NU + 1) + i]!.clone().add(V(0, -T2 / 2, 0)));
    g.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim), 80, T2 * 0.6, 6),
        navy,
      ),
    );
  }
  return g;
}

// ---------------------------------------------------------------- whole head

export function buildHead(): { group: THREE.Group; cap: THREE.Group } {
  const g = new THREE.Group();
  const maps = skinMaps();
  // Skin: a soft sheen at grazing angles stands in for light through the skin.
  const skin = new THREE.MeshPhysicalMaterial({
    map: maps.map,
    bumpMap: maps.bump,
    bumpScale: 1.8,
    roughness: 0.58,
    vertexColors: true,
    sheen: 0.35,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0xff9c84),
  });
  // Eyelids: matched to the shaded skin in the eye sockets.
  const plainSkin = new THREE.MeshStandardMaterial({
    color: 0xa5705c,
    roughness: 0.62,
    bumpMap: leatherBump(),
    bumpScale: 0.3,
  });
  const earSkin = new THREE.MeshStandardMaterial({ color: 0xbc8470, roughness: 0.6 });
  g.add(headMesh(skin));
  g.add(eyes(plainSkin));
  g.add(brows());
  for (const s of [-1, 1]) {
    const e = ear(s, earSkin);
    e.position.set(s * 0.075, -0.006, -0.014);
    e.rotation.set(0.12, s * 0.28, s * -0.05);
    g.add(e);
  }
  g.add(hair());
  // Worn loose and pushed back: front up off the forehead, the back down on the nape.
  const cap = trucker();
  cap.rotation.x = -0.3;
  cap.position.set(0, 0.006, -0.004);
  g.add(cap);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });
  void white;
  return { group: g, cap };
}
