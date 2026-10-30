import * as THREE from 'three';
import { type Grandpa, WAVE_LENGTH, buildGrandpa } from './grandpa.ts';
import ROUNDS from './grandpaRoutes.json';
import { meshHeight } from './ground.ts';
import type { XY } from './layout.ts';
import { MAX_LOCK, type Mower, WHEELBASE, buildMower } from './mower.ts';

/**
 * Grandpa going about the farm, on the four loops the owner approved on the blueprint
 * (docs/farm/grandpa_routes.json, made by tools/farm-blueprint/grandpa_routes.py):
 *  1. from the corn crib to the concrete patio and back; at the patio he turns to the orchard
 *     and waves his cap;
 *  2. on the lawn tractor, down the east path and round and round the Christmas tree aisles;
 *  3. back and forth across the pumpkin patch, stopping to look and now and then to wave;
 *  4. strolling the orchard aisles, stopping under the trees.
 * Everything is in the farm's real metres (x east, y north; the scene's z is -y).
 */

interface Stop {
  kind: 'pause' | 'wave';
  s: number;
  sec: number;
  face: XY | null;
}
interface RouteData {
  name: string;
  mode: 'walk' | 'mow';
  speed: number;
  stops: [string, number, number, XY | null][];
  pts: XY[];
}

/** A closed loop through map points, measured along its length in metres. */
class Loop {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly s: Float64Array;
  readonly length: number;

  constructor(pts: XY[]) {
    const n = pts.length + 1;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.s = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = pts[i % pts.length]!;
      this.x[i] = p[0];
      this.y[i] = p[1];
      if (i) this.s[i] = this.s[i - 1]! + Math.hypot(p[0] - this.x[i - 1]!, p[1] - this.y[i - 1]!);
    }
    this.length = this.s[n - 1]!;
  }

  wrap(s: number): number {
    return ((s % this.length) + this.length) % this.length;
  }

  /** Index of the segment containing s, and how far along it (0..1). */
  private seg(s: number): [number, number] {
    s = this.wrap(s);
    let lo = 0,
      hi = this.s.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.s[m]! <= s) lo = m;
      else hi = m;
    }
    return [lo, (s - this.s[lo]!) / Math.max(1e-9, this.s[hi]! - this.s[lo]!)];
  }

  at(s: number, out: THREE.Vector2): THREE.Vector2 {
    const [i, f] = this.seg(s);
    return out.set(
      this.x[i]! + (this.x[i + 1]! - this.x[i]!) * f,
      this.y[i]! + (this.y[i + 1]! - this.y[i]!) * f,
    );
  }

  /** Direction of travel at s (radians, anticlockwise from east), over a span either side. */
  dir(s: number, span = 0.3): number {
    this.at(s - span, A);
    this.at(s + span, B);
    return Math.atan2(B.y - A.y, B.x - A.x);
  }
}
const A = new THREE.Vector2(),
  B = new THREE.Vector2();

/** A map direction (radians from east) as the yaw of something that faces -Z. */
const yawOf = (phi: number) => Math.atan2(-Math.cos(phi), Math.sin(phi));
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Beyond this (real metres from the camera) he isn't drawn or posed; he keeps going. */
const DRAW_DIST = 90;
/** Full detail within this distance, then a coarser head and fewer small parts, then less. */
const NEAR = 10,
  MID = 35;
const detailAt = (d: number): 0 | 1 | 2 => (d < NEAR ? 0 : d < MID ? 1 : 2);

// ---------------------------------------------------------------- on foot

class Walker {
  readonly gp: Grandpa;
  private loop: Loop;
  private stops: Stop[];
  private s: number;
  private next = 0;
  private speed = 0;
  private yaw: number;
  private stop: { at: Stop; t: number; wave: number | null } | null = null;
  readonly pos = new THREE.Vector2();

  constructor(
    readonly name: string,
    r: RouteData,
    start: number,
    gp: Grandpa,
  ) {
    this.gp = gp;
    this.loop = new Loop(r.pts);
    this.stops = r.stops
      .map(([kind, s, sec, face]) => ({ kind: kind as Stop['kind'], s, sec, face }))
      .sort((a, b) => a.s - b.s);
    this.s = this.loop.wrap(start * this.loop.length);
    while (this.next < this.stops.length && this.stops[this.next]!.s <= this.s) this.next++;
    this.next %= Math.max(1, this.stops.length);
    this.yaw = yawOf(this.loop.dir(this.s));
    this.loop.at(this.s, this.pos);
  }

  /** Jump to `s` metres along the loop (for looking at a moment of his round). */
  seek(s: number): void {
    this.s = this.loop.wrap(s);
    this.stop = null;
    this.speed = 0;
    this.next = this.stops.findIndex((x) => x.s > this.s);
    if (this.next < 0) this.next = 0;
    this.yaw = yawOf(this.loop.dir(this.s));
  }

  /** Where his stops are along the loop. */
  get stopsAt(): { kind: string; s: number }[] {
    return this.stops.map((x) => ({ kind: x.kind, s: x.s }));
  }

