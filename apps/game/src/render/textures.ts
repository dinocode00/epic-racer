import * as THREE from 'three';

/**
 * Procedural textures painted on canvases. Placeholder art until hand-painted
 * textures exist, but detailed enough to read well at TV resolution.
 */

const all: THREE.Texture[] = [];

/** Every texture created, so the retro look can switch them to nearest filtering. */
export function allTextures(): readonly THREE.Texture[] {
  return all;
}

let seed = 1337;
export function rnd(): number {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, repeat = true, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16; // the renderer clamps this to what the GPU supports
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  all.push(t);
  return t;
}

function speckle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  n: number,
  colors: string[],
  size: [number, number],
): void {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)]!;
    const s = size[0] + rnd() * (size[1] - size[0]);
    ctx.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

/** Road: asphalt grain, white edge lines, dashed centre line. u = across, v = along. */
export function asphalt(): THREE.CanvasTexture {
  const W = 512,
    H = 512;
  const [c, x] = canvas(W, H);
  x.fillStyle = '#4b4d52';
  x.fillRect(0, 0, W, H);
  speckle(x, W, H, 26000, ['#55575c', '#43454a', '#5d5f63', '#3c3e42', '#606268'], [1, 2.5]);
  // Subtle tyre wear bands where cars drive.
  for (const u of [0.3, 0.7]) {
    const g = x.createLinearGradient((u - 0.12) * W, 0, (u + 0.12) * W, 0);
    g.addColorStop(0, 'rgba(20,20,22,0)');
    g.addColorStop(0.5, 'rgba(20,20,22,0.22)');
    g.addColorStop(1, 'rgba(20,20,22,0)');
    x.fillStyle = g;
    x.fillRect((u - 0.12) * W, 0, 0.24 * W, H);
  }
  // Cracks / patches.
  x.strokeStyle = 'rgba(30,30,32,0.5)';
  for (let i = 0; i < 14; i++) {
    x.beginPath();
    let px = rnd() * W,
      py = rnd() * H;
    x.moveTo(px, py);
    for (let k = 0; k < 6; k++) {
      px += (rnd() - 0.5) * 30;
      py += rnd() * 20;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  // Edge lines.
  x.fillStyle = '#e9e6dc';
  x.fillRect(0.035 * W, 0, 0.018 * W, H);
  x.fillRect((1 - 0.053) * W, 0, 0.018 * W, H);
  // Centre dashes.
  x.fillRect(0.493 * W, 0, 0.014 * W, H * 0.45);
  return finish(c);
}

/** Red / white rumble strip. */
export function kerb(): THREE.CanvasTexture {
  const [c, x] = canvas(64, 128);
  x.fillStyle = '#d8292b';
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#f2efe8';
  x.fillRect(0, 64, 64, 64);
  speckle(x, 64, 128, 500, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.08)'], [1, 2]);
  return finish(c);
}

/** Concrete barrier with sponsor-style panels. */
export function barrier(): THREE.CanvasTexture {
  const [c, x] = canvas(256, 64);
  x.fillStyle = '#d9d6cf';
  x.fillRect(0, 0, 256, 64);
  speckle(x, 256, 64, 1500, ['#cfccc4', '#e3e0d9', '#c4c1b9'], [1, 2]);
  x.fillStyle = '#2f6fd0';
  x.fillRect(0, 10, 256, 26);
  x.fillStyle = '#f5c518';
  x.font = 'bold 19px sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('EPIC RACER', 128, 24);
  // Chevrons at the panel ends.
  for (const cx of [18, 238]) {
    x.beginPath();
    x.moveTo(cx - 8, 14);
    x.lineTo(cx + 2, 23);
    x.lineTo(cx - 8, 32);
    x.lineTo(cx - 2, 32);
    x.lineTo(cx + 8, 23);
    x.lineTo(cx - 2, 14);
    x.fill();
  }
  x.fillStyle = 'rgba(0,0,0,0.18)';
  x.fillRect(0, 56, 256, 8);
  return finish(c);
}

export function grass(): THREE.CanvasTexture {
  const S = 512;
  const [c, x] = canvas(S);
  x.fillStyle = '#5f8f3a';
  x.fillRect(0, 0, S, S);
  // Large soft patches.
  for (let i = 0; i < 60; i++) {
    const r = 20 + rnd() * 70;
    const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
    const col = rnd() > 0.5 ? '108,158,64' : '78,122,46';
    g.addColorStop(0, `rgba(${col},0.35)`);
    g.addColorStop(1, `rgba(${col},0)`);
    x.save();
    x.translate(rnd() * S, rnd() * S);
    x.fillStyle = g;
    x.fillRect(-r, -r, 2 * r, 2 * r);
    x.restore();
  }
  // Blades.
  for (let i = 0; i < 9000; i++) {
    x.strokeStyle = ['#4f7d2f', '#6fa246', '#7eb352', '#567f34'][Math.floor(rnd() * 4)]!;
    const px = rnd() * S,
      py = rnd() * S;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + (rnd() - 0.5) * 3, py - 2 - rnd() * 4);
    x.stroke();
  }
  return finish(c);
}

export function dirt(): THREE.CanvasTexture {
  const [c, x] = canvas(256);
  x.fillStyle = '#8a6b47';
  x.fillRect(0, 0, 256, 256);
  speckle(x, 256, 256, 6000, ['#7a5d3c', '#9a7a52', '#6e5234', '#a5865d'], [1, 3]);
  return finish(c);
}

export function checker(): THREE.CanvasTexture {
  const [c, x] = canvas(128, 32);
  for (let i = 0; i < 16; i++)
    for (let j = 0; j < 4; j++) {
      x.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4';
      x.fillRect(i * 8, j * 8, 8, 8);
    }
  return finish(c);
}

/** Glowing chevrons for boost pads (used as emissive map). */
export function chevrons(): THREE.CanvasTexture {
  const [c, x] = canvas(128, 128);
  x.fillStyle = '#5a1d00';
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#ffb02e';
  for (let k = 0; k < 3; k++) {
    const y = 18 + k * 36;
    x.beginPath();
    x.moveTo(14, y + 24);
    x.lineTo(64, y);
    x.lineTo(114, y + 24);
    x.lineTo(114, y + 36);
    x.lineTo(64, y + 12);
    x.lineTo(14, y + 36);
    x.closePath();
    x.fill();
  }
  return finish(c, false);
}

/** Crowd for grandstands: a field of coloured heads. */
export function crowd(): THREE.CanvasTexture {
  const [c, x] = canvas(256, 128);
  x.fillStyle = '#3a3a48';
  x.fillRect(0, 0, 256, 128);
  for (let row = 0; row < 8; row++) {
    for (let i = 0; i < 32; i++) {
      x.fillStyle = ['#e8433a', '#2f7de1', '#f5c518', '#f0f0f0', '#3fbf5f', '#ff8c2e', '#b05de0'][
        Math.floor(rnd() * 7)
      ]!;
      x.fillRect(i * 8 + 1 + (row % 2) * 4, row * 16 + 8, 6, 7);
      x.fillStyle = ['#f2c9a0', '#c48a5a', '#8d5a3c', '#ffe0c0'][Math.floor(rnd() * 4)]!;
      x.fillRect(i * 8 + 2 + (row % 2) * 4, row * 16 + 3, 4, 5);
    }
  }
  return finish(c);
}

/** A text decal with a transparent background. */
export function decal(
  draw: (x: CanvasRenderingContext2D, w: number, h: number) => void,
  w = 128,
  h = 128,
): THREE.CanvasTexture {
  const [c, x] = canvas(w, h);
  draw(x, w, h);
  return finish(c, false);
}

/** Soft round sprite for particles. */
export function softDot(): THREE.CanvasTexture {
  const [c, x] = canvas(64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return finish(c, false);
}

/** Grey-scale detail maps for bumpMap / roughnessMap (not colour). */
function detail(
  w: number,
  h: number,
  draw: (x: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const [c, x] = canvas(w, h);
  x.fillStyle = '#808080';
  x.fillRect(0, 0, w, h);
  draw(x);
  return finish(c, true, false);
}

/** Woven, worn fabric. */
export function fabricBump(): THREE.CanvasTexture {
  return detail(256, 256, (x) => {
    for (let y = 0; y < 256; y += 2) {
      x.fillStyle = y % 4 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
      x.fillRect(0, y, 256, 1);
    }
    for (let i = 0; i < 256; i += 2) {
      x.fillStyle = i % 4 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
      x.fillRect(i, 0, 1, 256);
    }
    // Long creases.
    for (let i = 0; i < 26; i++) {
      x.strokeStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.25)';
      x.lineWidth = 1 + rnd() * 3;
      x.beginPath();
      const px = rnd() * 256;
      x.moveTo(px, 0);
      x.bezierCurveTo(
        px + (rnd() - 0.5) * 40,
        90,
        px + (rnd() - 0.5) * 40,
        170,
        px + (rnd() - 0.5) * 30,
        256,
      );
      x.stroke();
    }
    speckle(x, 256, 256, 3000, ['rgba(0,0,0,0.2)', 'rgba(255,255,255,0.15)'], [1, 2]);
  });
}

/** Short horse hair: fine streaks along v. */
export function coatBump(): THREE.CanvasTexture {
  return detail(256, 256, (x) => {
    for (let i = 0; i < 5000; i++) {
      x.strokeStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.22)';
      const px = rnd() * 256,
        py = rnd() * 256;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + (rnd() - 0.5) * 2, py + 6 + rnd() * 10);
      x.stroke();
    }
  });
}

