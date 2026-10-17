import { describe, expect, it } from 'vitest';
import { VEHICLES } from '@epic/shared';
import { Race, TrackBuilder, aiDrive, createBrain } from '../src/index.ts';

/** A rectangle with a jump on the back straight, an open bridge, and a pillar. */
function jumpTrack() {
  const b = new TrackBuilder(6, 9);
  b.straight(160).turn(90, 40, 0).straight(60).turn(90, 40, 0);
  b.mark('ramp').ramp(30, 18).flight({ drop: 4, landing: 40 });
  b.mark('afterJump');
  b.begin('open').straight(50).end('open');
  b.hazard(20, { kind: 'pillar', lat: 0, r: 2, effect: 'bump' });
  b.straight(30).turn(90, 40, 0).straight(60).turn(90, 40, 0);
  return b.closeLoop().build({ id: 'jt', name: 'Jump test', defaultWidth: 18, laps: 3 });
}

describe('jumps, gaps and hazards', () => {
  const def = jumpTrack();
  it('records marks, a gap, a kicker, an open range and a hazard in lap order', () => {
    expect(def.marks!.ramp!).toBeLessThan(def.marks!.afterJump!);
    expect(def.gaps!.length).toBe(1);
    const [g0, g1] = def.gaps![0]!;
    expect(g0).toBeGreaterThan(def.marks!.ramp!);
    expect(g1).toBeGreaterThan(g0 + 5);
    expect(def.kickers!.length).toBe(1);
    expect(def.open!.length).toBe(1);
    expect(def.hazards!.length).toBe(1);
  });

  it('an AI kart flies the gap and keeps racing (no rescue needed at speed)', () => {
    const race = new Race(def, [{ vehicle: VEHICLES[1]!, human: false }], 1);
    let flew = false;
    let rescued = false;
    for (let i = 0; i < 60 * 60 && race.phase !== 'finished'; i++) {
      race.step([]);
      const k = race.karts[0]!;
      if (k.air && k.airTime > 0.4) flew = true;
      if (k.rescueTime > 0) rescued = true;
    }
    expect(flew).toBe(true);
    expect(rescued).toBe(false);
    expect(race.phase).toBe('finished');
  });

  it('a kart crawling into the gap falls and the eagles rescue it', () => {
    const race = new Race(def, [{ vehicle: VEHICLES[1]!, human: true }], 1);
    const brain = createBrain(1, 1);
    let rescued = false;
    for (let i = 0; i < 60 * 90 && !rescued; i++) {
      const k = race.karts[0]!;
      const nearRamp = k.s > def.marks!.ramp! - 40 && k.s < def.marks!.afterJump!;
      // Steer like the AI, but crawl over the lip so the jump falls short.
      const pad = aiDrive(brain, k, race.track, k.progress, 1 / 60);
      const crawl = nearRamp && k.speed > 5;
      race.step([{ ...pad, drift: false, throttle: crawl ? 0 : 1, brake: crawl ? 1 : 0 }]);
      if (k.rescueTime > 0) rescued = true;
    }
    expect(rescued).toBe(true);
  });

  it('driving straight into the pillar stops you', () => {
    const race = new Race(def, [{ vehicle: VEHICLES[1]!, human: true }], 1);
    const brain = createBrain(2, 1);
    brain.laneTimer = 1e9; // hold the centre lane, right through the pillar
    const h = def.hazards![0]!;
    let hit = false;
    for (let i = 0; i < 60 * 60 && !hit; i++) {
      const k = race.karts[0]!;
      const pad = aiDrive(brain, k, race.track, k.progress, 1 / 60); // no hazard list: no dodging
      race.step([{ ...pad, drift: false, throttle: 1 }]);
      if (Math.abs(race.karts[0]!.s - h.s) < 4 && race.karts[0]!.bump > 0.9) hit = true;
    }
    expect(hit).toBe(true);
  });
});
