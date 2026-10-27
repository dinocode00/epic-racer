import type { QualitySettings } from '../render/view.ts';

/** One rung of the automatic quality ladder, best first. */
export interface QualityLevel extends QualitySettings {
  name: string;
  /** Share of the roadside grass that's drawn. */
  grass: number;
}

/**
 * Turned down in this order: resolution first (hardly noticeable on a TV), then the glow,
 * then the grass. Each step takes back a good share of the frame time.
 */
export const LEVELS: QualityLevel[] = [
  { name: 'high', res: 1, bloom: true, grass: 1 },
  { name: 'res 85%', res: 0.85, bloom: true, grass: 1 },
  { name: 'res 70%', res: 0.7, bloom: true, grass: 1 },
  { name: 'no glow', res: 0.7, bloom: false, grass: 1 },
  { name: 'grass 50%', res: 0.7, bloom: false, grass: 0.5 },
  { name: 'low', res: 0.6, bloom: false, grass: 0.2 },
];

/** Frames slower than this (under 50 fps) count as "too slow". */
const SLOW_MS = 20;
/** Frames this fast (57+ fps) mean there may be room to turn things back up. */
const FAST_MS = 17.5;
/** Seconds measured before a step down (short: slowness is felt straight away). */
const DOWN_WINDOW = 1.5;
/** Seconds of smooth running before trying a step up. */
const UP_WINDOW = 6;

/**
 * Watches the frame rate and quietly moves along the quality ladder: down when frames run
 * slow, back up after a stretch of smooth running. A level that proved too slow right after
 * stepping up to it is left alone for longer each time, so quality doesn't flicker.
 */
export class AutoQuality {
  level = 0;
  /** Smoothed frame time (ms), for the frame-rate display. */
  frameMs = 16.7;
  private times: number[] = [];
  private span = 0;
  private sinceChange = 0;
  private upWait: number[] = LEVELS.map(() => UP_WINDOW);
  private lastUp = -1;
  private fastFor = 0;

  constructor(
    private enabled: boolean,
    start = 0,
  ) {
    this.level = start;
  }

  get settings(): QualityLevel {
    return LEVELS[this.level]!;
  }

  /** Feed one frame's duration (seconds); returns true when the level changed. */
  frame(dt: number): boolean {
    // Ignore the pauses no setting can fix: a hidden tab, building the next race.
    if (dt <= 0 || dt > 0.25) return false;
    const ms = dt * 1000;
    this.frameMs += (ms - this.frameMs) * 0.05;
    if (!this.enabled) return false;
    this.times.push(ms);
    this.span += dt;
    this.sinceChange += dt;
    // Judge by the median, so one hiccup doesn't count as "slow".
    if (this.span >= DOWN_WINDOW) {
      const sorted = [...this.times].sort((a, b) => a - b);
      const median = sorted[sorted.length >> 1]!;
      this.times.length = 0;
      this.span = 0;
      if (median > SLOW_MS && this.level < LEVELS.length - 1) {
        // Stepping up made it slow: wait longer before trying that level again.
        if (this.lastUp === this.level - 1 && this.sinceChange < UP_WINDOW)
          this.upWait[this.level - 1] = Math.min(120, this.upWait[this.level - 1]! * 2);
        return this.set(this.level + 1);
      }
      this.fastFor = median < FAST_MS ? this.fastFor + DOWN_WINDOW : 0;
      if (this.level > 0 && this.fastFor >= this.upWait[this.level - 1]!) {
        this.lastUp = this.level - 1;
        return this.set(this.level - 1);
      }
    }
    return false;
  }

  private set(level: number): boolean {
    if (level !== this.lastUp) this.lastUp = -1;
    this.level = level;
    this.sinceChange = 0;
    this.fastFor = 0;
    return true;
  }
}

/** The optional `?fps=1` corner readout: frame rate, frame time, quality and resolution. */
export class FpsMeter {
  private el: HTMLDivElement;
  private frames = 0;
  private acc = 0;
  private worst = 0;
  private hitches = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'fps-meter';
    document.body.appendChild(this.el);
  }

  frame(dt: number, q: AutoQuality, bufferSize: () => { w: number; h: number }): void {
    this.frames++;
    this.acc += dt;
    this.worst = Math.max(this.worst, dt);
    if (dt > 0.05) this.hitches++;
    if (this.acc < 0.5) return;
    const fps = this.frames / this.acc;
    const buffer = bufferSize();
    this.el.textContent =
      `${fps.toFixed(0)} fps  ${q.frameMs.toFixed(1)} ms  worst ${(this.worst * 1000).toFixed(0)} ms\n` +
      `quality: ${q.settings.name}  ${buffer.w}×${buffer.h}  hitches: ${this.hitches}`;
    this.frames = 0;
    this.acc = 0;
    this.worst = 0;
  }
}
