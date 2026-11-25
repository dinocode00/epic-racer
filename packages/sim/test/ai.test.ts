import { describe, expect, it } from 'vitest';
import { VEHICLES } from '@epic/shared';
import { AI_KIDS, AI_LEVELS, AI_NORMAL, AI_STYLES, PROVING, Race } from '../src/index.ts';

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
  it('has five levels, Kids first, and each is quicker than the one below', () => {
    expect(AI_LEVELS).toEqual(['Kids', 'Easy', 'Normal', 'Hard', 'Expert']);
    expect(AI_LEVELS[AI_NORMAL]).toBe('Normal');
    const t = AI_LEVELS.map((_, i) => lapTime(i));
    for (const x of t) expect(Number.isFinite(x)).toBe(true);
    for (let i = 1; i < t.length; i++) expect(t[i]!).toBeLessThan(t[i - 1]!);
  });
});

describe('Kids level', () => {
  it('is far slower than Easy, bumps into the walls, and never carries an attack item', () => {
    const kids = lapTime(AI_KIDS);
    expect(kids).toBeGreaterThan(lapTime(AI_KIDS + 1) * 1.25);
    const race = new Race(
      PROVING,
      Array.from({ length: 7 }, (_, i) => ({
        vehicle: VEHICLES[i % VEHICLES.length]!,
        human: false,
      })),
      2,
      AI_KIDS,
    );
    let bumps = 0;
    const items = new Set<string>();
    const was = race.karts.map(() => 0);
    for (let n = 0; n < 60 * 120; n++) {
      race.step([]);
      race.karts.forEach((k, i) => {
        if (k.bump > 0.3 && was[i]! <= 0.3) bumps++;
        was[i] = k.bump;
        if (k.item) items.add(k.item);
      });
    }
    expect(bumps).toBeGreaterThan(10);
    for (const it of items) expect(['boost', 'shield']).toContain(it);
  });

  it('waits for the players when it gets far ahead', () => {
    const race = new Race(
      PROVING,
      [
        { vehicle: VEHICLES[0]!, human: false },
        { vehicle: VEHICLES[1]!, human: true },
      ],
      3,
      AI_KIDS,
    );
    // The player never moves: the AI soon dawdles, a little way up the road.
    for (let n = 0; n < 60 * 60; n++) race.step([undefined, undefined]);
    const gap = race.karts[0]!.progress - race.karts[1]!.progress;
    expect(gap).toBeLessThan(400);
  });
});

describe('AI driving styles', () => {
  const field = () =>
    new Race(
      PROVING,
      Array.from({ length: 7 }, (_, i) => ({
        vehicle: VEHICLES[i % VEHICLES.length]!,
        human: false,
      })),
      2,
      AI_NORMAL,
    );

  it('deals every AI racer in a full grid a different style', () => {
    const names = field().brains.map((b) => b!.style.name);
    expect(new Set(names).size).toBe(7);
    for (const n of names) expect(AI_STYLES.map((s) => s.name)).toContain(n);
  });

  it('spreads a field of AI out instead of finishing in a pack', () => {
    const race = field();
    let steps = 0;
    while (!race.karts.every((k) => k.finished) && steps < 60 * 600) {
      race.step([]);
      steps++;
    }
    const t = race.karts.map((k) => k.finishTime).sort((a, b) => a - b);
    expect(t.every(Number.isFinite)).toBe(true);
    expect(t[t.length - 1]! - t[0]!).toBeGreaterThan(2);
  });

  it('never spins its wheels on the countdown and gets no start penalty unless it revs early', () => {
    const race = field();
    for (let i = 0; i < 60 * 3.2; i++) race.step([]);
    const styles = race.brains.map((b) => b!);
    race.karts.forEach((k, i) => {
      if (styles[i]!.start !== 'early') expect(k.stunTime).toBe(0);
    });
  });
});