/** Brushed, scratched steel. */
export function steelBump(): THREE.CanvasTexture {
  return detail(256, 256, (x) => {
    for (let i = 0; i < 600; i++) {
      x.strokeStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${0.05 + rnd() * 0.12})`;
      const py = rnd() * 256;
      x.beginPath();
      x.moveTo(0, py);
      x.lineTo(256, py + (rnd() - 0.5) * 6);
      x.stroke();
    }
    for (let i = 0; i < 60; i++) {
      x.strokeStyle = 'rgba(0,0,0,0.5)';
      const px = rnd() * 256,
        py = rnd() * 256;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + (rnd() - 0.5) * 30, py + (rnd() - 0.5) * 30);
      x.stroke();
    }
  });
}

/** Panel lines and rivets for machinery. */
export function panelBump(): THREE.CanvasTexture {
  return detail(256, 256, (x) => {
    x.strokeStyle = 'rgba(0,0,0,0.75)';
    x.lineWidth = 2;
    for (const y of [0, 96, 176]) {
      x.beginPath();
      x.moveTo(0, y + 1);
      x.lineTo(256, y + 1);
      x.stroke();
    }
    for (const px of [0, 128]) {
      x.beginPath();
      x.moveTo(px + 1, 0);
      x.lineTo(px + 1, 256);
      x.stroke();
    }
    x.fillStyle = 'rgba(255,255,255,0.85)';
    for (const y of [8, 104, 184])
      for (let px = 8; px < 256; px += 16) {
        x.beginPath();
        x.arc(px, y, 2, 0, Math.PI * 2);
        x.fill();
      }
    speckle(x, 256, 256, 1500, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.1)'], [1, 3]);
  });
}

/** Poured concrete with formwork seams, for track undersides and supports. */
export function concrete(): THREE.CanvasTexture {
  const [c, x] = canvas(256);
  x.fillStyle = '#9a9890';
  x.fillRect(0, 0, 256, 256);
  speckle(x, 256, 256, 9000, ['#8f8d86', '#a5a39b', '#87857e', '#aeaca4'], [1, 3]);
  x.fillStyle = 'rgba(0,0,0,0.25)';
  x.fillRect(0, 126, 256, 3);
  x.fillRect(126, 0, 3, 256);
  for (let i = 0; i < 6; i++) {
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(60,55,50,0)');
    g.addColorStop(1, 'rgba(60,55,50,0.25)');
    x.fillStyle = g;
    x.fillRect(rnd() * 256, 0, 6 + rnd() * 18, 256);
  }
  return finish(c);
}

// ---------------------------------------------------------------- Shire materials

/** Country lane: packed earth, gravel, two wheel ruts and a grassy crown. u = across. */
export function dirtLane(): THREE.CanvasTexture {
  const W = 512;
  const [c, x] = canvas(W);
  x.fillStyle = '#8f744d';
  x.fillRect(0, 0, W, W);
  speckle(x, W, W, 22000, ['#836843', '#9b7f56', '#77603f', '#a48a62', '#6d5839'], [1, 3]);
  // Pebbles.
  for (let i = 0; i < 700; i++) {
    x.fillStyle = ['#a08f72', '#8f8068', '#ad9c7f', '#7e7466'][Math.floor(rnd() * 4)]!;
    x.beginPath();
    x.ellipse(
      rnd() * W,
      rnd() * W,
      0.8 + rnd() * 1.6,
      0.8 + rnd() * 1.3,
      rnd() * 3,
      0,
      Math.PI * 2,
    );
    x.fill();
  }
  // Wheel ruts: darker, smoother.
  for (const u of [0.3, 0.7]) {
    const g = x.createLinearGradient((u - 0.09) * W, 0, (u + 0.09) * W, 0);
    g.addColorStop(0, 'rgba(70,52,32,0)');
    g.addColorStop(0.5, 'rgba(70,52,32,0.45)');
    g.addColorStop(1, 'rgba(70,52,32,0)');
    x.fillStyle = g;
    x.fillRect((u - 0.09) * W, 0, 0.18 * W, W);
  }
  // Grass tufts on the crown and the verges.
  const tuft = (cx: number, cy: number, n: number) => {
    for (let k = 0; k < n; k++) {
      x.strokeStyle = ['#5e8a34', '#6f9e3c', '#4f7a2b'][Math.floor(rnd() * 3)]!;
      x.beginPath();
      const px = cx + (rnd() - 0.5) * 10;
      x.moveTo(px, cy);
      x.lineTo(px + (rnd() - 0.5) * 6, cy - 4 - rnd() * 8);
      x.stroke();
    }
  };
  for (let i = 0; i < 60; i++) tuft(W * (0.47 + rnd() * 0.06), rnd() * W, 6);
  for (const [a, b] of [
    [0, 0.07],
    [0.93, 1],
  ]) {
    x.fillStyle = 'rgba(88,128,52,0.75)';
    x.fillRect(a! * W, 0, (b! - a!) * W, W);
    for (let i = 0; i < 160; i++) tuft(W * (a! + rnd() * (b! - a!)), rnd() * W, 4);
  }
  return finish(c);
}

/** Dry-stone wall: irregular stacked stones, mossy top. 4:1 aspect. */
export function stoneWall(): THREE.CanvasTexture {
  const [c, x] = canvas(256, 64);
  x.fillStyle = '#3d3a33';
  x.fillRect(0, 0, 256, 64);
  let y = 62;
  while (y > 0) {
    const h = 9 + rnd() * 7;
    let px = -rnd() * 20;
    while (px < 256) {
      const w = 14 + rnd() * 22;
      const v = 120 + Math.floor(rnd() * 50);
      x.fillStyle = `rgb(${v},${v - 6},${v - 18})`;
      x.beginPath();
      x.ellipse(px + w / 2, y - h / 2, w / 2 - 1, h / 2 - 1, (rnd() - 0.5) * 0.2, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.12)';
      x.fillRect(px + 3, y - h + 2, w - 8, 2);
      px += w;
    }
    y -= h;
  }
  // Moss and lichen.
  speckle(x, 256, 14, 500, ['rgba(92,130,50,0.8)', 'rgba(120,150,60,0.7)'], [1, 4]);
  speckle(x, 256, 64, 120, ['rgba(200,200,120,0.5)', 'rgba(120,150,70,0.5)'], [1, 3]);
  return finish(c);
}

/** Cut stone blocks for bridges, mills and ruins. */
export function stoneBlocks(): THREE.CanvasTexture {
  const S = 256;
  const [c, x] = canvas(S);
  x.fillStyle = '#5b574f';
  x.fillRect(0, 0, S, S);
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? 24 : 0;
    for (let col = -1; col < 6; col++) {
      const v = 130 + Math.floor(rnd() * 40);
      x.fillStyle = `rgb(${v},${v - 4},${v - 14})`;
      x.fillRect(col * 48 + off + 2, row * 32 + 2, 44, 28);
    }
  }
  speckle(x, S, S, 5000, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.08)'], [1, 3]);
  speckle(x, S, S, 200, ['rgba(90,120,50,0.5)'], [2, 5]);
  return finish(c);
}

export function thatch(): THREE.CanvasTexture {
  const [c, x] = canvas(256);
  x.fillStyle = '#9c7b3f';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    x.strokeStyle = ['#b8954e', '#8a6a33', '#c9a65d', '#7a5c2c'][Math.floor(rnd() * 4)]!;
    const px = rnd() * 256,
      py = rnd() * 256;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + (rnd() - 0.5) * 3, py + 10 + rnd() * 14);
    x.stroke();
  }
  for (let y = 0; y < 256; y += 32) {
    x.fillStyle = 'rgba(60,40,20,0.35)';
    x.fillRect(0, y, 256, 3);
  }
  return finish(c);
}

export function planks(): THREE.CanvasTexture {
  const [c, x] = canvas(256);
  for (let i = 0; i < 8; i++) {
    const v = 110 + Math.floor(rnd() * 30);
    x.fillStyle = `rgb(${v},${Math.floor(v * 0.72)},${Math.floor(v * 0.45)})`;
    x.fillRect(i * 32, 0, 31, 256);
    for (let k = 0; k < 30; k++) {
      x.strokeStyle = 'rgba(40,25,10,0.25)';
      x.beginPath();
      const px = i * 32 + rnd() * 30;
      x.moveTo(px, 0);
      x.lineTo(px + (rnd() - 0.5) * 4, 256);
      x.stroke();
    }
  }
  return finish(c);
}

/** Lush meadow with wildflowers. */
export function meadow(): THREE.CanvasTexture {
  const S = 512;
  const [c, x] = canvas(S);
  x.fillStyle = '#5f9a38';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const r = 20 + rnd() * 80;
    const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
    const col = rnd() > 0.5 ? '120,175,70' : '80,130,45';
    g.addColorStop(0, `rgba(${col},0.4)`);
    g.addColorStop(1, `rgba(${col},0)`);
    x.save();
    x.translate(rnd() * S, rnd() * S);
    x.fillStyle = g;
    x.fillRect(-r, -r, 2 * r, 2 * r);
    x.restore();
  }
  for (let i = 0; i < 10000; i++) {
    x.strokeStyle = ['#4f8a2f', '#78b048', '#8cc256', '#5c9235'][Math.floor(rnd() * 4)]!;
    const px = rnd() * S,
      py = rnd() * S;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + (rnd() - 0.5) * 3, py - 2 - rnd() * 4);
    x.stroke();
  }
  speckle(x, S, S, 700, ['#f7f0c8', '#ffe35a', '#e8a8e8', '#ffffff', '#ff9a6a'], [2, 3]);
  return finish(c);
}

export function water(): THREE.CanvasTexture {
  const [c, x] = canvas(256);
  x.fillStyle = '#3a6f86';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    x.strokeStyle = rnd() > 0.5 ? 'rgba(200,235,255,0.35)' : 'rgba(20,50,70,0.3)';
    x.lineWidth = 1 + rnd() * 2;
    const px = rnd() * 256,
      py = rnd() * 256;
    x.beginPath();
    x.moveTo(px, py);
    x.quadraticCurveTo(px + 8, py - 3, px + 16 + rnd() * 10, py);
    x.stroke();
  }
  return finish(c);
}

// ---------------------------------------------------------------- Middle-earth materials

/** Pale cut-stone paving (Rivendell, Minas Tirith). u = across. */
export function paving(base = '#d9d4c6'): THREE.CanvasTexture {
  const S = 512;
  const [c, x] = canvas(S);
  x.fillStyle = '#8f897c';
  x.fillRect(0, 0, S, S);
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    let px = r % 2 ? -32 : 0;
    while (px < S) {
      const w = 48 + rnd() * 40;
      const shade = 0.85 + rnd() * 0.2;
      const col = new THREE.Color(base).multiplyScalar(shade);
      x.fillStyle = `#${col.getHexString()}`;
      x.fillRect(px + 2, r * (S / rows) + 2, w - 4, S / rows - 4);
      px += w;
    }
  }
  speckle(x, S, S, 9000, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.08)'], [1, 3]);
  speckle(x, S, S, 120, ['rgba(110,140,70,0.4)'], [2, 6]);
  return finish(c);
}

