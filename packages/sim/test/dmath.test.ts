import { describe, expect, it } from 'vitest';
import { M } from '../src/dmath.ts';

/** Distance in units in the last place between two doubles. */
function ulps(a: number, b: number): number {
  if (a === b) return 0;
  const v = new DataView(new ArrayBuffer(16));
  v.setFloat64(0, a);
  v.setFloat64(8, b);
  const ia = v.getBigInt64(0),
    ib = v.getBigInt64(8);
  const ord = (i: bigint) => (i < 0n ? -(i & 0x7fffffffffffffffn) : i);
  const d = ord(ia) - ord(ib);
  return Number(d < 0n ? -d : d);
}

describe('deterministic maths', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647), seed / 2147483647);
  const sample = (scale: number) => Array.from({ length: 20000 }, () => (rnd() - 0.5) * 2 * scale);

  it('sin, cos and tan match Math to within an ulp or two', () => {
    for (const scale of [1e-6, 0.5, 3, 50, 2000, 1e5]) {
      for (const x of sample(scale)) {
        expect(ulps(M.sin(x), Math.sin(x))).toBeLessThanOrEqual(1);
        expect(ulps(M.cos(x), Math.cos(x))).toBeLessThanOrEqual(1);
        if (Math.abs(Math.cos(x)) > 1e-3)
          expect(Math.abs(M.tan(x) / Math.tan(x) - 1)).toBeLessThan(1e-14);
      }
    }
    expect(M.sin(0)).toBe(0);
    expect(M.cos(0)).toBe(1);
    expect(Object.is(M.sin(-0), -0)).toBe(true);
  });

  it('atan, atan2 and acos match Math closely', () => {
    for (const scale of [1e-6, 0.5, 2, 30, 1e6]) {
      const xs = sample(scale),
        ys = sample(scale);
      xs.forEach((x, i) => {
        expect(ulps(M.atan(x), Math.atan(x))).toBeLessThanOrEqual(1);
        expect(Math.abs(M.atan2(ys[i]!, x) - Math.atan2(ys[i]!, x))).toBeLessThan(1e-15);
      });
    }
    for (const x of sample(1)) expect(Math.abs(M.acos(x) - Math.acos(x))).toBeLessThan(1e-14);
    expect(M.atan2(0, -1)).toBe(Math.PI);
    expect(M.atan2(-0, -1)).toBe(-Math.PI);
    expect(M.atan2(1, 0)).toBe(Math.PI / 2);
    expect(M.acos(1)).toBe(0);
    expect(M.acos(-1)).toBe(Math.PI);
  });

  it('exp and hypot match Math closely', () => {
    for (const scale of [1e-9, 0.3, 5, 300]) {
      for (const x of sample(scale)) expect(ulps(M.exp(x), Math.exp(x))).toBeLessThanOrEqual(1);
    }
    for (const x of sample(100)) {
      expect(Math.abs(M.hypot(x, x * 0.3, 2) / Math.hypot(x, x * 0.3, 2) - 1)).toBeLessThan(1e-15);
      expect(M.hypot(3, 4)).toBe(5);
    }
  });
});
