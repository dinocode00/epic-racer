import { describe, expect, it } from 'vitest';
import { VEHICLES, neutralPad } from '@epic/shared';
import { MIDDLE_EARTH, Race, Track } from '../src/index.ts';

describe('Middle-earth', () => {
  const t = new Track(MIDDLE_EARTH);

  it('never runs into itself (separate sections stay apart unless stacked vertically)', () => {
    const clashes: string[] = [];
    for (let i = 0; i < t.count; i += 3) {
      for (let j = i + 60; j < t.count; j += 3) {
        if (t.count - j + i < 60) continue; // neighbours across the start line
        const a = t.frame(i).pos,
          b = t.frame(j).pos;
        const flat = Math.hypot(a.x - b.x, a.z - b.z);
        const minGap = (t.frame(i).width + t.frame(j).width) / 2 + 6;
        if (flat < minGap && Math.abs(a.y - b.y) < 8)
          clashes.push(
            `${(i * t.spacing).toFixed(0)}~${(j * t.spacing).toFixed(0)} (${flat.toFixed(1)} m)`,
          );
      }
    }
    expect(clashes.slice(0, 10)).toEqual([]);
  });

  it('has every region, landmark and set piece', () => {
    expect(MIDDLE_EARTH.regions!.map((r) => r[0])).toEqual([
      'hobbiton',
      'weathertop',
      'rivendell',
      'moria',
      'lothlorien',
      'argonath',
      'rohan',
      'pelennor',
      'osgiliath',
      'mordor',
      'deadMarshes',
      'hobbiton', // back on the party field for the grid
    ]);
    for (const k of [
      'balrogWhip',
      'oliphaunt',
      'eyeBeam',
      'gandalfCart',
      'tentacle',
      'pillar',
      'mallorn',
      'gateLeft',
      'firework',
    ]) {
      expect(MIDDLE_EARTH.hazards!.some((h) => h.kind === k)).toBe(true);
    }
    expect(MIDDLE_EARTH.gaps!.length).toBeGreaterThanOrEqual(8);
  });

  it('the eagles watch over both bridges you can fall off', () => {
    const m = MIDDLE_EARTH.marks!;
    const bridges = MIDDLE_EARTH.eagleBridges!;
    expect(bridges.length).toBe(2);
    expect(bridges[0]![0]).toBeCloseTo(m.rivendellBridge!, 0);
    expect(bridges[1]![0]).toBeCloseTo(m.khazadDum!, 0);
    // The broken middle of Khazad-dum lies inside its bridge: fall short there and you're
    // carried across too.
    const khazadGap = MIDDLE_EARTH.gaps!.find(([g0]) => g0 > m.khazadDum! && g0 < m.moriaExit!)!;
    expect(khazadGap[0]).toBeGreaterThan(bridges[1]![0]);
    expect(khazadGap[1]).toBeLessThan(bridges[1]![1]);
  });

  it('has boost pads and big-air kicker ramps all round, clear of jumps and hazards', () => {
    const L = t.length;
    const pads = MIDDLE_EARTH.pads!;
    expect(pads.length).toBeGreaterThanOrEqual(12);
    expect(pads.filter((p) => p.super).length).toBeGreaterThanOrEqual(2);
    const inside = (s: number, ranges: [number, number][] = [], pad = 0) =>
      ranges.some(([a, b]) => s >= a - pad && s <= b + pad);
    for (const p of pads) {
      // On solid, walled road: never over a gap or on an open edge.
      expect(inside(p.s, MIDDLE_EARTH.gaps, 5)).toBe(false);
      expect(inside(p.s, MIDDLE_EARTH.open, 5)).toBe(false);
      expect(Math.abs(p.lat) + p.width / 2).toBeLessThan(t.frameAtS(p.s).width / 2);
    }
    // Pads spread round the lap, not bunched in one land.
    const lands = new Set(
      pads.map((p) => MIDDLE_EARTH.regions!.filter(([, s0]) => s0 <= p.s).pop()![0]),
    );
    expect(lands.size).toBeGreaterThanOrEqual(8);

    const ramps = MIDDLE_EARTH.kickers!.filter((k) => k.ramp);
    expect(ramps.length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...ramps.map((k) => k.pop))).toBeGreaterThanOrEqual(20);
    for (const k of ramps) {
      // A long landing run after each: no gap, no open edge, no tunnel, no hazard, no items.
      const ahead = (s: number) => (s - k.s + L) % L;
      const run = 110 + (k.pop - 14) * 10;
      for (const [a, b] of [
        ...(MIDDLE_EARTH.gaps ?? []),
        ...(MIDDLE_EARTH.open ?? []),
        ...(MIDDLE_EARTH.tunnels ?? []),
      ])
        expect(ahead(a) > run || ahead(b) > L - 5).toBe(true);
      for (const h of MIDDLE_EARTH.hazards!) expect(ahead(h.s)).toBeGreaterThan(run);
      for (const r of MIDDLE_EARTH.itemRows!) expect(ahead(r)).toBeGreaterThan(run);
    }
  });

  it('off the prow at any speed, you land on the straight run-out with road to spare', () => {
    const m = MIDDLE_EARTH.marks!;
    for (const speed of [30, 41, 53, 61])
      for (const steer of [0, 0.6, -0.6]) {
        const race = new Race(MIDDLE_EARTH, [{ vehicle: VEHICLES[1]!, human: true }], 1);
        for (let i = 0; i < 300; i++) race.step([neutralPad()]); // the countdown
        const k = race.karts[0]!,
          tr = race.track;
        const s = m.prow! - 10,
          f = tr.frameAtS(s);
        k.pos = tr.pointAt(s, 0, k.params.rideHeight);
        k.hint = tr.nearestIndex(k.pos);
        k.s = k.progress = k.safeS = s;
        k.fwd = { ...f.tan };
        k.speed = speed;
        if (speed > 45) k.boostTime = 3; // off a boost pad
        let flew = false,
          landed = -1;
        for (let i = 0; i < 60 * 8 && landed < 0; i++) {
          race.step([{ ...neutralPad(), throttle: 1, steer: k.air ? steer : 0 }]);
          expect(k.rescueTime).toBe(0);
          if (k.air) flew = true;
          else if (flew) landed = k.s;
        }
        const gap = MIDDLE_EARTH.gaps!.find(([g0]) => g0 > m.prow!)!;
        expect(landed).toBeGreaterThan(gap[1]);
        // At least 120 m of straight road still ahead before Osgiliath's (wide) bend.
        expect(m.osgiliath! - landed).toBeGreaterThan(120);
      }
  });

  it('every jump onto solid ground lands, however slow, fast or wild the take-off', () => {
    const sure = MIDDLE_EARTH.sureGaps!;
    expect(sure.length).toBe(7); // Bag End, Weathertop, the mallorn, Rohan's three, the prow
    for (const gap of sure)
      for (const speed of [8, 25, 45, 75])
        for (const steer of [-1, 0, 1]) {
          const race = new Race(MIDDLE_EARTH, [{ vehicle: VEHICLES[2]!, human: true }], 1);
          for (let i = 0; i < 300; i++) race.step([neutralPad()]);
          const k = race.karts[0]!,
            tr = race.track;
          const s = gap[0] - 1,
            f = tr.frameAtS(s);
          k.pos = tr.pointAt(s, 3, k.params.rideHeight);
          k.hint = tr.nearestIndex(k.pos);
          k.s = k.progress = k.safeS = s;
          k.lat = 3;
          k.fwd = { ...f.tan };
          k.speed = speed;
          let flew = false,
            landed = -1;
          for (let i = 0; i < 60 * 10 && landed < 0; i++) {
            race.step([{ ...neutralPad(), throttle: 1, steer: k.air ? steer : 0 }]);
            expect(k.rescueTime).toBe(0);
            if (k.air) flew = true;
            else if (flew) landed = k.s;
          }
          expect(landed).toBeGreaterThan(gap[1]);
          // Down on the road (not sunk into it), and driving on.
          const fr = tr.frameAtS(k.s);
          const h =
            (k.pos.x - fr.pos.x) * fr.up.x +
            (k.pos.y - fr.pos.y) * fr.up.y +
            (k.pos.z - fr.pos.z) * fr.up.z;
          expect(h).toBeGreaterThan(-0.05);
          for (let i = 0; i < 60; i++) race.step([{ ...neutralPad(), throttle: 1 }]);
          // (Unless a hazard just beyond, like Rohan's riders, has spun it out.)
          if (k.stunTime <= 0) expect(k.speed).toBeGreaterThan(15);
        }
  });

  it('eight AI karts finish two laps', () => {
    const entrants = Array.from({ length: 8 }, (_, i) => ({
      vehicle: VEHICLES[i % VEHICLES.length]!,
      human: false,
    }));
    const race = new Race(MIDDLE_EARTH, entrants);
    const rescues = new Array(8).fill(0);
    while (race.phase !== 'finished' && race.time < 900) {
      race.step([]);
      race.karts.forEach((k, i) => {
        if (k.rescueTime > 1.78) rescues[i]++;
      });
    }
    console.log(
      'lap length',
      race.track.length.toFixed(0),
      'times',
      race.karts.map((k) => k.finishTime.toFixed(0)).join(' '),
      'rescues',
      rescues.join(' '),
    );
    expect(race.phase).toBe('finished');
  });
});
