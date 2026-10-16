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
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  all.push(t);
  return t;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, colors: string[], size: [number, number]): void {
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
      x.fillStyle = ['#e8433a', '#2f7de1', '#f5c518', '#f0f0f0', '#3fbf5f', '#ff8c2e', '#b05de0'][Math.floor(rnd() * 7)]!;
      x.fillRect(i * 8 + 1 + (row % 2) * 4, row * 16 + 8, 6, 7);
      x.fillStyle = ['#f2c9a0', '#c48a5a', '#8d5a3c', '#ffe0c0'][Math.floor(rnd() * 4)]!;
      x.fillRect(i * 8 + 2 + (row % 2) * 4, row * 16 + 3, 4, 5);
    }
  }
  return finish(c);
}

/** A text decal with a transparent background. */
export function decal(draw: (x: CanvasRenderingContext2D, w: number, h: number) => void, w = 128, h = 128): THREE.CanvasTexture {
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
