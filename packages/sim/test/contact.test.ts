import { describe, expect, it } from 'vitest';
import { type PadState, VEHICLES, neutralPad } from '@epic/shared';
import { PROVING, Race, type KartState, clone, dot, spinOut } from '../src/index.ts';

/** Two human karts on the proving ground's start straight, already racing. */
function duel(sA: number, sB: number, latA = 0, latB = 0) {
  const race = new Race(
    PROVING,
    [VEHICLES[1]!, VEHICLES[1]!].map((v) => ({ vehicle: v, human: true })),
    2,
  );
  race.phase = 'racing';
  race.time = 1;
  const place = (k: KartState, s: number, lat: number) => {
    const f = race.track.frameAtS(s);
    k.pos = race.track.pointAt(s, lat, k.params.rideHeight);
    k.prevPos = clone(k.pos);
    k.fwd = clone(f.tan);
    k.up = clone(f.up);
    k.hint = race.track.nearestIndex(k.pos);
    k.s = s;
    k.lat = lat;
    k.progress = s;
  };
  place(race.karts[0]!, sA, latA);
  place(race.karts[1]!, sB, latB);
  return race;
}
const gas: PadState = { ...neutralPad(), throttle: 1 };

describe('contact and hazards', () => {
  it('a spin-out slows the kart but leaves it facing the same way', () => {
    const race = duel(20, 200);
    const k = race.karts[0]!;
    k.speed = 30;
    const before = clone(k.fwd);
    spinOut(k, 0.9, 0.5);
    for (let i = 0; i < 60; i++) race.step([gas, gas]);
    expect(dot(k.fwd, before)).toBeGreaterThan(0.95);
    expect(k.speed).toBeLessThan(15);
    expect(k.stunTime).toBe(0);
  });

  it('following closely charges a slipstream boost', () => {
    const race = duel(20, 29);
    const [a, b] = race.karts;
    a!.speed = b!.speed = 30;
    let boosted = false;
    for (let i = 0; i < 90 && !boosted; i++) {
      race.step([gas, gas]);
      boosted = a!.boostTime > 0;
    }
    expect(boosted).toBe(true);
    expect(b!.boostTime).toBe(0);
  });

  it('a rear-ender knocks the kart in front sideways and off balance', () => {
    const race = duel(20, 23, 0, 0.4);
    const [a, b] = race.karts;
    a!.speed = 34;
    b!.speed = 20;
    race.step([gas, gas]);
    expect(b!.wobbleTime).toBeGreaterThan(0);
    expect(Math.abs(b!.slide)).toBeGreaterThan(5);
    expect(a!.wobbleTime).toBe(0);
  });
});