  update(t: number, dt: number, dist: number): void {
    const draw = dist < DRAW_DIST;
    if (draw) this.gp.setDetail(detailAt(dist));
    const stroll = this.gp.strollSpeed;
    let act: { kind: 'wave'; t: number } | undefined;
    let want = this.yaw,
      turnRate = 1.4;
    if (this.stop) {
      const st = this.stop;
      st.t += dt;
      this.speed = 0;
      let done = st.t >= st.at.sec;
      if (st.at.kind === 'wave' && st.at.face) {
        // Turn to face whoever he's waving at, then the cap comes off.
        const p = this.pos;
        want = yawOf(Math.atan2(st.at.face[1] - p.y, st.at.face[0] - p.x));
        turnRate = 0.9;
        if (st.wave === null && Math.abs(wrapPi(want - this.yaw)) < 0.06) st.wave = 0;
        if (st.wave !== null) {
          st.wave += dt;
          act = { kind: 'wave', t: st.wave };
        }
        done = st.wave !== null && st.wave > WAVE_LENGTH + 0.4 && done;
      }
      if (done) {
        this.stop = null;
        this.next = (this.next + 1) % this.stops.length;
      }
    } else {
      // Amble along, easing to a halt at the next stop and slowly getting going again.
      const nx = this.stops[this.next];
      let ds = Infinity;
      if (nx) {
        ds = nx.s - this.s;
        if (ds < 0) ds += this.loop.length;
      }
      const target = stroll * Math.min(1, Math.max(0.12, Math.sqrt(ds / 1.1)));
      this.speed = target < this.speed ? target : Math.min(target, this.speed + 0.35 * dt);
      const step = this.speed * dt;
      if (nx && ds <= Math.max(step, 0.015)) {
        this.s = nx.s;
        this.stop = { at: nx, t: 0, wave: null };
        this.speed = 0;
      } else this.s = this.loop.wrap(this.s + step);
      want = yawOf(this.loop.dir(this.s + 0.45, 0.45));
    }
    const dyaw = wrapPi(want - this.yaw);
    this.yaw += THREE.MathUtils.clamp(dyaw, -turnRate * dt, turnRate * dt);
    this.loop.at(this.s, this.pos);
    const g = this.gp.group;
    g.position.set(this.pos.x, meshHeight(this.pos.x, this.pos.y), -this.pos.y);
    g.rotation.y = this.yaw;
    g.visible = draw;
    if (draw) this.gp.animate(t, this.speed, act);
  }
}

// ---------------------------------------------------------------- on the lawn tractor

/**
 * The tractor follows its track exactly (the middle of the rear axle on the line), and the
 * steering comes from the line's curve: so the front wheels, the steering wheel and his hand
 * on it all turn exactly as much as the turn needs. The track was laid out with turns a garden
 * tractor can make and smoothed so the wheel goes round at a hand's pace; he slows for the
 * tight U-turns at the ends of the aisles.
 */
class Rider {
  readonly gp: Grandpa;
  readonly mower: Mower;
  /** Placed on the ground and turned to the heading; the tractor (and he) ride on it. */
  readonly carrier = new THREE.Group();
  private loop: Loop;
  private phi: Float32Array;
  private steer: Float32Array;
  private vmax: Float32Array;
  private ds: number;
  private s = 0;
  readonly pos = new THREE.Vector2();
  /** Direction of travel (radians from east). */
  heading = 0;

