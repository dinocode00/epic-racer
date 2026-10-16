import { describe, expect, it } from 'vitest';
import { VEHICLES, neutralPad, decodeInput, encodeInput } from '@epic/shared';
import { PROVING, Race, Track, dot, len } from '../src/index.ts';

describe('track', () => {
  const t = new Track(PROVING);
  it('is a closed loop of plausible length', () => {
    expect(t.length).toBeGreaterThan(800);
    expect(t.length).toBeLessThan(1400);
  });
  it('has orthonormal frames everywhere', () => {
    for (const f of t.frames) {
      expect(Math.abs(len(f.tan) - 1)).toBeLessThan(1e-6);
      expect(Math.abs(len(f.up) - 1)).toBeLessThan(1e-6);
      expect(Math.abs(dot(f.tan, f.up))).toBeLessThan(1e-6);
    }
  });
  it('goes upside down in the loop', () => {
    expect(Math.min(...t.frames.map((f) => f.up.y))).toBeLessThan(-0.95);
  });
  it('projects a point back onto the centre line', () => {
    const p = t.pointAt(123, 2.5, 0);
    const pr = t.project(p, t.nearestIndex(p));
    expect(pr.s).toBeCloseTo(123, 0);
    expect(pr.lateral).toBeCloseTo(2.5, 1);
  });
});

describe('race', () => {
  it('AI karts complete a full race, including the loop', () => {
    const race = new Race(
      PROVING,
      VEHICLES.concat(VEHICLES, VEHICLES)
        .slice(0, 8)
        .map((v) => ({ vehicle: v, human: false })),
      2,
    );
    let steps = 0;
    while (race.phase !== 'finished' && steps < 60 * 300) {
      race.step([]);
      steps++;
    }
    expect(race.phase).toBe('finished');
    const times = race.karts.map((k) => k.finishTime);
    // Sensible lap times: 2 laps of ~1km at ~25 m/s.
    expect(Math.min(...times)).toBeGreaterThan(40);
    expect(Math.max(...times)).toBeLessThan(160);
  });

  it('a human holding the throttle and drifting never leaves the road', () => {
    const race = new Race(PROVING, [{ vehicle: VEHICLES[0]!, human: true }], 1);
    for (let i = 0; i < 60 * 20; i++) {
      const k = race.karts[0]!;
      const pr = race.track.project(k.pos, k.hint);
      expect(Math.abs(pr.lateral)).toBeLessThanOrEqual(pr.frame.width / 2);
      race.step([{ ...neutralPad(), throttle: 1, steer: Math.sin(i / 40), drift: i % 120 < 60 }]);
    }
    expect(race.karts[0]!.progress).toBeGreaterThan(200);
  });
});

describe('protocol', () => {
  it('round-trips an input frame', () => {
    const pad = { ...neutralPad(), steer: -0.5, throttle: 1, drift: true };
    const out = decodeInput(encodeInput(pad, 42))!;
    expect(out.seq).toBe(42);
    expect(out.pad.steer).toBeCloseTo(-0.5, 1);
    expect(out.pad.throttle).toBe(1);
    expect(out.pad.drift).toBe(true);
    expect(out.pad.item).toBe(false);
  });
});

describe('race stats (diagnostic)', () => {
  it('prints lap pace per vehicle', () => {
    const race = new Race(
      PROVING,
      VEHICLES.concat(VEHICLES, VEHICLES)
        .slice(0, 8)
        .map((v) => ({ vehicle: v, human: false })),
      2,
    );
    while (race.phase !== 'finished' && race.time < 300) race.step([]);
    console.log(
      'length',
      race.track.length.toFixed(0),
      race.karts.map((k) => `${k.vehicle.id}:${k.finishTime.toFixed(1)}`).join(' '),
    );
  });
});
