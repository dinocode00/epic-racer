import { describe, expect, it } from 'vitest';
import { VEHICLES } from '@epic/shared';
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