  constructor(
    readonly name: string,
    r: RouteData,
    gp: Grandpa,
  ) {
    this.loop = new Loop(r.pts);
    const L = this.loop.length;
    const n = Math.ceil(L / 0.1);
    this.ds = L / n;
    this.phi = new Float32Array(n);
    this.steer = new Float32Array(n);
    this.vmax = new Float32Array(n);
    for (let i = 0; i < n; i++) this.phi[i] = this.loop.dir(i * this.ds, 0.3);
    // Curvature, smoothed over half a metre either side.
    const k = new Float32Array(n);
    for (let i = 0; i < n; i++)
      k[i] = wrapPi(this.phi[(i + 3) % n]! - this.phi[(i - 3 + n) % n]!) / (6 * this.ds);
    const w = 5;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = -w; j <= w; j++) sum += k[(i + j + n) % n]!;
      const kap = sum / (2 * w + 1);
      // Turning left (anticlockwise on the map) is negative steer.
      this.steer[i] = THREE.MathUtils.clamp(-Math.atan(WHEELBASE * kap) / MAX_LOCK, -1, 1);
      const tight = THREE.MathUtils.clamp((Math.abs(kap) - 0.15) / 0.55, 0, 1);
      this.vmax[i] = r.speed * (1 - 0.5 * tight);
    }
    // Brake into the tight turns and pull away gently after them.
    for (let pass = 0; pass < 2; pass++)
      for (let i = n - 1; i >= 0; i--) {
        const nxt = this.vmax[(i + 1) % n]!;
        this.vmax[i] = Math.min(this.vmax[i]!, Math.sqrt(nxt * nxt + 2 * 0.35 * this.ds));
      }
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < n; i++) {
        const prv = this.vmax[(i - 1 + n) % n]!;
        this.vmax[i] = Math.min(this.vmax[i]!, Math.sqrt(prv * prv + 2 * 0.3 * this.ds));
      }

    this.mower = buildMower();
    // The carrier's origin is the middle of the rear axle.
    this.mower.group.position.z = -0.38;
    this.carrier.add(this.mower.group);
    this.carrier.rotation.order = 'YXZ';
    this.gp = gp;
    this.mower.seat.add(this.gp.group);
  }

  private sample(arr: Float32Array, s: number, angle = false): number {
    const n = arr.length;
    const f = this.loop.wrap(s) / this.ds;
    const i = Math.floor(f) % n,
      j = (i + 1) % n;
    const a = arr[i]!,
      b = arr[j]!;
    return a + (angle ? wrapPi(b - a) : b - a) * (f - Math.floor(f));
  }

  seek(s: number): void {
    this.s = this.loop.wrap(s);
  }

  get stopsAt(): { kind: string; s: number }[] {
    return [];
  }

  update(t: number, dt: number, dist: number): void {
    const draw = dist < DRAW_DIST;
    if (draw) this.gp.setDetail(detailAt(dist));
    const v = this.sample(this.vmax, this.s);
    this.s = this.loop.wrap(this.s + v * dt);
    const phi = this.sample(this.phi, this.s, true);
    this.heading = phi;
    const steer = this.sample(this.steer, this.s);
    const p = this.loop.at(this.s, this.pos);
    // Sit on the lawn, pitched and rolled with it.
    const c = Math.cos(phi),
      sn = Math.sin(phi);
    const h0 = meshHeight(p.x, p.y);
    const hf = meshHeight(p.x + c * WHEELBASE, p.y + sn * WHEELBASE);
    const hr = meshHeight(p.x + sn * 0.4, p.y - c * 0.4),
      hl = meshHeight(p.x - sn * 0.4, p.y + c * 0.4);
    this.carrier.position.set(p.x, h0, -p.y);
    this.carrier.rotation.set(Math.atan2(hf - h0, WHEELBASE), yawOf(phi), Math.atan2(hr - hl, 0.8));
    this.carrier.visible = draw;
    if (!draw) return;
    this.mower.update(t, v, steer);
    this.gp.animate(t, 0, {
      kind: 'ride',
      wheel: this.mower.wheel,
      wheelR: this.mower.wheelR,
      feet: this.mower.feet,
      shake: 1,
      speed: v,
    });
  }
}

// ---------------------------------------------------------------- all four

export interface GrandpaRounds {
  group: THREE.Group;
  /** Where each grandpa is (map metres), for following him with the camera. */
  folks: { name: string; label: string; pos: THREE.Vector2 }[];
  /** Things to keep the kart out of: map metres and radius. */
  obstacles(): { x: number; y: number; r: number }[];
  update(t: number, dt: number, cam: THREE.Vector3): void;
  /** Move one of them to `s` metres along his loop; and where each one's stops are. */
  seek(i: number, s: number): void;
  stops(i: number): { kind: string; s: number }[];
}

export function buildGrandpaRounds(): GrandpaRounds {
  const routes = ROUNDS.routes as RouteData[];
  const byName = (n: string) => routes.find((r) => r.name === n)!;
  const group = new THREE.Group();
  group.name = 'grandpa-rounds';
  // Each loop starts somewhere different along it, so they aren't all setting off at once.
  // One grandpa is built; the others are copies of him (same geometry, their own joints).
  const first = buildGrandpa();
  const walkers = [
    new Walker('crib', byName('crib_to_patio'), 0.35, first),
    new Walker('pumpkins', byName('pumpkin_patch'), 0.1, first.clone()),
    new Walker('orchard', byName('orchard'), 0.6, first.clone()),
  ];
  const rider = new Rider('mower', byName('mower_christmas_trees'), first.clone());
  for (const w of walkers) group.add(w.gp.group);
  group.add(rider.carrier);
  const labels: Record<string, string> = {
    crib: 'Grandpa · crib to the patio',
    mower: 'Grandpa · mowing the Christmas trees',
    pumpkins: 'Grandpa · pumpkin patch',
    orchard: 'Grandpa · orchard',
  };
  const all = [walkers[0]!, rider, walkers[1]!, walkers[2]!];
  return {
    group,
    folks: all.map((f) => ({ name: f.name, label: labels[f.name]!, pos: f.pos })),
    obstacles: () => [
      ...walkers.map((w) => ({ x: w.pos.x, y: w.pos.y, r: 0.35 })),
      // The tractor, round its middle (about half a metre ahead of the rear axle).
      {
        x: rider.pos.x + Math.cos(rider.heading) * 0.45,
        y: rider.pos.y + Math.sin(rider.heading) * 0.45,
        r: 0.9,
      },
    ],
    seek: (i, s) => all[i]!.seek(s),
    stops: (i) => all[i]!.stopsAt,
    update(t, dt, cam) {
      for (const f of all) {
        f.update(
          t,
          dt,
          Math.hypot(f.pos.x - cam.x, -f.pos.y - cam.z, cam.y - meshHeight(f.pos.x, f.pos.y)),
        );
      }
    },
  };
}
