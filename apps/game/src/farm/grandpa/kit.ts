import * as THREE from 'three';
import { tube } from '../../render/modelKit.ts';
import * as tex from '../../render/textures.ts';

/**
 * Shared kit for Grandpa: painted cloth, leather and skin textures, a lofting helper, cloth
 * wrinkles, and tools that lay seams, pockets and stitching onto a garment's surface by
 * casting rays at it (so details follow every fold).
 */

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** A soft round bump centred on (cx, cy). */
export const G = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) =>
  Math.exp(-(((x - cx) / sx) ** 2) - ((y - cy) / sy) ** 2);

let seed = 1901;
export const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

/** Smooth curve through (x, value) keys (cubic Hermite, finite-difference slopes). */
export function spline(keys: [number, number][]): (x: number) => number {
  const n = keys.length;
  const k = (i: number) => keys[clamp(i, 0, n - 1)]!;
  const slope = (i: number) => (k(i + 1)[1] - k(i - 1)[1]) / (k(i + 1)[0] - k(i - 1)[0] || 1);
  return (x) => {
    if (x <= k(0)[0]) return k(0)[1];
    if (x >= k(n - 1)[0]) return k(n - 1)[1];
    let i = 0;
    while (k(i + 1)[0] < x) i++;
    const [x0, v0] = k(i),
      [x1, v1] = k(i + 1);
    const h = x1 - x0,
      t = (x - x0) / h;
    const m0 = slope(i) * h,
      m1 = slope(i + 1) * h;
    const t2 = t * t,
      t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * v0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * v1 + (t3 - t2) * m1
    );
  };
}

// ---------------------------------------------------------------- geometry

/** A vertical tube from y0 to y1, rings given as [y, half width, half depth, z shift]. */
export function vTube(
  y0: number,
  y1: number,
  rings: [number, number, number, number?][],
  around = 32,
  perMetre = 120,
): THREE.BufferGeometry {
  const span = y1 - y0;
  return tube(
    new THREE.LineCurve3(V(0, y0, 0), V(0, y1, 0)),
    rings.map(([y, w, d, dz]) => ({ t: (y - y0) / span, w, h: d, dy: dz ?? 0, ex: 0.92 })),
    Math.max(8, Math.round(Math.abs(span) * perMetre)),
    around,
    V(0, 0, 1),
  );
}

