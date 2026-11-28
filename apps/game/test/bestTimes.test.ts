import { describe, expect, it } from 'vitest';
import { addTimes, bestTimesKey, mergeBestTimes } from '@epic/shared';

const run = (name: string, time: number, at = 1) => ({ name, vehicle: 'Pod Racer', time, at });

describe('best times board', () => {
  it('keeps the 5 fastest, quickest first', () => {
    const list = addTimes(
      [],
      [run('a', 90), run('b', 80), run('c', 100), run('d', 85), run('e', 95), run('f', 70)],
    );
    expect(list.map((t) => t.name)).toEqual(['f', 'b', 'd', 'a', 'e']);
  });

  it("merges two boards without counting the same run twice, and drops what isn't a time", () => {
    const k = bestTimesKey('farm', 3);
    const a = { [k]: [run('Rex', 92.3, 5)] };
    const b = { [k]: [run('Rex', 92.3, 5), run('Rose', 99, 6), { name: 'x', time: 'fast' }] };
    const m = mergeBestTimes(a, b);
    expect(m[k]!.map((t) => t.name)).toEqual(['Rex', 'Rose']);
    expect(mergeBestTimes({}, { 'bad key!': [run('a', 1)] })).toEqual({});
    expect(mergeBestTimes({}, 'junk')).toEqual({});
  });
});
