import { describe, expect, it } from 'vitest';
import { VEHICLES } from '@epic/shared';
import { AI_LEVELS, PROVING, Race } from '../src/index.ts';

/** One AI kart round the proving ground at a given difficulty: its finishing time. */
function lapTime(level: number): number {
  const race = new Race(PROVING, [{ vehicle: VEHICLES[0]!, human: false }], 2, level);
  let steps = 0;
  while (!race.karts[0]!.finished && steps < 60 * 400) {
    race.step([undefined]);
    steps++;
  }
  return race.karts[0]!.finishTime;
}

describe('AI difficulty', () => {
  it('has four levels, and each is quicker than the one below', () => {
    expect(AI_LEVELS.length).toBe(4);
    const t = AI_LEVELS.map((_, i) => lapTime(i));
    for (const x of t) expect(Number.isFinite(x)).toBe(true);
    for (let i = 1; i < t.length; i++) expect(t[i]!).toBeLessThan(t[i - 1]!);
  });
});