/** Average normals of vertices that share a position, so tube and lathe seams don't show. */
export function smoothSeams(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeVertexNormals();
  const p = g.attributes.position!,
    n = g.attributes.normal!;
  const map = new Map<string, number[]>();
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i) * 1e5)},${Math.round(p.getY(i) * 1e5)},${Math.round(p.getZ(i) * 1e5)}`;
    const list = map.get(key);
    if (list) list.push(i);
    else map.set(key, [i]);
  }
  const s = new THREE.Vector3();
  for (const list of map.values()) {
    if (list.length < 2) continue;
    s.set(0, 0, 0);
    for (const i of list) s.add(V(n.getX(i), n.getY(i), n.getZ(i)));
    s.normalize();
    for (const i of list) n.setXYZ(i, s.x, s.y, s.z);
  }
  return g;
}

/**
 * Push a garment in and out round a vertical axis (cloth folds), and shade the folds: the
 * vertex colour darkens in the creases and lifts on the ridges. f gets the point and its
 * angle round the axis (0 = front, +π/2 = +x) and returns metres outward.
 */
export function wrinkle(
  g: THREE.BufferGeometry,
  f: (x: number, y: number, z: number, a: number) => number,
  shade = 22,
  cx = 0,
  cz = 0,
): THREE.BufferGeometry {
  const p = g.attributes.position!;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) - cx,
      y = p.getY(i),
      z = p.getZ(i) - cz;
    const a = Math.atan2(x, z);
    const r = Math.hypot(x, z) || 1;
    const d = f(x, y, z, a);
    p.setXYZ(i, cx + x + (x / r) * d, y, cz + z + (z / r) * d);
    const k = clamp(1 + d * shade, 0.62, 1.12);
    col.set([k, k, k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return smoothSeams(g);
}

/** Give a geometry a plain white vertex colour (for materials that use vertex colours). */
export function white(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.attributes.position!.count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return g;
}

// ---------------------------------------------------------------- laying things on cloth

const ray = new THREE.Raycaster();
export interface Hit {
  p: THREE.Vector3;
  n: THREE.Vector3;
}
/** Where a ray from `from` along `dir` meets the target mesh (its own frame), or null. */
export function hitAt(target: THREE.Mesh, from: THREE.Vector3, dir: THREE.Vector3): Hit | null {
  target.updateMatrixWorld(true);
  ray.set(from, dir.clone().normalize());
  ray.far = 3;
  const h = ray.intersectObject(target, false)[0];
  if (!h || !h.face) return null;
  return { p: h.point.clone(), n: h.face.normal.clone().normalize() };
}

/** A ray aimed at a vertical axis from angle a (0 = front) at height y. */
export function radial(a: number, y: number, cx = 0, cz = 0) {
  return {
    from: V(cx + Math.sin(a) * 0.6, y, cz + Math.cos(a) * 0.6),
    dir: V(-Math.sin(a), 0, -Math.cos(a)),
  };
}
/** A ray straight in from the front (sign 1) or back (sign -1) at (x, y). */
export const straight = (x: number, y: number, sign = 1) => ({
  from: V(x, y, sign * 0.6),
  dir: V(0, 0, -sign),
});

/**
 * A patch that hugs the target: rows x cols samples from `at(u, v)` (u, v in 0..1), lifted
 * `off` off the surface; samples where `keep(u, v)` is false are left out.
 */
export function patch(
  target: THREE.Mesh,
  cols: number,
  rows: number,
  at: (u: number, v: number) => { from: THREE.Vector3; dir: THREE.Vector3 },
  off: number,
  mat: THREE.Material,
  keep: (u: number, v: number) => boolean = () => true,
): THREE.Mesh {
  const pts: (Hit | null)[] = [];
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= cols; i++) {
      const u = i / cols,
        v = j / rows;
      const r = at(u, v);
      pts.push(hitAt(target, r.from, r.dir));
    }
  const pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  pts.forEach((h, k) => {
    const p = h ? h.p.clone().addScaledVector(h.n, off) : V(0, 0, 0);
    pos.push(p.x, p.y, p.z);
    uv.push((k % (cols + 1)) / cols, Math.floor(k / (cols + 1)) / rows);
  });
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i,
        b = a + 1,
        c = a + cols + 1,
        d = c + 1;
      const ok = [a, b, c, d].every((q) => pts[q]) && keep((i + 0.5) / cols, (j + 0.5) / rows);
      if (ok) idx.push(a, b, d, a, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Make sure the patch faces outward (same way as the surface under it).
  const h0 = pts.find((h) => h);
  const n0 = g.attributes.normal!;
  const i0 = pts.indexOf(h0 ?? null);
  if (h0 && i0 >= 0 && V(n0.getX(i0), n0.getY(i0), n0.getZ(i0)).dot(h0.n) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2]!, idx[i + 1]!];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(white(g), mat);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/**
 * A narrow band lying along a path on the target (seams, stitching, piping): samples from
 * `at(t)`, `width` wide, lifted `off`; uv.u runs along in metres / `repeat`.
 */
export function band(
  target: THREE.Mesh,
  n: number,
  at: (t: number) => { from: THREE.Vector3; dir: THREE.Vector3 },
  width: number,
  off: number,
  mat: THREE.Material,
  repeat = 1,
): THREE.Mesh | null {
  const hits: Hit[] = [];
  for (let i = 0; i <= n; i++) {
    const r = at(i / n);
    const h = hitAt(target, r.from, r.dir);
    if (h) hits.push(h);
  }
  if (hits.length < 2) return null;
  const pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  let len = 0;
  hits.forEach((h, i) => {
    const a = hits[Math.max(0, i - 1)]!.p,
      b = hits[Math.min(hits.length - 1, i + 1)]!.p;
    const t = b.clone().sub(a).normalize();
    const side = new THREE.Vector3()
      .crossVectors(h.n, t)
      .normalize()
      .multiplyScalar(width / 2);
    if (i) len += h.p.distanceTo(hits[i - 1]!.p);
    const c = h.p.clone().addScaledVector(h.n, off);
    pos.push(c.x - side.x, c.y - side.y, c.z - side.z, c.x + side.x, c.y + side.y, c.z + side.z);
    uv.push(len / repeat, 0, len / repeat, 1);
    if (i) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k + 1, k - 2, k + 1, k);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(white(g), mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** Stand a small object on the target where a ray meets it, its +z along the surface normal. */
export function stick(
  target: THREE.Mesh,
  r: { from: THREE.Vector3; dir: THREE.Vector3 },
  obj: THREE.Object3D,
  off = 0,
  up = V(0, 1, 0),
): THREE.Object3D | null {
  const h = hitAt(target, r.from, r.dir);
  if (!h) return null;
  obj.position.copy(h.p).addScaledVector(h.n, off);
  const z = h.n.clone();
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return obj;
}

// ---------------------------------------------------------------- textures

export function canvasTex(
  w: number,
  h: number,
  draw: (x: CanvasRenderingContext2D) => void,
  srgb = true,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * The flannel from the photo: a big blue-violet and navy plaid crossed by red bands and fine
 * white and pale-blue lines, with a brushed, slightly fuzzy face.
 */
export function plaid(): THREE.CanvasTexture {
  return canvasTex(256, 256, (x) => {
    x.fillStyle = '#4b4f86';
    x.fillRect(0, 0, 256, 256);
    const band = (pos: number, w: number, col: string, alpha: number) => {
      x.globalAlpha = alpha;
      x.fillStyle = col;
      x.fillRect(pos, 0, w, 256);
      x.fillRect(0, pos, 256, w);
    };
    band(0, 92, '#1d2246', 0.78);
    band(118, 46, '#b0343a', 0.82);
    band(132, 18, '#7a1f28', 0.5);
    band(176, 8, '#e9e6de', 0.85);
    band(196, 4, '#9fb2dc', 0.8);
    band(220, 30, '#1d2246', 0.55);
    band(40, 4, '#e9e6de', 0.55);
    x.globalAlpha = 1;
    // Twill: fine diagonal threads, then brushed fuzz.
    x.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let i = -256; i < 256; i += 3) {
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i + 256, 256);
      x.stroke();
    }
    for (let i = 0; i < 9000; i++) {
      x.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)';
      x.fillRect(rnd() * 256, rnd() * 256, 1, 1 + rnd() * 3);
    }
  });
}

/** Faded blue work denim: diagonal twill and worn, lighter streaks. */
export function denim(): THREE.CanvasTexture {
  return canvasTex(256, 256, (x) => {
    x.fillStyle = '#3e5a87';
    x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(16,26,52,0.4)';
    x.lineWidth = 1.2;
    for (let i = -256; i < 256; i += 3) {
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i + 256, 256);
      x.stroke();
    }
    for (let i = 0; i < 7000; i++) {
      x.fillStyle = rnd() < 0.6 ? 'rgba(205,218,238,0.10)' : 'rgba(10,20,40,0.12)';
      x.fillRect(rnd() * 256, rnd() * 256, 1, 2 + rnd() * 3);
    }
    // Slubs: short pale flecks in the weft.
    for (let i = 0; i < 260; i++) {
      x.fillStyle = 'rgba(220,228,240,0.18)';
      x.fillRect(rnd() * 256, rnd() * 256, 4 + rnd() * 10, 1);
    }
  });
}

/** Leather grain (bump): fine pebbling and a few creases. */
export function leatherBump(): THREE.CanvasTexture {
  return canvasTex(
    256,
    256,
    (x) => {
      x.fillStyle = '#808080';
      x.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 14000; i++) {
        const v = 100 + ((rnd() * 70) | 0);
        x.fillStyle = `rgb(${v},${v},${v})`;
        x.beginPath();
        x.arc(rnd() * 256, rnd() * 256, 0.6 + rnd() * 1.6, 0, Math.PI * 2);
        x.fill();
      }
      x.strokeStyle = 'rgba(40,40,40,0.5)';
      for (let i = 0; i < 30; i++) {
        x.lineWidth = 0.6 + rnd();
        x.beginPath();
        const px = rnd() * 256,
          py = rnd() * 256;
        x.moveTo(px, py);
        x.quadraticCurveTo(
          px + rnd() * 30 - 15,
          py + rnd() * 10,
          px + rnd() * 50 - 25,
          py + rnd() * 20,
        );
        x.stroke();
      }
    },
    false,
  );
}

/** Dashed stitching: a light dash on transparency, for bands with alphaTest. */
export function stitchTex(): THREE.CanvasTexture {
  return canvasTex(64, 16, (x) => {
    x.clearRect(0, 0, 64, 16);
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.roundRect(8, 4, 40, 8, 4);
    x.fill();
  });
}

export const fabricBump = () => tex.fabricBump();
