import type { HazardDef, TrackDef, TrackPoint, V3 } from '@epic/shared';
import { Track } from './track.ts';

const GRAVITY = 21;

/**
 * A "turtle" for laying out tracks in code: drive forward, turn, climb, loop.
 * Each command emits control points with their own up vector. Good for gray-boxing;
 * final tracks can be authored in Blender and exported to the same TrackDef format.
 */
export class TrackBuilder {
  private x = 0;
  private y = 0;
  private z = 0;
  private yaw = 0; // 0 = heading -Z; positive turns right
  private pts: TrackPoint[] = [];
  /** Features recorded at world positions, resolved to arc lengths in build(). */
  private marksAt: { name: string; p: V3 }[] = [];
  private regionsAt: { id: string; p: V3 }[] = [];
  private rangesAt: { kind: 'gaps' | 'open' | 'tunnels'; a: V3; b?: V3 }[] = [];
  private kickersAt: { p: V3; pop: number }[] = [];
  private hazardsAt: { p: V3; ahead: number; def: Omit<HazardDef, 's'> }[] = [];
  /** Approximate distance driven so far (sum of control-point gaps), for landmark marks. */
  get length(): number {
    let d = 0;
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1]!.p,
        b = this.pts[i]!.p;
      d += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    return d;
  }
  /**
   * @param step spacing between emitted control points (m)
   * @param halfWidth half the road width; banked corners pivot on their inner edge
   */
  constructor(
    private step = 6,
    private halfWidth = 9,
  ) {}

  private fwd(): V3 {
    return [Math.sin(this.yaw), 0, -Math.cos(this.yaw)];
  }
  private right(): V3 {
    return [Math.cos(this.yaw), 0, Math.sin(this.yaw)];
  }
  private w: number | undefined;
  /** Road width for the points that follow (undefined = track default). */
  width(w?: number): this {
    this.w = w;
    return this;
  }

  private emit(p: V3, up: V3 = [0, 1, 0], width = this.w): void {
    const pt: TrackPoint = { p: p.map(round) as V3 };
    if (up[0] !== 0 || up[1] !== 1 || up[2] !== 0) pt.up = up.map(round) as V3;
    if (width !== undefined) pt.width = width;
    this.pts.push(pt);
  }

  /** Drive straight. Optionally climb `rise` metres with an eased profile. */
  straight(length: number, rise = 0): this {
    const n = Math.max(1, Math.round(length / this.step));
    const f = this.fwd();
    const y0 = this.y;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const e = rise ? (1 - Math.cos(Math.PI * t)) / 2 : 0;
      this.emit([this.x + f[0] * length * t, y0 + rise * e, this.z + f[2] * length * t]);
    }
    this.x += f[0] * length;
    this.z += f[2] * length;
    this.y = y0 + rise;
    return this;
  }

  /** A hump: up `height` and back down over `length`. */
  hill(length: number, height: number): this {
    const n = Math.max(1, Math.round(length / this.step));
    const f = this.fwd();
    for (let i = 0; i < n; i++) {
      const t = i / n;
      this.emit([
        this.x + f[0] * length * t,
        this.y + (height * (1 - Math.cos(2 * Math.PI * t))) / 2,
        this.z + f[2] * length * t,
      ]);
    }
    this.x += f[0] * length;
    this.z += f[2] * length;
    return this;
  }

  /** Turn by `deg` (positive = right) on radius `r`, banking up to `bankDeg` mid-corner. */
  turn(deg: number, r: number, bankDeg = 0): this {
    const ang = (deg * Math.PI) / 180;
    const sign = Math.sign(ang);
    const arc = Math.abs(ang) * r;
    const n = Math.max(2, Math.round(arc / this.step));
    const rt = this.right();
    const cx = this.x + rt[0] * r * sign,
      cz = this.z + rt[2] * r * sign;
    const yaw0 = this.yaw;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const yaw = yaw0 + ang * t;
      const px = cx - Math.cos(yaw) * r * sign;
      const pz = cz - Math.sin(yaw) * r * sign;
      const bank = ((bankDeg * Math.PI) / 180) * Math.min(1, Math.sin(Math.PI * t) * 1.6);
      // Tilt up toward the inside of the corner.
      const inX = Math.cos(yaw) * sign,
        inZ = Math.sin(yaw) * sign;
      // Lift the centre so the inner edge stays at grade, like a real banked turn.
      const lift = this.halfWidth * Math.sin(bank);
      this.emit(
        [px, this.y + lift, pz],
        [inX * Math.sin(bank), Math.cos(bank), inZ * Math.sin(bank)],
      );
    }
    this.yaw = yaw0 + ang;
    this.x = cx - Math.cos(this.yaw) * r * sign;
    this.z = cz - Math.sin(this.yaw) * r * sign;
    return this;
  }

  /** A full vertical loop of radius r. Exits shifted `shift` metres to the right. */
  loop(r: number, shift: number): this {
    const f = this.fwd(),
      rt = this.right();
    const arc = 2 * Math.PI * r;
    const n = Math.max(12, Math.round(arc / (this.step * 0.75)));
    for (let i = 0; i < n; i++) {
      const th = (2 * Math.PI * i) / n;
      const along = r * Math.sin(th);
      const h = r * (1 - Math.cos(th));
      const side = (shift * (th - Math.sin(th))) / (2 * Math.PI);
      const up: V3 = [-f[0] * Math.sin(th), Math.cos(th), -f[2] * Math.sin(th)];
      this.emit(
        [this.x + f[0] * along + rt[0] * side, this.y + h, this.z + f[2] * along + rt[2] * side],
        up,
      );
    }
    this.x += rt[0] * shift;
    this.z += rt[2] * shift;
    return this;
  }

  /**
   * Close the loop with a smooth Hermite curve from the current position and heading
   * back to the start line (origin, heading -Z, height 0).
   */
  closeLoop(): this {
    const p0 = [this.x, this.y, this.z];
    const f0 = this.fwd();
    const dist = Math.hypot(this.x, this.z);
    const k = dist * 1.1;
    const t0 = [f0[0] * k, 0, f0[2] * k];
    const t1 = [0, 0, -k];
    const n = Math.max(3, Math.round((dist * 1.3) / this.step));
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const h00 = 2 * u ** 3 - 3 * u ** 2 + 1,
        h10 = u ** 3 - 2 * u ** 2 + u,
        h01 = -2 * u ** 3 + 3 * u ** 2,
        h11 = u ** 3 - u ** 2;
      const x = h00 * p0[0]! + h10 * t0[0]! + h11 * t1[0]!;
      const z = h00 * p0[2]! + h10 * t0[2]! + h11 * t1[2]!;
      const y = p0[1]! * (h00 + 0) + 0 * h01;
      this.emit([x, y, z]);
    }
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.yaw = 0;
    return this;
  }

  private here(): V3 {
    return [this.x, this.y, this.z];
  }

  /** Name the current position (resolved to an arc length at build time). */
  mark(name: string): this {
    this.marksAt.push({ name, p: this.here() });
    return this;
  }

  /** Start a new region (land) at the current position. */
  region(id: string): this {
    this.regionsAt.push({ id, p: this.here() });
    return this;
  }

  /** Open / close a range of a kind at the current position. */
  begin(kind: 'gaps' | 'open' | 'tunnels'): this {
    this.rangesAt.push({ kind, a: this.here() });
    return this;
  }
  end(kind: 'gaps' | 'open' | 'tunnels'): this {
    const r = [...this.rangesAt].reverse().find((x) => x.kind === kind && !x.b);
    if (!r) throw new Error(`end(${kind}) without begin`);
    r.b = this.here();
    return this;
  }

  /** Place a hazard `ahead` metres past the current position. */
  hazard(ahead: number, def: Omit<HazardDef, 's'>): this {
    this.hazardsAt.push({ p: this.here(), ahead, def });
    return this;
  }

  /** A ramp whose slope steepens to `angleDeg` at its lip. */
  ramp(length: number, angleDeg: number): this {
    const n = Math.max(2, Math.round(length / 3));
    const f = this.fwd();
    const slope = Math.tan((angleDeg * Math.PI) / 180);
    const y0 = this.y;
    // y = a t^2 with dy/dx at the lip = slope  =>  rise = slope * length / 2
    const rise = (slope * length) / 2;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      this.emit([this.x + f[0] * length * t, y0 + rise * t * t, this.z + f[2] * length * t]);
    }
    this.x += f[0] * length;
    this.z += f[2] * length;
    this.y = y0 + rise;
    this.lipSlope = slope;
    return this;
  }
  private lipSlope = 0;

  /**
   * Fly off the last ramp. The road follows the ballistic arc a kart at `speed` m/s
   * would take, until it has dropped `drop` metres below the lip; the middle of the
   * flight is a gap with no road. Then a landing slope eases back to flat.
   * `pop` adds upward speed at the lip (a kicker).
   */
  flight(opts: {
    speed?: number;
    drop: number;
    pop?: number;
    landing?: number;
    open?: boolean;
  }): this {
    const v = opts.speed ?? 30;
    const pop = opts.pop ?? 3;
    const f = this.fwd();
    const ang = Math.atan(this.lipSlope);
    const vx = v * Math.cos(ang),
      vy = v * Math.sin(ang) + pop;
    this.kickersAt.push({ p: this.here(), pop });
    // Time until y = -drop:  -drop = vy t - g t^2 / 2
    const tEnd = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * opts.drop)) / GRAVITY;
    const x0 = this.x,
      z0 = this.z,
      y0 = this.y;
    const n = Math.max(6, Math.round((vx * tEnd) / 5));
    this.rangesAt.push({ kind: 'gaps', a: this.here() });
    const gapRange = this.rangesAt[this.rangesAt.length - 1]!;
    if (opts.open) this.rangesAt.push({ kind: 'open', a: this.here() });
    const openRange = opts.open ? this.rangesAt[this.rangesAt.length - 1]! : null;
    for (let i = 1; i <= n; i++) {
      const t = (i / n) * tEnd;
      const px = x0 + f[0] * vx * t,
        pz = z0 + f[2] * vx * t,
        py = y0 + vy * t - (GRAVITY * t * t) / 2;
      this.emit([px, py, pz]);
      // Road resumes for the last 30% of the arc: short jumps land on a downslope.
      if (i === Math.round(n * 0.7)) gapRange.b = [px, py, pz];
    }
    this.x = x0 + f[0] * vx * tEnd;
    this.z = z0 + f[2] * vx * tEnd;
    this.y = y0 - opts.drop;
    if (openRange) openRange.b = this.here();
    // Landing slope: start at the arc's angle and ease out to flat.
    const landSlope = (vy - GRAVITY * tEnd) / vx;
    const L = opts.landing ?? 40;
    const m = Math.max(4, Math.round(L / 5));
    const ys = this.y;
    for (let i = 1; i < m; i++) {
      const t = i / m;
      // Quadratic that starts with slope landSlope and ends flat.
      const dy = landSlope * L * (t - (t * t) / 2);
      this.emit([this.x + f[0] * L * t, ys + dy, this.z + f[2] * L * t]);
    }
    this.x += f[0] * L;
    this.z += f[2] * L;
    this.y = ys + (landSlope * L) / 2;
    this.lipSlope = 0;
    return this;
  }

  get position(): V3 {
    return [this.x, this.y, this.z];
  }

  build(meta: Omit<TrackDef, 'points'>): TrackDef {
    const def: TrackDef = { ...meta, points: this.pts };
    if (
      !this.marksAt.length &&
      !this.regionsAt.length &&
      !this.rangesAt.length &&
      !this.kickersAt.length &&
      !this.hazardsAt.length
    )
      return def;
    // Resolve recorded world positions to arc lengths on the finished spline.
    const t = new Track(def);
    let hint = 0;
    const sOf = (p: V3) => {
      // Search forward from the previous feature so overlapping sections resolve in order.
      const pt = { x: p[0], y: p[1], z: p[2] };
      let best = hint,
        bd = Infinity;
      for (let k = 0; k < t.count * 0.6; k++) {
        const i = (hint + k) % t.count;
        const q = t.frame(i).pos;
        const d = (q.x - pt.x) ** 2 + (q.y - pt.y) ** 2 * 4 + (q.z - pt.z) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      hint = best;
      return best * t.spacing;
    };
    // Resolve everything in emission order along the lap.
    type Item = { p: V3; apply: (s: number) => void };
    const items: Item[] = [];
    const marks: Record<string, number> = {};
    const regions: [string, number][] = [];
    for (const m of this.marksAt) items.push({ p: m.p, apply: (s) => (marks[m.name] = s) });
    for (const r of this.regionsAt) items.push({ p: r.p, apply: (s) => regions.push([r.id, s]) });
    const ranges: Record<'gaps' | 'open' | 'tunnels', [number, number][]> = {
      gaps: [],
      open: [],
      tunnels: [],
    };
    for (const r of this.rangesAt) {
      const pair: [number, number] = [0, 0];
      ranges[r.kind].push(pair);
      items.push({ p: r.a, apply: (s) => (pair[0] = s) });
      items.push({ p: r.b ?? r.a, apply: (s) => (pair[1] = s) });
    }
    const kickers: { s: number; pop: number }[] = [];
    for (const k of this.kickersAt)
      items.push({ p: k.p, apply: (s) => kickers.push({ s, pop: k.pop }) });
    const hazards: HazardDef[] = [];
    for (const h of this.hazardsAt)
      items.push({ p: h.p, apply: (s) => hazards.push({ ...h.def, s: (s + h.ahead) % t.length }) });
    // Order features by their nearest control point (they were recorded while laying it out).
    const order = (p: V3) => {
      let best = 0,
        bd = Infinity;
      this.pts.forEach((q, i) => {
        const d = (q.p[0] - p[0]) ** 2 + (q.p[1] - p[1]) ** 2 * 4 + (q.p[2] - p[2]) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    };
    items.sort((a, b) => order(a.p) - order(b.p));
    for (const it of items) it.apply(sOf(it.p));
    regions.sort((a, b) => a[1] - b[1]);
    return {
      ...def,
      marks,
      regions,
      gaps: ranges.gaps.length ? ranges.gaps : def.gaps,
      open: ranges.open.length ? ranges.open : def.open,
      tunnels: ranges.tunnels.length ? ranges.tunnels : def.tunnels,
      kickers: [...(def.kickers ?? []), ...kickers],
      hazards: [...(def.hazards ?? []), ...hazards],
    };
  }
}

const round = (v: number): number => Math.round(v * 1000) / 1000;
