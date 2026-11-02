import { describe, expect, it } from 'vitest';
import { VEHICLES } from '@epic/shared';
import { FARM_PIECES, FARM_TRACK, Race } from '../src/index.ts';

describe("Grandpa's Farm", () => {
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
    expect(FARM_TRACK.gaps!.length).toBe(2); // the drop off the house and the wagon jump
    expect(FARM_TRACK.tunnels!.length).toBe(1);
    expect(FARM_TRACK.hazards!.filter((h) => h.kind === 'trunk').length).toBeGreaterThan(50);
    expect(FARM_TRACK.boostPads!.length).toBeGreaterThan(10);
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