/** Osgiliath: grey flagstones broken by war, missing slabs, soot and scattered rubble. */
export function ruinedPaving(): THREE.CanvasTexture {
  const S = 512;
  const [c, x] = canvas(S);
  x.fillStyle = '#4a4640';
  x.fillRect(0, 0, S, S);
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    let px = r % 2 ? -32 : 0;
    while (px < S) {
      const w = 48 + rnd() * 40;
      if (rnd() > 0.1) {
        const v = 120 + Math.floor(rnd() * 40);
        x.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
        x.fillRect(px + 2, r * (S / rows) + 2, w - 4, S / rows - 4);
      }
      px += w;
    }
  }
  // Soot scorch marks.
  for (let i = 0; i < 14; i++) {
    const rr = 20 + rnd() * 50;
    const g = x.createRadialGradient(0, 0, 0, 0, 0, rr);
    g.addColorStop(0, 'rgba(20,16,12,0.55)');
    g.addColorStop(1, 'rgba(20,16,12,0)');
    x.save();
    x.translate(rnd() * S, rnd() * S);
    x.fillStyle = g;
    x.fillRect(-rr, -rr, rr * 2, rr * 2);
    x.restore();
  }
  // Cracks across the slabs.
  x.strokeStyle = 'rgba(25,22,18,0.8)';
  for (let i = 0; i < 18; i++) {
    x.lineWidth = 1 + rnd() * 2;
    x.beginPath();
    let px = rnd() * S,
      py = rnd() * S;
    x.moveTo(px, py);
    for (let k = 0; k < 4; k++) {
      px += (rnd() - 0.5) * 60;
      py += (rnd() - 0.5) * 60;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  speckle(x, S, S, 9000, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.06)'], [1, 3]);
  return finish(c);
}

/** Dwarven floor: big square slabs with carved border lines. */
export function dwarvenTiles(): THREE.CanvasTexture {
  const S = 512;
  const [c, x] = canvas(S);
  x.fillStyle = '#3c3a3c';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const v = 82 + Math.floor(rnd() * 22);
      x.fillStyle = `rgb(${v},${v - 2},${v + 4})`;
      x.fillRect(i * 128 + 3, j * 128 + 3, 122, 122);
      x.strokeStyle = 'rgba(0,0,0,0.35)';
      x.lineWidth = 3;
      x.strokeRect(i * 128 + 16, j * 128 + 16, 96, 96);
      x.beginPath();
      x.moveTo(i * 128 + 64, j * 128 + 30);
      x.lineTo(i * 128 + 98, j * 128 + 64);
      x.lineTo(i * 128 + 64, j * 128 + 98);
      x.lineTo(i * 128 + 30, j * 128 + 64);
      x.closePath();
      x.stroke();
    }
  speckle(x, S, S, 7000, ['rgba(0,0,0,0.15)', 'rgba(255,255,255,0.06)'], [1, 3]);
  return finish(c);
}

