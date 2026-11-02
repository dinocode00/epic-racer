import * as THREE from 'three';
import { type MowerSchedule, type WalkerSchedule, grandpaSchedules } from '@epic/sim';
import { type Grandpa, buildGrandpa } from './grandpa.ts';
import { meshHeight } from './ground.ts';
import { type Mower, WHEELBASE, buildMower } from './mower.ts';

/**
 * Grandpa going about the farm, on the four loops the owner approved on the blueprint
 * (docs/farm/grandpa_routes.json, made by tools/farm-blueprint/grandpa_routes.py):
 *  1. from the corn crib to the concrete patio and back; at the patio he turns to the orchard
 *     and waves his cap;
 *  2. on the lawn tractor, down the east path and round and round the Christmas tree aisles;
 *  3. back and forth across the pumpkin patch, stopping to look and now and then to wave;
 *  4. strolling the orchard aisles, stopping under the trees.
 * Where he is comes from his timetable in the race package (grandpaSchedule.ts), read off the
 * clock, so in a race he's exactly where the race has him as an obstacle. Everything is in the
 * farm's real metres (x east, y north; the scene's z is -y).
 */

/** A map direction (radians from east) as the yaw of something that faces -Z. */
const yawOf = (phi: number) => Math.atan2(-Math.cos(phi), Math.sin(phi));

/** Beyond this (real metres from the camera) he isn't drawn or posed; he keeps going. */
const DRAW_DIST = 90;
/** Full detail within this distance, then a coarser head and fewer small parts, then less. */
const NEAR = 10,
  MID = 35;
const detailAt = (d: number): 0 | 1 | 2 => (d < NEAR ? 0 : d < MID ? 1 : 2);

// ---------------------------------------------------------------- on foot

class Walker {
  readonly pos = new THREE.Vector2();
  private clock = 0;

  constructor(
    readonly name: string,
    readonly sched: WalkerSchedule,
    readonly gp: Grandpa,
  ) {}

  seek(s: number): void {
    this.sched.seek(s, this.clock);
  }

  get stopsAt(): { kind: string; s: number }[] {
    return this.sched.stops;
  }

  update(t: number, dist: number): void {
    this.clock = t;
    const p = this.sched.at(t);
    this.pos.set(p.x, p.y);
    const g = this.gp.group;
    g.position.set(p.x, meshHeight(p.x, p.y), -p.y);
    g.rotation.y = yawOf(p.heading);
    g.visible = dist < DRAW_DIST;
    if (!g.visible) return;
    this.gp.setDetail(detailAt(dist));
    this.gp.animate(t, p.speed, p.wave === null ? undefined : { kind: 'wave', t: p.wave });
  }
}

// ---------------------------------------------------------------- on the lawn tractor

/**
 * The tractor follows its track exactly (the middle of the rear axle on the line), and the
 * steering comes from the line's curve: so the front wheels, the steering wheel and his hand
 * on it all turn exactly as much as the turn needs.
 */
class Rider {
  readonly mower: Mower;
  /** Placed on the ground and turned to the heading; the tractor (and he) ride on it. */
  readonly carrier = new THREE.Group();
  readonly pos = new THREE.Vector2();
  /** Direction of travel (radians from east). */
  heading = 0;
  private clock = 0;

  constructor(
    readonly name: string,
    readonly sched: MowerSchedule,
    readonly gp: Grandpa,
  ) {
    this.mower = buildMower();
    // The carrier's origin is the middle of the rear axle.
    this.mower.group.position.z = -0.38;
    this.carrier.add(this.mower.group);
    this.carrier.rotation.order = 'YXZ';
    this.mower.seat.add(this.gp.group);
  }

  seek(s: number): void {
    this.sched.seek(s, this.clock);
  }

  get stopsAt(): { kind: string; s: number }[] {
    return [];
  }

  update(t: number, dist: number): void {
    this.clock = t;
    const m = this.sched.at(t);
    this.pos.set(m.x, m.y);
    this.heading = m.heading;
    const draw = dist < DRAW_DIST;
    // Sit on the lawn, pitched and rolled with it.
    const c = Math.cos(m.heading),
      sn = Math.sin(m.heading);
    const h0 = meshHeight(m.x, m.y);
    const hf = meshHeight(m.x + c * WHEELBASE, m.y + sn * WHEELBASE);
    const hr = meshHeight(m.x + sn * 0.4, m.y - c * 0.4),
      hl = meshHeight(m.x - sn * 0.4, m.y + c * 0.4);
    this.carrier.position.set(m.x, h0, -m.y);
    this.carrier.rotation.set(
      Math.atan2(hf - h0, WHEELBASE),
      yawOf(m.heading),
      Math.atan2(hr - hl, 0.8),
    );
    this.carrier.visible = draw;
    if (!draw) return;
    this.gp.setDetail(detailAt(dist));
    this.mower.update(t, m.speed, m.steer);
    this.gp.animate(t, 0, {
      kind: 'ride',
      wheel: this.mower.wheel,
      wheelR: this.mower.wheelR,
      feet: this.mower.feet,
      shake: 1,
      speed: m.speed,
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
  /** `t` is the clock his timetable runs on (in a race, the race clock). */
  update(t: number, dt: number, cam: THREE.Vector3): void;
  /** Move one of them to `s` metres along his loop; and where each one's stops are. */
  seek(i: number, s: number): void;
  stops(i: number): { kind: string; s: number }[];
}

export function buildGrandpaRounds(): GrandpaRounds {
  const group = new THREE.Group();
  group.name = 'grandpa-rounds';
  const S = grandpaSchedules();
  // One grandpa is built; the others are copies of him (same geometry, their own joints).
  const first = buildGrandpa();
  const walkers = S.walkers.map((w, i) => new Walker(w.name, w.sched, i ? first.clone() : first));
  const rider = new Rider('mower', S.mower, first.clone());
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
    update(t, _dt, cam) {
      for (const f of all)
        f.update(
          t,
          Math.hypot(f.pos.x - cam.x, -f.pos.y - cam.z, cam.y - meshHeight(f.pos.x, f.pos.y)),
        );
    },
  };
}
