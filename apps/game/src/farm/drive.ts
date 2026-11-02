import * as THREE from 'three';
import { MAX_LOCK, WHEELBASE } from './mower.ts';

/**
 * Drives the lawn tractor along a path like a person would: looks a couple of metres ahead
 * on the path, works out how much to steer to get there (pure pursuit), and turns the wheel
 * no faster than a hand can, so the steering wheel, the front wheels and the tractor's
 * heading all follow each other. The tractor faces -Z (heading 0); positions are x/z in the
 * tractor's parent frame.
 */
export class MowerDriver {
  pos = new THREE.Vector2();
  heading = 0;
  /** Current steering, -1 full left .. +1 full right. */
  steer = 0;
  private s = 0;

  constructor(
    private path: (s: number) => THREE.Vector2,
    private pathLength: number,
    private lookahead = 2.2,
    /** How fast the wheel can be turned (full lock per second). */
    private steerRate = 0.9,
  ) {
    const a = path(0),
      b = path(0.05);
    this.pos.copy(a);
    this.heading = Math.atan2(-(b.x - a.x), -(b.y - a.y));
  }

  step(dt: number, speed: number): void {
    // Keep track of the nearest point on the path (searching a little way ahead).
    let best = this.s,
      bd = Infinity;
    for (let k = 0; k <= 30; k++) {
      const s = this.s + k * 0.1;
      const d = this.path(s % this.pathLength).distanceToSquared(this.pos);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    this.s = best % this.pathLength;
    const goal = this.path((this.s + this.lookahead) % this.pathLength);
    // The goal in the tractor's own frame: forward is -z, right is +x.
    const dx = goal.x - this.pos.x,
      dz = goal.y - this.pos.y;
    const c = Math.cos(this.heading),
      sn = Math.sin(this.heading);
    const right = dx * c - dz * sn;
    const fwd = -dx * sn - dz * c;
    const alpha = Math.atan2(right, fwd);
    const ld = Math.hypot(dx, dz);
    const want = THREE.MathUtils.clamp(
      Math.atan((2 * WHEELBASE * Math.sin(alpha)) / ld) / MAX_LOCK,
      -1,
      1,
    );
    const maxStep = this.steerRate * dt;
    this.steer += THREE.MathUtils.clamp(want - this.steer, -maxStep, maxStep);
    // Bicycle model: turning right (+steer) swings the heading clockwise from above.
    this.heading -= ((speed * Math.tan(this.steer * MAX_LOCK)) / WHEELBASE) * dt;
    this.pos.x += -Math.sin(this.heading) * speed * dt;
    this.pos.y += -Math.cos(this.heading) * speed * dt;
  }
}

/** A figure-eight lawn path (lemniscate) `a` metres from centre to each end, with its length. */
export function figureEight(a: number): { path: (s: number) => THREE.Vector2; length: number } {
  const at = (u: number) => {
    const sn = Math.sin(u),
      c = Math.cos(u);
    const d = 1 + sn * sn;
    return new THREE.Vector2((a * c) / d, (a * sn * c) / d);
  };
  // Tabulate arc length so `path` takes metres.
  const N = 2000;
  const us: number[] = [0],
    ls: number[] = [0];
  let prev = at(0),
    L = 0;
  for (let i = 1; i <= N; i++) {
    const u = (i / N) * Math.PI * 2;
    const p = at(u);
    L += p.distanceTo(prev);
    prev = p;
    us.push(u);
    ls.push(L);
  }
  const path = (s: number) => {
    s = ((s % L) + L) % L;
    let lo = 0,
      hi = N;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ls[mid]! < s) lo = mid;
      else hi = mid;
    }
    const k = (s - ls[lo]!) / (ls[hi]! - ls[lo]! || 1);
    return at(us[lo]! + (us[hi]! - us[lo]!) * k);
  };
  return { path, length: L };
}