/** Lothlórien path: soft earth strewn with golden mallorn leaves. */
export function leafPath(): THREE.CanvasTexture {
  const S = 512;
  const [c, x] = canvas(S);
  x.fillStyle = '#7a6a4a';
  x.fillRect(0, 0, S, S);
  speckle(x, S, S, 9000, ['#6e5f41', '#857553', '#64563a'], [1, 3]);
  for (let i = 0; i < 1400; i++) {
    x.save();
    x.translate(rnd() * S, rnd() * S);
    x.rotate(rnd() * 6.28);
    x.fillStyle = ['#e2b84a', '#d9a33a', '#f0d070', '#c98f2a', '#b8c06a'][Math.floor(rnd() * 5)]!;
    x.beginPath();
    x.ellipse(0, 0, 5 + rnd() * 4, 2 + rnd() * 2, 0, 0, Math.PI * 2);
    x.fill();
    x.restore();
  }
  return finish(c);
}

/** Bare rock (cliffs, mountains, ledges). */
export function rock(base = '#7d7a74'): THREE.CanvasTexture {
  const S = 512;
  const [c, x] = canvas(S);
  x.fillStyle = base;
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) {
    const r = 20 + rnd() * 70;
    const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
    const dark = rnd() > 0.5;
    g.addColorStop(0, dark ? 'rgba(40,38,35,0.35)' : 'rgba(200,196,188,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.save();
    x.translate(rnd() * S, rnd() * S);
    x.fillStyle = g;
    x.fillRect(-r, -r, 2 * r, 2 * r);
    x.restore();
  }
  // Strata and cracks.
  for (let i = 0; i < 40; i++) {
    x.strokeStyle = `rgba(30,28,25,${0.2 + rnd() * 0.3})`;
    x.lineWidth = 1 + rnd() * 2;
    x.beginPath();
    let px = rnd() * S,
      py = rnd() * S;
    x.moveTo(px, py);
    for (let k = 0; k < 5; k++) {
      px += 10 + rnd() * 30;
      py += (rnd() - 0.5) * 16;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  speckle(x, S, S, 9000, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.08)'], [1, 3]);
  return finish(c);
}

/** Volcanic ash and cinders. */
export function ash(): THREE.CanvasTexture {
  const S = 512;
  const [c, x] = canvas(S);
  x.fillStyle = '#2b2624';
  x.fillRect(0, 0, S, S);
  speckle(x, S, S, 16000, ['#3a3330', '#221e1c', '#4a3e38', '#1a1716'], [1, 4]);
  speckle(x, S, S, 300, ['#6a2a14', '#8a3a18'], [1, 3]);
  return finish(c);
}

export function mud(): THREE.CanvasTexture {
  const S = 512;
  const [c, x] = canvas(S);
  x.fillStyle = '#4a4430';
  x.fillRect(0, 0, S, S);
  speckle(x, S, S, 9000, ['#3e3828', '#565038', '#38341f'], [2, 5]);
  for (let i = 0; i < 40; i++) {
    x.fillStyle = 'rgba(60,70,60,0.5)';
    x.beginPath();
    x.ellipse(rnd() * S, rnd() * S, 10 + rnd() * 30, 6 + rnd() * 16, rnd() * 3, 0, Math.PI * 2);
    x.fill();
  }
  return finish(c);
}

/**
 * A tileable crack network: Voronoi cell borders, wobbled so they read as split rock.
 * Returns per-pixel crack strength 0..1 (1 at the heart of a crack).
 */
let crackField: Float32Array | undefined;
function cracks(S: number): Float32Array {
  if (crackField) return crackField;
  const saved = seed;
  seed = 9001;
  const pts: [number, number][] = [];
  for (let i = 0; i < 34; i++) pts.push([rnd() * S, rnd() * S]);
  seed = saved;
  const f = new Float32Array(S * S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      // Wobble the lookup so borders meander instead of running straight.
      const wx = x + Math.sin(y * 0.09) * 5 + Math.sin(y * 0.031 + x * 0.02) * 7;
      const wy = y + Math.sin(x * 0.08) * 5 + Math.sin(x * 0.027 - y * 0.017) * 7;
      let d1 = Infinity,
        d2 = Infinity;
      for (const [px, py] of pts)
        for (let ox = -S; ox <= S; ox += S)
          for (let oy = -S; oy <= S; oy += S) {
            const d = Math.hypot(wx - px - ox, wy - py - oy);
            if (d < d1) {
              d2 = d1;
              d1 = d;
            } else if (d < d2) d2 = d;
          }
      const e = d2 - d1;
      // Wide main fissures with a thin bright core.
      f[y * S + x] = Math.max(0, 1 - e / 7) ** 1.5;
    }
  crackField = f;
  return f;
}

/** Mordor road: black basalt slabs split by cracks (pair with volcanicGlow as emissive map). */
export function volcanic(): THREE.CanvasTexture {
  const S = 256;
  const [c, x] = canvas(S);
  x.fillStyle = '#1e1a19';
  x.fillRect(0, 0, S, S);
  speckle(x, S, S, 6000, ['#2a2422', '#141110', '#332b28'], [1, 3]);
  const img = x.getImageData(0, 0, S, S);
  const f = cracks(S);
  for (let i = 0; i < S * S; i++) {
    const k = 1 - Math.min(1, f[i]! * 1.6);
    img.data[i * 4] = img.data[i * 4]! * k + 60 * (1 - k);
    img.data[i * 4 + 1] = img.data[i * 4 + 1]! * k + 14 * (1 - k);
    img.data[i * 4 + 2] = img.data[i * 4 + 2]! * k + 6 * (1 - k);
  }
  x.putImageData(img, 0, 0);
  return finish(c);
}
/** Glowing lava in the cracks of the volcanic road. */
export function volcanicGlow(): THREE.CanvasTexture {
  const S = 256;
  const [c, x] = canvas(S);
  const img = x.createImageData(S, S);
  const f = cracks(S);
  for (let i = 0; i < S * S; i++) {
    const v = f[i]!;
    img.data[i * 4] = Math.min(255, 255 * v * 1.4);
    img.data[i * 4 + 1] = Math.min(255, 255 * v * v * 0.75);
    img.data[i * 4 + 2] = Math.min(255, 255 * v ** 4 * 0.3);
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return finish(c);
}

/** Dead Marshes boardwalk: wet, warped planks laid across the way, with gaps between. */
export function boardwalk(): THREE.CanvasTexture {
  const S = 256;
  const [c, x] = canvas(S);
  x.fillStyle = '#16140e';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 8; i++) {
    const y0 = i * 32 + 2 + Math.floor(rnd() * 3);
    const h = 26 + Math.floor(rnd() * 3);
    const v = 70 + Math.floor(rnd() * 40);
    x.fillStyle = `rgb(${v},${Math.floor(v * 0.78)},${Math.floor(v * 0.55)})`;
    x.fillRect(0, y0, S, h);
    for (let k = 0; k < 14; k++) {
      x.strokeStyle = `rgba(25,18,10,${0.2 + rnd() * 0.25})`;
      x.beginPath();
      const py = y0 + 2 + rnd() * (h - 4);
      x.moveTo(0, py);
      x.bezierCurveTo(S * 0.3, py + (rnd() - 0.5) * 4, S * 0.7, py + (rnd() - 0.5) * 4, S, py);
      x.stroke();
    }
    // Rotten, mossy patches and the odd split.
    for (let k = 0; k < 3; k++) {
      x.fillStyle = rnd() > 0.5 ? 'rgba(60,80,40,0.35)' : 'rgba(20,16,10,0.4)';
      x.beginPath();
      x.ellipse(rnd() * S, y0 + h / 2, 8 + rnd() * 24, h * 0.35, 0, 0, Math.PI * 2);
      x.fill();
    }
    // Nails over the stringers.
    x.fillStyle = '#2a2622';
    for (const nx of [26, 30, 226, 230]) x.fillRect(nx, y0 + h / 2 - 1, 2, 2);
  }
  speckle(x, S, S, 2500, ['rgba(0,0,0,0.2)', 'rgba(140,150,120,0.1)'], [1, 2]);
  return finish(c);
}

/** White carved stone balustrade (Rivendell, Minas Tirith). 4:1. */
export function balustrade(): THREE.CanvasTexture {
  const [c, x] = canvas(256, 64);
  x.fillStyle = '#e7e2d6';
  x.fillRect(0, 0, 256, 64);
  x.fillStyle = '#c9c2b2';
  x.fillRect(0, 0, 256, 8);
  x.fillRect(0, 54, 256, 10);
  for (let i = 0; i < 8; i++) {
    x.fillStyle = '#b8b0a0';
    x.beginPath();
    x.ellipse(16 + i * 32, 31, 7, 18, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#efeadf';
    x.beginPath();
    x.ellipse(14 + i * 32, 29, 4, 14, 0, 0, Math.PI * 2);
    x.fill();
  }
  speckle(x, 256, 64, 800, ['rgba(0,0,0,0.06)'], [1, 2]);
  return finish(c);
}

/** Timber post-and-rail fence (Rohan). 4:1. */
export function fence(): THREE.CanvasTexture {
  const [c, x] = canvas(256, 64);
  x.fillStyle = '#5a7a3a';
  x.fillRect(0, 0, 256, 64);
  const wood = (px: number, py: number, w: number, h: number) => {
    x.fillStyle = '#7a5a36';
    x.fillRect(px, py, w, h);
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.fillRect(px, py + h - 2, w, 2);
  };
  wood(0, 14, 256, 8);
  wood(0, 36, 256, 8);
  for (const px of [10, 138]) wood(px, 4, 12, 60);
  return finish(c);
}

/** Jagged black rock wall (Mordor). 4:1. */
export function darkRock(): THREE.CanvasTexture {
  const [c, x] = canvas(256, 64);
  x.fillStyle = '#1a1614';
  x.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 40; i++) {
    const v = 30 + Math.floor(rnd() * 30);
    x.fillStyle = `rgb(${v},${v - 6},${v - 8})`;
    x.beginPath();
    const px = rnd() * 256;
    x.moveTo(px, 64);
    x.lineTo(px + 6 + rnd() * 10, 4 + rnd() * 30);
    x.lineTo(px + 20 + rnd() * 10, 64);
    x.fill();
  }
  speckle(x, 256, 64, 300, ['rgba(255,90,30,0.35)'], [1, 2]);
  return finish(c);
}

/** Cave rock for Moria's halls. */
export function caveRock(): THREE.CanvasTexture {
  return rock('#4a4848');
}

/** Golden grass of Rohan. */
export function goldGrass(): THREE.CanvasTexture {
  const S = 512;
  const [c, x] = canvas(S);
  x.fillStyle = '#b39a52';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 12000; i++) {
    x.strokeStyle = ['#c9ad5e', '#9c8642', '#d8be72', '#8a9a48'][Math.floor(rnd() * 4)]!;
    const px = rnd() * S,
      py = rnd() * S;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + (rnd() - 0.5) * 3, py - 3 - rnd() * 6);
    x.stroke();
  }
  return finish(c);
}

