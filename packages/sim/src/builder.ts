import type { TrackDef, TrackPoint, V3 } from '@epic/shared';

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
  private emit(p: V3, up: V3 = [0, 1, 0], width?: number): void {
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
      this.emit([this.x + f[0] * length * t, this.y + height * (1 - Math.cos(2 * Math.PI * t)) / 2, this.z + f[2] * length * t]);
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
      this.emit([px, this.y + lift, pz], [inX * Math.sin(bank), Math.cos(bank), inZ * Math.sin(bank)]);
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
      const side = shift * (th - Math.sin(th)) / (2 * Math.PI);
      const up: V3 = [-f[0] * Math.sin(th), Math.cos(th), -f[2] * Math.sin(th)];
      this.emit([this.x + f[0] * along + rt[0] * side, this.y + h, this.z + f[2] * along + rt[2] * side], up);
    }
    this.x += rt[0] * shift;
    this.z += rt[2] * shift;
    return this;
  }

  get position(): V3 {
    return [this.x, this.y, this.z];
  }

  build(meta: Omit<TrackDef, 'points'>): TrackDef {
    return { ...meta, points: this.pts };
  }
}

const round = (v: number): number => Math.round(v * 1000) / 1000;
