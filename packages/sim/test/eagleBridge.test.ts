import { describe, expect, it } from 'vitest';
import { VEHICLES, neutralPad } from '@epic/shared';
import { CARRY_HOLD, CARRY_LIFT, CARRY_TIME, Race, TrackBuilder } from '../src/index.ts';

/** A rectangle whose back straight is a narrow eagle bridge, then a kicker ramp and pads. */
function bridgeTrack() {
  const b = new TrackBuilder(6, 9);
  b.straight(120).turn(90, 40, 0).straight(40).turn(90, 40, 0);
  b.mark('bridge').width(10).begin('open').begin('eagleBridges');
  b.straight(150);
  b.end('open').end('eagleBridges').width();
  b.mark('farSide').straight(40).turn(90, 40, 0);
  b.pad(10, -2.5).pad(20, 0, true);
  b.straight(40);
  b.mark('kicker').kicker(14);
  b.straight(120).turn(90, 40, 0);
  return b.closeLoop().build({ id: 'eb', name: 'Eagle bridge', defaultWidth: 18, laps: 3 });
}

describe('eagle bridges, kicker ramps and boost pads', () => {
  const def = bridgeTrack();

  it('records the bridge, the pads and the kicker ramp', () => {
    expect(def.eagleBridges).toEqual([[def.marks!.bridge!, def.marks!.farSide!]]);
    expect(def.pads!.map((p) => [p.lat, !!p.super])).toEqual([
      [-2.5, false],
      [0, true],
    ]);
    expect(def.pads![0]!.s).toBeLessThan(def.pads![1]!.s);
    expect(def.kickers).toEqual([{ s: def.marks!.kicker!, pop: 14, ramp: true }]);
  });

  it('fall off the bridge and an eagle holds you up, then sets you down past the far end', () => {
    const race = new Race(def, [{ vehicle: VEHICLES[1]!, human: true }], 1);
    const k = race.karts[0]!;
    const drive = (steer: number) => ({ ...neutralPad(), steer, throttle: 1 });
    for (let i = 0; i < 300; i++) race.step([{ ...drive(0), throttle: 0 }]); // the countdown
    const bridge = def.marks!.bridge!,
      far = def.marks!.farSide!;
    // Race up to the middle of the bridge, then steer hard off the side.
    for (let i = 0; i < 60 * 40 && k.progress < bridge + 50; i++) race.step([drive(0)]);
    expect(k.s).toBeGreaterThan(bridge + 40);
    expect(k.s).toBeLessThan(bridge + 60);
    let caughtAt = -1;
    for (let i = 0; i < 60 * 5 && caughtAt < 0; i++) {
      race.step([drive(1)]);
      if (k.carry) caughtAt = race.time;
    }
    expect(caughtAt).toBeGreaterThan(0);
    const fromS = k.carry!.fromS;
    expect(fromS).toBeGreaterThan(bridge);
    expect(fromS).toBeLessThan(far);
    // Held up in the air, over the gorge where it fell, for a second or two...
    for (let i = 0; i < 60 * (CARRY_LIFT + CARRY_HOLD * 0.8); i++) race.step([drive(0)]);
    expect(k.carry).not.toBeNull();
    expect(Math.abs(k.s - fromS)).toBeLessThan(1);
    const deck = race.track.pointAt(fromS, 0, 0);
    expect(k.pos.y).toBeGreaterThan(deck.y + 5);
    expect(k.rescueTime).toBeGreaterThan(0); // nothing can hit it up there
    // ...then flown across and set down on the far side, rolling.
    for (let i = 0; i < 60 * CARRY_TIME && k.carry; i++) race.step([drive(0)]);
    expect(k.carry).toBeNull();
    expect(k.air).toBe(false);
    expect(k.s).toBeGreaterThan(far);
    expect(k.s).toBeLessThan(far + 30);
    expect(k.speed).toBeGreaterThan(10);
    expect(race.time - caughtAt).toBeGreaterThan(CARRY_TIME - 0.1);
    expect(race.time - caughtAt).toBeLessThan(CARRY_TIME + 0.2);
  });

  it('a kicker ramp throws you into big air and lands you on the road', () => {
    const race = new Race(def, [{ vehicle: VEHICLES[1]!, human: false }], 1);
    let air = 0,
      rescued = false;
    for (let i = 0; i < 60 * 120 && race.phase !== 'finished'; i++) {
      race.step([]);
      const k = race.karts[0]!;
      if (k.air) air = Math.max(air, k.airTime);
      if (k.rescueTime > 0) rescued = true;
    }
    expect(air).toBeGreaterThan(1.6);
    expect(rescued).toBe(false);
  });

  it('a pad kicks you past top speed, a super pad much further', () => {
    for (const [i, kick] of [
      [0, 10],
      [1, 26],
    ] as const) {
      const race = new Race(
        { ...def, padBoost: { time: 1.7, kick: 10 }, superBoost: { time: 2.8, kick: 26 } },
        [{ vehicle: VEHICLES[1]!, human: true }],
        1,
      );
      const k = race.karts[0]!;
      for (let j = 0; j < 300; j++) race.step([neutralPad()]);
      const p = def.pads![i]!;
      // Just onto the pad (they work over their first 3 m).
      const f = race.track.frameAtS(p.s + 0.2);
      k.pos = race.track.pointAt(p.s + 0.2, p.lat, k.params.rideHeight);
      k.hint = race.track.nearestIndex(k.pos);
      k.s = p.s + 0.2;
      k.fwd = { ...f.tan };
      k.speed = k.params.topSpeed;
      race.step([{ ...neutralPad(), throttle: 1 }]);
      race.step([{ ...neutralPad(), throttle: 1 }]);
      expect(k.boostTime).toBeGreaterThan(1);
      expect(k.speed).toBeGreaterThan(k.params.topSpeed + kick - 2);
    }
  });
});
