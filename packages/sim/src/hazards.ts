import type { HazardDef } from '@epic/shared';
import { type KartState, launch, spinOut } from './kart.ts';
import type { Track } from './track.ts';
import { addScaled } from './vec.ts';

/** Live state of a hazard, recomputed every step from the race clock. */
export interface HazardState {
  def: HazardDef;
  index: number;
  s: number;
  lat: number;
  /** Strikers: warning before a hit. Others: always false. */
  warning: boolean;
  /** Dangerous right now (movers and posts always; strikers only while striking). */
  active: boolean;
  /** Present at all (fromLap gating). */
  present: boolean;
  /** 0..1 position through the strike cycle, for animation. */
  cycle: number;
}

export function createHazards(defs: HazardDef[]): HazardState[] {
  return defs.map((def, index) => ({
    def,
    index,
    s: def.s,
    lat: def.lat,
    warning: false,
    active: true,
    present: true,
    cycle: 0,
  }));
}

export function updateHazards(hs: HazardState[], time: number, leaderLap: number): void {
  const t = Math.max(0, time);
  for (const h of hs) {
    const d = h.def;
    h.present = leaderLap >= (d.fromLap ?? 1);
    h.s = d.s;
    h.lat = d.lat;
    if (d.move) {
      const off = d.move.amp * Math.sin((2 * Math.PI * t) / d.move.period + (d.move.phase ?? 0));
      if (d.move.axis === 'lat') h.lat += off;
      else h.s += off;
    }
    if (d.strike) {
      const { period, warn, active } = d.strike;
      const c = (((t + (d.strike.phase ?? 0)) % period) + period) % period;
      h.cycle = c / period;
      const hitStart = period - active;
      h.warning = c >= hitStart - warn && c < hitStart;
      h.active = c >= hitStart;
    } else {
      h.warning = false;
      h.active = true;
      h.cycle = (t % 4) / 4;
    }
    if (!h.present) {
      h.active = false;
      h.warning = false;
    }
  }
}

/** Signed distance along the track from a to b, wrapped to [-L/2, L/2]. */
export function sDelta(a: number, b: number, L: number): number {
  let d = b - a;
  if (d > L / 2) d -= L;
  if (d < -L / 2) d += L;
  return d;
}

/** Apply hazard effects to one kart. */
export function collideHazards(k: KartState, hs: HazardState[], track: Track): void {
  // Rescued, carried by an eagle, or an unstoppable Batmissile: hazards can't touch you.
  if (k.rescueTime > 0 || k.eagleTime > 0 || k.special?.kind === 'missile') return;
  const KART_R = 1.1;
  for (const h of hs) {
    if (!h.active) continue;
    const ds = sDelta(h.s, k.s, track.length);
    if (Math.abs(ds) > h.def.r + 6) continue;
    const dl = k.lat - h.lat;
    const dist = Math.hypot(ds, dl);
    if (dist > h.def.r + KART_R) continue;
    // Flying over low hazards is allowed.
    if (k.air && h.def.effect !== 'launch' && h.def.kind !== 'tall') {
      const f = track.frameAtS(k.s);
      const height =
        (k.pos.x - f.pos.x) * f.up.x + (k.pos.y - f.pos.y) * f.up.y + (k.pos.z - f.pos.z) * f.up.z;
      if (height > 2.5) continue;
    }
    switch (h.def.effect) {
      case 'slow':
        k.slowTime = Math.max(k.slowTime, 0.2);
        break;
      case 'bump': {
        // Solid obstacle: push out sideways and lose speed.
        const f = track.frameAtS(k.s);
        const push = h.def.r + KART_R - dist + 0.05;
        const side = dl === 0 ? 1 : Math.sign(dl);
        k.pos = addScaled(k.pos, f.right, side * push);
        k.lat += side * push;
        if (k.hitCooldown <= 0) {
          k.speed *= 0.45;
          k.bump = 1;
          k.hitCooldown = 0.6;
        }
        break;
      }
      case 'spin':
        if (k.hitCooldown <= 0) {
          spinOut(k, 0.9, 0.5);
          k.bump = 1;
          k.hitCooldown = 1.5;
        }
        break;
      case 'launch':
        if (k.hitCooldown <= 0 && !k.air) {
          k.speed *= 0.6;
          launch(k, 13);
          k.stunTime = k.stunTotal = 0.5;
          k.bump = 1;
          k.hitCooldown = 1.5;
        }
        break;
    }
  }
}
