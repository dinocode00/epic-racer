import type { KartState, Track } from '@epic/sim';

/**
 * A see-through top-down outline of the track with a dot for every racer. Humans are
 * big dots in their own colours with a white ring; AI racers are small grey dots.
 * Placement depends on the split: right edge for one player, straddling the divider for
 * two, the middle of the screen for three or four.
 */
export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private outline: HTMLCanvasElement;
  private size = 0;
  private bounds: { x0: number; z0: number; scale: number; ox: number; oy: number };

  constructor(
    parent: HTMLElement,
    private track: Track,
    players: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = `minimap p${players}`;
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.outline = document.createElement('canvas');
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    for (const f of track.frames) {
      x0 = Math.min(x0, f.pos.x);
      x1 = Math.max(x1, f.pos.x);
      z0 = Math.min(z0, f.pos.z);
      z1 = Math.max(z1, f.pos.z);
    }
    this.bounds = { x0, z0, scale: 1 / Math.max(x1 - x0, z1 - z0), ox: x1 - x0, oy: z1 - z0 };
  }

  /** Map a world position to canvas pixels (north up, with a margin). */
  private toPx(x: number, z: number): [number, number] {
    const b = this.bounds;
    const S = this.size;
    const m = S * 0.09;
    const span = S - 2 * m;
    const cx = (1 - b.ox * b.scale) * 0.5 * span,
      cy = (1 - b.oy * b.scale) * 0.5 * span;
    return [m + cx + (x - b.x0) * b.scale * span, m + cy + (z - b.z0) * b.scale * span];
  }

  /** Redraw the track outline when the on-screen size changes. */
  private layout(): void {
    const css = this.canvas.clientWidth;
    const S = Math.round(css * Math.min(2, window.devicePixelRatio || 1));
    if (S === this.size || S === 0) return;
    this.size = S;
    this.canvas.width = this.canvas.height = S;
    this.outline.width = this.outline.height = S;
    const g = this.outline.getContext('2d')!;
    g.clearRect(0, 0, S, S);
    g.lineJoin = g.lineCap = 'round';
    const path = () => {
      g.beginPath();
      this.track.frames.forEach((f, i) => {
        const [px, py] = this.toPx(f.pos.x, f.pos.z);
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      });
      g.closePath();
    };
    // Dark casing, then a pale road: readable over grass, lava or a dark cave.
    path();
    g.strokeStyle = 'rgba(10,10,20,0.55)';
    g.lineWidth = S * 0.05;
    g.stroke();
    path();
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = S * 0.022;
    g.stroke();
    // Start / finish line.
    const f = this.track.frames[0]!;
    const [sx, sy] = this.toPx(f.pos.x, f.pos.z);
    const ang = Math.atan2(f.tan.z, f.tan.x) + Math.PI / 2;
    g.save();
    g.translate(sx, sy);
    g.rotate(ang);
    g.fillStyle = '#fff';
    g.fillRect(-S * 0.035, -S * 0.008, S * 0.07, S * 0.016);
    g.fillStyle = '#111';
    for (let i = 0; i < 4; i++)
      g.fillRect(-S * 0.035 + (i * S * 0.07) / 4, -S * 0.008, (S * 0.07) / 8, S * 0.008);
    g.restore();
  }

  update(karts: KartState[], colors: string[], humans: number[]): void {
    this.layout();
    const S = this.size;
    if (!S) return;
    this.ctx.clearRect(0, 0, S, S);
    this.ctx.drawImage(this.outline, 0, 0);
    // AI first, humans on top; the leader gets a small gold crown ring.
    for (let pass = 0; pass < 2; pass++)
      for (const k of karts) {
        const human = humans.includes(k.id);
        if (human !== (pass === 1)) continue;
        this.dot(k, human, colors);
      }
  }

  private dot(k: KartState, human: boolean, colors: string[]): void {
    const S = this.size;
    const c = this.ctx;
    const [px, py] = this.toPx(k.pos.x, k.pos.z);
    const r = S * (human ? 0.04 : 0.024);
    c.beginPath();
    c.arc(px, py, r, 0, Math.PI * 2);
    c.fillStyle = human ? colors[k.id]! : 'rgba(205,205,215,0.95)';
    c.fill();
    c.lineWidth = S * (human ? 0.012 : 0.007);
    c.strokeStyle = k.place === 1 ? '#f5c518' : human ? '#fff' : 'rgba(30,30,40,0.9)';
    c.stroke();
  }

  dispose(): void {
    this.canvas.remove();
  }
}
