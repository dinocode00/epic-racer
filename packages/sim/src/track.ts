import type { TrackDef } from '@epic/shared';
import {
  type Vec3,
  add,
  addScaled,
  cross,
  dist2,
  dot,
  fromArr,
  len,
  lerp,
  norm,
  reject,
  scale,
  sub,
  v3,
} from './vec.ts';

/** One evenly spaced sample along the centre line. */
export interface Frame {
  pos: Vec3;
  /** Unit forward direction. */
  tan: Vec3;
  /** Unit surface normal, orthogonal to tan. */
  up: Vec3;
  /** Unit right direction = tan x up. */
  right: Vec3;
  /** Full road width. */
  width: number;
}

export interface Projection {
  /** Index of the sample at or before the point. */
  index: number;
  /** Arc length from the start line, 0..length. */
  s: number;
  /** Signed lateral offset from the centre line (positive = right). */
  lateral: number;
  /** Height above the road surface along up. */
  height: number;
  frame: Frame;
}

const catmull = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const t2 = t * t,
    t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
};
const catmullV = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, t: number): Vec3 => ({
  x: catmull(a.x, b.x, c.x, d.x, t),
  y: catmull(a.y, b.y, c.y, d.y, t),
  z: catmull(a.z, b.z, c.z, d.z, t),
});

/**
 * A closed track sampled every ~`spacing` metres. All gameplay queries go through it:
 * progress along the lap, lateral offset, the gravity frame, and respawn points.
 */
export class Track {
  readonly def: TrackDef;
  readonly frames: Frame[];
  readonly length: number;
  readonly spacing: number;

  constructor(def: TrackDef, spacing = 1) {
    this.def = def;
    const pts = def.points.map((p) => fromArr(p.p));
    const ups = def.points.map((p) => (p.up ? norm(fromArr(p.up)) : v3(0, 1, 0)));
    const widths = def.points.map((p) => p.width ?? def.defaultWidth);
    const n = pts.length;
    const at = <T>(arr: T[], i: number): T => arr[((i % n) + n) % n]!;

    // Dense sampling for arc length.
    const SUB = 24;
    const dense: { pos: Vec3; up: Vec3; width: number }[] = [];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < SUB; k++) {
        const t = k / SUB;
        dense.push({
          pos: catmullV(at(pts, i - 1), at(pts, i), at(pts, i + 1), at(pts, i + 2), t),
          up: norm(catmullV(at(ups, i - 1), at(ups, i), at(ups, i + 1), at(ups, i + 2), t)),
          width: at(widths, i) + (at(widths, i + 1) - at(widths, i)) * t,
        });
      }
    }
    const cum: number[] = [0];
    for (let i = 1; i <= dense.length; i++) {
      cum.push(cum[i - 1]! + len(sub(dense[i % dense.length]!.pos, dense[i - 1]!.pos)));
    }
    const total = cum[dense.length]!;
    const count = Math.max(8, Math.round(total / spacing));
    this.spacing = total / count;
    this.length = total;

    // Resample at uniform arc length.
    const raw: { pos: Vec3; up: Vec3; width: number }[] = [];
    let j = 0;
    for (let i = 0; i < count; i++) {
      const s = i * this.spacing;
      while (cum[j + 1]! < s) j++;
      const seg = cum[j + 1]! - cum[j]!;
      const t = seg > 0 ? (s - cum[j]!) / seg : 0;
      const a = dense[j]!,
        b = dense[(j + 1) % dense.length]!;
      raw.push({
        pos: lerp(a.pos, b.pos, t),
        up: norm(lerp(a.up, b.up, t)),
        width: a.width + (b.width - a.width) * t,
      });
    }
    this.frames = raw.map((r, i) => {
      const next = raw[(i + 1) % count]!.pos;
      const prev = raw[(i - 1 + count) % count]!.pos;
      const tan = norm(sub(next, prev));
      const up = norm(reject(r.up, tan));
      return { pos: r.pos, tan, up, right: norm(cross(tan, up)), width: r.width };
    });
  }

  get count(): number {
    return this.frames.length;
  }

  frame(i: number): Frame {
    const n = this.frames.length;
    return this.frames[((i % n) + n) % n]!;
  }

  /** Interpolated frame at arc length s. */
  frameAtS(s: number): Frame {
    const L = this.length;
    const ss = ((s % L) + L) % L;
    const f = ss / this.spacing;
    const i = Math.floor(f);
    return this.blend(i, f - i);
  }

  private blend(i: number, t: number): Frame {
    const a = this.frame(i),
      b = this.frame(i + 1);
    const tan = norm(lerp(a.tan, b.tan, t));
    const up = norm(reject(lerp(a.up, b.up, t), tan));
    return {
      pos: lerp(a.pos, b.pos, t),
      tan,
      up,
      right: cross(tan, up),
      width: a.width + (b.width - a.width) * t,
    };
  }

  /** Global nearest-sample search. Use once to seed `hint`. */
  nearestIndex(p: Vec3): number {
    let best = 0,
      bd = Infinity;
    for (let i = 0; i < this.frames.length; i++) {
      const d = dist2(p, this.frames[i]!.pos);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /**
   * Project a point onto the track, searching only near `hint`. Local search keeps a
   * kart on "its" piece of road even where the track passes over or under itself.
   */
  project(p: Vec3, hint: number, window = 24): Projection {
    let best = hint,
      bd = Infinity;
    for (let k = -window; k <= window; k++) {
      const f = this.frame(hint + k);
      // Distance in the road plane dominates; height off the road is penalised so
      // stacked sections (loops, the fold) never steal the projection.
      const d = sub(p, f.pos);
      const h = dot(d, f.up);
      const score = dot(d, d) + h * h * 4;
      if (score < bd) {
        bd = score;
        best = hint + k;
      }
    }
    // Refine between best and its neighbour.
    const a = this.frame(best);
    let i0 = best;
    if (dot(sub(p, a.pos), a.tan) < 0) i0 = best - 1;
    const f0 = this.frame(i0),
      f1 = this.frame(i0 + 1);
    const seg = sub(f1.pos, f0.pos);
    const t = Math.min(1, Math.max(0, dot(sub(p, f0.pos), seg) / Math.max(1e-6, dot(seg, seg))));
    const frame = this.blend(i0, t);
    const d = sub(p, frame.pos);
    const n = this.frames.length;
    const index = ((i0 % n) + n) % n;
    return {
      index,
      s: (index + t) * this.spacing,
      lateral: dot(d, frame.right),
      height: dot(d, frame.up),
      frame,
    };
  }

  /** World position for (arc length, lateral offset, height). */
  pointAt(s: number, lateral: number, height = 0): Vec3 {
    const f = this.frameAtS(s);
    return add(addScaled(f.pos, f.right, lateral), scale(f.up, height));
  }
}
