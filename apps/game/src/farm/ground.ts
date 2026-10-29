import * as THREE from 'three';
import { FARM, type XY, groundHeight, smoothLine, smoothRing } from './layout.ts';

/**
 * The farm's ground: one terrain mesh shaped by the slope model and painted from the map
 * data (mowed lawn, gravel yard, mowed paths, pumpkin patch, road, wild fields), with a fine
 * grain texture on top so it holds up when a miniature kart is right down on it.
 * Built in real metres; the scene scales it up.
 */

// Painted area (real metres) and resolution.
const X0 = -80,
  X1 = 190,
  Y0 = -90,
  Y1 = 262;
const PPM = 8; // canvas pixels per real metre
// Mesh area: wider than the painted area so the land runs on to the horizon.
const MX0 = -320,
  MX1 = 420,
  MY0 = -340,
  MY1 = 520;
const CELL = 2.5;

let seed = 4242;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

export function buildGround(): THREE.Mesh {
  const geo = terrainGeometry();
  const mat = new THREE.MeshStandardMaterial({ map: paintGround(), roughness: 1, metalness: 0 });
  addDetail(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'farmGround';
  return mesh;
}

function terrainGeometry(): THREE.BufferGeometry {
  const nx = Math.round((MX1 - MX0) / CELL),
    ny = Math.round((MY1 - MY0) / CELL);
  const pos = new Float32Array((nx + 1) * (ny + 1) * 3);
  const uv = new Float32Array((nx + 1) * (ny + 1) * 2);
  let i = 0,
    k = 0;
  for (let r = 0; r <= ny; r++) {
    for (let c = 0; c <= nx; c++) {
      const x = MX0 + c * CELL,
        y = MY0 + r * CELL;
      pos[i++] = x;
      pos[i++] = groundHeight(x, y);
      pos[i++] = -y;
      uv[k++] = (x - X0) / (X1 - X0);
      uv[k++] = (y - Y0) / (Y1 - Y0);
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < ny; r++)
    for (let c = 0; c < nx; c++) {
      const a = r * (nx + 1) + c,
        b = a + 1,
        d = a + nx + 1,
        e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- painting

function paintGround(): THREE.CanvasTexture {
  const W = Math.round((X1 - X0) * PPM),
    H = Math.round((Y1 - Y0) * PPM);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  const P = (p: XY): [number, number] => [(p[0] - X0) * PPM, (Y1 - p[1]) * PPM];
  const poly = (pts: XY[]) => {
    x.beginPath();
    pts.forEach((p, i) => (i ? x.lineTo(...P(p)) : x.moveTo(...P(p))));
    x.closePath();
  };
  const line = (pts: XY[]) => {
    x.beginPath();
    pts.forEach((p, i) => (i ? x.lineTo(...P(p)) : x.moveTo(...P(p))));
  };
  const speckle = (n: number, cols: string[], s0: number, s1: number) => {
    for (let i = 0; i < n; i++) {
      x.fillStyle = cols[(rnd() * cols.length) | 0]!;
      const s = s0 + rnd() * (s1 - s0);
      x.fillRect(rnd() * W, rnd() * H, s, s);
    }
  };

  // 1. Wild meadow everywhere: weeds, long grass and wildflowers.
  x.fillStyle = '#93a85e';
  x.fillRect(0, 0, W, H);
  speckle(260000, ['#86a052', '#a2b66a', '#7c9548', '#adbd72', '#8fa25a'], 2, 6);
  speckle(26000, ['#e8d44a', '#ffffff', '#b28ad8', '#f0a0c0', '#f4e27a'], 2, 3.5);

  // 2. The property: mowed lawn with mower stripes along the farm grid.
  x.save();
  poly(FARM.boundary);
  x.clip();
  x.fillStyle = '#6fa645';
  x.fillRect(0, 0, W, H);
  x.save();
  x.translate(W / 2, H / 2);
  x.rotate(-(FARM.farmGridDeg * Math.PI) / 180);
  for (let s = -H; s < H; s += 7 * PPM) {
    x.fillStyle = 'rgba(255,255,230,0.07)';
    x.fillRect(-H, s, 2 * H, 3.5 * PPM);
  }
  x.restore();
  speckle(140000, ['#68a040', '#77ae4b', '#62973c', '#7bb352'], 1.5, 4);
  x.restore();

  // 3. Pumpkin patch: soil with rows of vines.
  x.save();
  poly(FARM.pumpkin_patch);
  x.clip();
  x.fillStyle = '#7a5c3c';
  x.fillRect(0, 0, W, H);
  speckle(30000, ['#6b4f33', '#86684a', '#5f462e'], 2, 5);
  const ys = FARM.pumpkin_patch.map((p) => p[1]);
  for (let yy = Math.min(...ys) + 1.6; yy < Math.max(...ys); yy += 3.2) {
    x.strokeStyle = '#4f7d2e';
    x.lineWidth = 1.6 * PPM;
    x.beginPath();
    for (let xx = -5; xx < 110; xx += 1) {
      const p = P([xx, yy + Math.sin(xx * 0.9) * 0.35]);
      xx === -5 ? x.moveTo(...p) : x.lineTo(...p);
    }
    x.stroke();
  }
  speckle(9000, ['#5d8f35', '#3f6f25', '#6ea43f'], 3, 8);
  x.restore();

  // 4. Gravel yard and driveway.
  for (const gravel of [smoothRing(FARM.gravel, 6), smoothRing(FARM.gravel_apron, 6)]) {
    x.fillStyle = '#c4ad84';
    poly(gravel);
    x.fill();
    x.save();
    poly(gravel);
    x.clip();
    speckle(160000, ['#b39c74', '#d3bf98', '#a89071', '#e0cfa9', '#9c876b'], 1.2, 3);
    x.restore();
  }
  // Grass patches on both sides of the barn ramp.
  x.fillStyle = '#6fa645';
  for (const p of FARM.grass_patches) {
    poly(p);
    x.fill();
  }

  // Concrete pad off the front door, flush with the ground, and the sidewalk to the porch.
  {
    const r = FARM.house_pad;
    const a = ((r.angle ?? 0) * Math.PI) / 180;
    const u: XY = [Math.cos(a), Math.sin(a)],
      v: XY = [-Math.sin(a), Math.cos(a)];
    const corner = (su: number, sv: number): XY => [
      r.c[0] + (u[0] * su * r.w) / 2 + (v[0] * sv * r.h) / 2,
      r.c[1] + (u[1] * su * r.w) / 2 + (v[1] * sv * r.h) / 2,
    ];
    x.fillStyle = '#c9c5bb';
    poly([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]);
    x.fill();
    x.strokeStyle = '#c9c5bb';
    x.lineWidth = FARM.house_walk.width * PPM;
    x.lineCap = 'square';
    x.lineJoin = 'miter';
    line(FARM.house_walk.pts);
    x.stroke();
    // Expansion joints.
    x.strokeStyle = 'rgba(90,88,80,0.45)';
    x.lineWidth = 1.2;
    for (const k of [-1 / 3, 1 / 3]) {
      line([
        [r.c[0] + u[0] * k * r.w - (v[0] * r.h) / 2, r.c[1] + u[1] * k * r.w - (v[1] * r.h) / 2],
        [r.c[0] + u[0] * k * r.w + (v[0] * r.h) / 2, r.c[1] + u[1] * k * r.w + (v[1] * r.h) / 2],
      ]);
      x.stroke();
    }
  }

  // 5. Mowed grass paths and the grass lane, with tractor tyre marks.
  for (const path of FARM.paths) {
    const pts = smoothLine(path.pts, 10);
    x.lineCap = 'round';
    x.lineJoin = 'round';
    x.strokeStyle = '#8cbf58';
    x.lineWidth = path.width * PPM;
    line(pts);
    x.stroke();
    x.strokeStyle = 'rgba(80,110,40,0.55)';
    x.lineWidth = 0.35 * PPM;
    for (const off of [-0.55, 0.55]) {
      x.save();
      x.translate(off * PPM, off * 0.3 * PPM);
      line(pts);
      x.stroke();
      x.restore();
    }
  }

  // 6. Vegetable and flower garden.
  {
    const g = FARM.garden;
    x.save();
    x.translate(...P(g.c));
    x.rotate(-((g.angle ?? 0) * Math.PI) / 180);
    x.fillStyle = '#5e4630';
    x.fillRect((-g.h / 2) * PPM, (-g.w / 2) * PPM, g.h * PPM, g.w * PPM);
    for (let i = 0; i < 140; i++) {
      x.fillStyle = ['#e04848', '#f2c230', '#ffffff', '#c060d0', '#4f9a35', '#4f9a35'][i % 6]!;
      x.fillRect((rnd() - 0.5) * g.h * PPM, (rnd() - 0.5) * g.w * PPM, 4, 4);
    }
    x.restore();
  }

  // 7. The paved country road (aged and cracked), its light ditch, and the gravel lane.
  x.lineCap = 'butt';
  x.strokeStyle = '#5b6550';
  x.lineWidth = 1.6 * PPM;
  for (const d of FARM.ditch) {
    line(d);
    x.stroke();
  }
  x.strokeStyle = '#4d4f53';
  x.lineWidth = 6.2 * PPM;
  line(FARM.road);
  x.stroke();
  roadDetail(x, P);
  x.strokeStyle = '#b6a785';
  x.lineWidth = 4.2 * PPM;
  line(FARM.lane);
  x.stroke();
  x.strokeStyle = 'rgba(120,104,80,0.6)';
  x.lineWidth = 0.4 * PPM;
  line(FARM.lane);
  x.stroke();

  // A plain meadow rim, so the texture's clamped edge colour carries on smoothly to the horizon.
  x.strokeStyle = '#93a85e';
  x.lineWidth = 24;
  x.strokeRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Grain, patches and a web of old cracks on the country road. */
function roadDetail(x: CanvasRenderingContext2D, P: (p: XY) => [number, number]): void {
  const [a, b] = FARM.road as [XY, XY];
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  const ux = dx / L,
    uy = dy / L,
    nx = -uy,
    ny = ux;
  for (let i = 0; i < 9000; i++) {
    const s = rnd() * L,
      o = (rnd() - 0.5) * 5.8;
    x.fillStyle = ['#56585c', '#45474b', '#5f6165'][(rnd() * 3) | 0]!;
    x.fillRect(...P([a[0] + ux * s + nx * o, a[1] + uy * s + ny * o]), 3, 3);
  }
  // Tar-sealed cracks: long wandering lines plus short branches.
  x.strokeStyle = '#2c2d30';
  x.lineWidth = 1.4;
  for (let i = 0; i < 140; i++) {
    let s = rnd() * L,
      o = (rnd() - 0.5) * 5;
    x.beginPath();
    x.moveTo(...P([a[0] + ux * s + nx * o, a[1] + uy * s + ny * o]));
    for (let k = 0; k < 6; k++) {
      s += (rnd() - 0.3) * 1.6;
      o += (rnd() - 0.5) * 1.2;
      o = Math.max(-2.9, Math.min(2.9, o));
      x.lineTo(...P([a[0] + ux * s + nx * o, a[1] + uy * s + ny * o]));
    }
    x.stroke();
  }
  // Worn, faded centre line.
  x.strokeStyle = 'rgba(214,190,90,0.45)';
  x.lineWidth = 0.14 * PPM;
  x.setLineDash([3 * PPM, 3 * PPM]);
  x.beginPath();
  x.moveTo(...P(a));
  x.lineTo(...P(b));
  x.stroke();
  x.setLineDash([]);
}

/** Fine, neutral grain tiled at high frequency so close-up ground isn't a smooth smear. */
function addDetail(mat: THREE.MeshStandardMaterial): void {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  x.fillStyle = '#9e9e9e';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const v = 120 + ((rnd() * 90) | 0);
    x.fillStyle = `rgb(${v},${v},${v})`;
    const s = 1 + rnd() * 3;
    x.fillRect(rnd() * S, rnd() * S, s, s * (1 + rnd() * 2));
  }
  const detail = new THREE.CanvasTexture(c);
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
  detail.anisotropy = 16;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.detailMap = { value: detail };
    sh.uniforms.detailRepeat = { value: ((X1 - X0) / 2.2) as number };
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <map_pars_fragment>',
        '#include <map_pars_fragment>\nuniform sampler2D detailMap;\nuniform float detailRepeat;',
      )
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n  diffuseColor.rgb *= mix(1.0, texture2D(detailMap, vMapUv * detailRepeat).r * 1.62, 0.5);',
      );
  };
}