/**
 * Alpha cut-out texture from a canvas, with the average opaque colour bled into the
 * transparent pixels. Canvas textures store black there, which shows up as dark fringes
 * once the texture is mipmapped.
 */
function cutout(c: HTMLCanvasElement): THREE.DataTexture {
  const x = c.getContext('2d')!;
  const img = x.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let i = 0; i < d.length; i += 4)
    if (d[i + 3]! > 128) {
      r += d[i]!;
      g += d[i + 1]!;
      b += d[i + 2]!;
      n++;
    }
  n = Math.max(1, n);
  const out = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]!;
    const k = a / 255;
    out[i] = Math.round(d[i]! * k + (r / n) * (1 - k));
    out[i + 1] = Math.round(d[i + 1]! * k + (g / n) * (1 - k));
    out[i + 2] = Math.round(d[i + 2]! * k + (b / n) * (1 - k));
    out[i + 3] = a;
  }
  // Canvas rows run top-down; flip so v = 1 is the top like other textures.
  const flipped = new Uint8Array(out.length);
  const row = c.width * 4;
  for (let y = 0; y < c.height; y++)
    flipped.set(out.subarray(y * row, (y + 1) * row), (c.height - 1 - y) * row);
  const t = new THREE.DataTexture(flipped, c.width, c.height, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Leaf cluster for canopy cards: overlapping leaves on transparency, tinted per tree. */
export function leafCluster(): THREE.Texture {
  const S = 256;
  const [c, x] = canvas(S);
  x.clearRect(0, 0, S, S);
  for (let i = 0; i < 150; i++) {
    const a = rnd() * Math.PI * 2,
      r = Math.sqrt(rnd()) * S * 0.4;
    const px = S / 2 + Math.cos(a) * r,
      py = S / 2 + Math.sin(a) * r;
    const v = Math.floor(170 + rnd() * 85);
    x.save();
    x.translate(px, py);
    x.rotate(rnd() * Math.PI * 2);
    x.fillStyle = `rgb(${v},${v},${Math.floor(v * 0.92)})`;
    x.beginPath();
    x.ellipse(0, 0, 9 + rnd() * 7, 4 + rnd() * 3, 0, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = `rgba(255,255,255,0.25)`;
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(-8, 0);
    x.lineTo(8, 0);
    x.stroke();
    x.restore();
  }
  return cutout(c);
}

/** Pine needle spray: fans of thin strokes from a twig. */
export function needleCluster(): THREE.Texture {
  const S = 256;
  const [c, x] = canvas(S);
  x.clearRect(0, 0, S, S);
  x.lineCap = 'round';
  for (let b = 0; b < 9; b++) {
    const y0 = S * (0.15 + b * 0.085);
    const len = S * (0.18 + rnd() * 0.18);
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      const ox = S / 2 + (t - 0.5) * len * 2;
      const v = Math.floor(160 + rnd() * 90);
      x.strokeStyle = `rgb(${v},${v},${v})`;
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(ox, y0);
      x.lineTo(ox + (rnd() - 0.5) * 14, y0 + 16 + rnd() * 14);
      x.stroke();
    }
  }
  return cutout(c);
}

/** Grass blades: tapered strokes rising from the bottom edge. */
export function grassBlades(): THREE.Texture {
  const W = 256,
    H = 128;
  const [c, x] = canvas(W, H);
  x.clearRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    const bx = rnd() * W;
    const h = H * (0.45 + rnd() * 0.55);
    const lean = (rnd() - 0.5) * 30;
    const v = Math.floor(200 + rnd() * 55);
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.beginPath();
    x.moveTo(bx - 3, H);
    x.quadraticCurveTo(bx + lean * 0.3, H - h * 0.6, bx + lean, H - h);
    x.quadraticCurveTo(bx + lean * 0.3 + 2, H - h * 0.6, bx + 3, H);
    x.closePath();
    x.fill();
  }
  return cutout(c);
}
