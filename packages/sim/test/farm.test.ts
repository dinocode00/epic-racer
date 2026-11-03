import { describe, expect, it } from 'vitest';
import { VEHICLES, neutralPad } from '@epic/shared';
import { FARM_PIECES, FARM_TRACK, Race, Track } from '../src/index.ts';

describe('The Drefahl Farm', () => {
  it('is a long lap with loops, a drop, the barn and trunks in the forest', () => {
    const race = new Race(FARM_TRACK, [{ vehicle: VEHICLES[0]!, human: false }]);
    const L = race.track.length;
    console.log(
      'farm lap',
      L.toFixed(0),
      'pieces',
      FARM_PIECES.map((p) => `${p.kind}:${p.s0.toFixed(0)}-${p.s1.toFixed(0)}`).join(' '),
    );
    expect(L).toBeGreaterThan(9000);
    expect(FARM_TRACK.laps).toBe(2);
    expect(FARM_TRACK.gaps!.length).toBe(4); // the drop off the house, two jumps over the trees, the wagon jump
    expect(FARM_TRACK.tunnels!.length).toBe(1);
    expect(FARM_TRACK.hazards!.filter((h) => h.kind === 'trunk').length).toBeGreaterThan(50);
    expect(FARM_TRACK.boostPads!.length).toBeGreaterThan(10);
    // Blue super pads, and grandpa (walking, and on the mower) in the way at times.
    expect(FARM_TRACK.pads!.filter((p) => p.super).length).toBe(3);
    for (const kind of ['grandpa', 'mower'])
      expect(FARM_TRACK.hazards!.some((h) => h.kind === kind && h.schedule)).toBe(true);
    // Loops: the road turns upside down somewhere.
    expect(race.track.frames.some((f) => f.up.y < -0.9)).toBe(true);
  });

  it('eight AI karts finish two laps', () => {
    const entrants = Array.from({ length: 8 }, (_, i) => ({
      vehicle: VEHICLES[i % VEHICLES.length]!,
      human: false,
    }));
    const race = new Race(FARM_TRACK, entrants);
    const rescues = new Array(8).fill(0);
    const where: number[] = [];
    while (race.phase !== 'finished' && race.time < 1500) {
      race.step([]);
      race.karts.forEach((k, i) => {
        if (k.rescueTime > 1.78) {
          rescues[i]++;
          where.push(Math.round(k.s));
        }
      });
    }
    console.log(
      'farm times',
      race.karts.map((k) => k.finishTime.toFixed(0)).join(' '),
      'rescues',
      rescues.join(' '),
      'at',
      where.slice(0, 30).join(' '),
    );
    expect(race.phase).toBe('finished');
  }, 60000);
});

describe('The Drefahl Farm road shape', () => {
  const t = new Track(FARM_TRACK);
  it('has no bend tighter than the road can take', () => {
    const tight: string[] = [];
    const K = 4;
    for (let i = 0; i < t.count; i++) {
      const a = t.frame(i - K),
        b = t.frame(i + K),
        f = t.frame(i);
      if (Math.hypot(a.tan.x, a.tan.z) < 0.7 || Math.hypot(b.tan.x, b.tan.z) < 0.7) continue; // loops
      const ang = Math.atan2(
        a.tan.x * b.tan.z - a.tan.z * b.tan.x,
        a.tan.x * b.tan.x + a.tan.z * b.tan.z,
      );
      const R = (2 * K * t.spacing) / Math.max(1e-6, Math.abs(ang));
      if (R < f.width / 2 + 6) tight.push(`${(i * t.spacing).toFixed(0)} R=${R.toFixed(0)}`);
    }
    expect(tight.slice(0, 10)).toEqual([]);
  });

  const isTube = (s: number) => FARM_PIECES.some((p) => p.kind === 'tube' && s >= p.s0 && s < p.s1);
  it('never runs into itself (separate stretches stay apart unless stacked)', () => {
    const clashes: string[] = [];
    for (let i = 0; i < t.count; i += 3)
      for (let j = i + 80; j < t.count; j += 3) {
        if (t.count - j + i < 80) continue;
        const a = t.frame(i).pos,
          b = t.frame(j).pos;
        const flat = Math.hypot(a.x - b.x, a.z - b.z);
        // Tubes are closed, so next to one the road only needs to clear it.
        // (Including the road into a loop beside the loop's own way out.)
        const tubes = isTube(i * t.spacing) || isTube(j * t.spacing);
        const minGap = (t.frame(i).width + t.frame(j).width) / 2 + (tubes ? 2 : 6);
        if (flat < minGap && Math.abs(a.y - b.y) < 8)
          clashes.push(
            `${(i * t.spacing).toFixed(0)}~${(j * t.spacing).toFixed(0)} (${flat.toFixed(1)})`,
          );
      }
    expect(clashes.slice(0, 10)).toEqual([]);
  });
});

describe('The Drefahl Farm, driven badly', () => {
  it('wobbly drivers bouncing off the walls still get round without glitches', () => {
    const N = 6;
    const race = new Race(
      FARM_TRACK,
      Array.from({ length: N }, (_, i) => ({ vehicle: VEHICLES[i % 4]!, human: true })),
      1,
    );
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const wobble = new Array(N).fill(0);
    const prev = race.karts.map((k) => ({ ...k.pos }));
    const jumps: string[] = [];
    let rescues = 0;
    while (race.time < 900 && race.phase !== 'finished') {
      const pads = race.karts.map((k, i) => {
        // Aim down the road like the AI does, with a heavy, wandering hand.
        const f = race.track.frameAtS(k.s + 18);
        const to = { x: f.pos.x - k.pos.x, y: f.pos.y - k.pos.y, z: f.pos.z - k.pos.z };
        const r = {
          x: k.fwd.y * k.up.z - k.fwd.z * k.up.y,
          y: k.fwd.z * k.up.x - k.fwd.x * k.up.z,
          z: k.fwd.x * k.up.y - k.fwd.y * k.up.x,
        };
        const angle = Math.atan2(
          to.x * r.x + to.y * r.y + to.z * r.z,
          to.x * k.fwd.x + to.y * k.fwd.y + to.z * k.fwd.z,
        );
        wobble[i] = Math.max(-1, Math.min(1, wobble[i] * 0.97 + (rnd() - 0.5) * 0.3));
        const p = neutralPad();
        p.throttle = 1;
        p.steer = Math.max(-1, Math.min(1, angle * 2.4 + wobble[i] * 1.2));
        p.drift = rnd() < 0.02;
        return p;
      });
      race.step(pads);
      race.karts.forEach((k, i) => {
        const d = Math.hypot(k.pos.x - prev[i]!.x, k.pos.y - prev[i]!.y, k.pos.z - prev[i]!.z);
        // (Touching down just past a jump settles the kart onto the road: that's not a glitch.)
        const landing = FARM_TRACK.gaps!.some(([, g1]) => k.s >= g1 - 2 && k.s < g1 + 20);
        if (k.rescueTime > 1.78 && k.rescueTime < 1.8) rescues++;
        else if (k.rescueTime <= 0 && !k.air && !landing && d > Math.abs(k.speed) / 60 + 2.5)
          jumps.push(`kart ${i} at ${k.s.toFixed(0)}: ${d.toFixed(1)} m`);
        prev[i] = { ...k.pos };
      });
    }
    expect(race.phase).toBe('finished');
    expect(jumps).toEqual([]);
    expect(rescues).toBeLessThanOrEqual(2);
  }, 60000);
});
