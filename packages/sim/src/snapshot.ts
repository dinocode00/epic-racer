/**
 * Copying, fingerprinting and sending the race's state: what lets two laptops racing the same
 * race (8-Player Local) rewind a few steps when they learn a remote input late, check every
 * half second that they still agree, and repair one from the other if they ever don't.
 *
 * Race state is plain data (numbers, booleans, strings, null, arrays and plain objects), apart
 * from a few references to things that never change during a race (a kart's vehicle, a hazard's
 * definition). Those are left out of a copy and kept as they are when one is loaded back.
 */

/** Keys that hold unchanging definitions, never copied (they stay on the live objects). */
const SHARED = new Set(['vehicle', 'def']);

/** Deep copy of plain race data, without the shared definitions. */
export function cloneData<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = cloneData(v[i]);
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const k in v) if (!SHARED.has(k)) out[k] = cloneData((v as Record<string, unknown>)[k]);
  return out as T;
}

/** Copy `src` onto the live object `dst` in place (so references to `dst` stay good). */
export function assignData(dst: object, src: object): void {
  const d = dst as Record<string, unknown>;
  for (const k in src) d[k] = cloneData((src as Record<string, unknown>)[k]);
}

/** Replace a live array's contents in place. */
export function refill<T>(dst: T[], src: T[]): void {
  dst.length = 0;
  for (const x of src) dst.push(cloneData(x));
}

const fp = new DataView(new ArrayBuffer(8));
/**
 * A 32-bit fingerprint of plain data, exact to the last bit of every number. Keys are visited
 * in sorted order, so two copies built in a different order still agree.
 */
export function hashData(v: unknown): number {
  let h = 0x811c9dc5;
  const mix = (x: number) => {
    h = Math.imul(h ^ x, 0x01000193) >>> 0;
  };
  const walk = (x: unknown): void => {
    if (x === null || x === undefined) return mix(0x9e);
    switch (typeof x) {
      case 'number':
        fp.setFloat64(0, x);
        mix(fp.getUint32(0));
        return mix(fp.getUint32(4));
      case 'boolean':
        return mix(x ? 0x71 : 0x70);
      case 'string':
        mix(0x5a);
        for (let i = 0; i < x.length; i++) mix(x.charCodeAt(i));
        return;
      case 'object':
        if (Array.isArray(x)) {
          mix(0xa0 + (x.length & 0xff));
          for (const e of x) walk(e);
          return;
        }
        for (const k of Object.keys(x).sort()) {
          if (SHARED.has(k)) continue;
          const e = (x as Record<string, unknown>)[k];
          if (e === undefined) continue;
          walk(k);
          walk(e);
        }
        return;
    }
  };
  walk(v);
  return h;
}

/** JSON that keeps NaN, ±Infinity and -0 (plain JSON turns them into null and 0). */
export function encodeData(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) => {
    if (typeof x !== 'number') return x;
    if (Number.isNaN(x)) return { $n: 'NaN' };
    if (x === Infinity) return { $n: 'Inf' };
    if (x === -Infinity) return { $n: '-Inf' };
    if (Object.is(x, -0)) return { $n: '-0' };
    return x;
  });
}

export function decodeData<T>(s: string): T {
  return JSON.parse(s, (_k, x: unknown) => {
    if (x && typeof x === 'object' && '$n' in x) {
      const n = (x as { $n: string }).$n;
      return n === 'NaN' ? NaN : n === 'Inf' ? Infinity : n === '-Inf' ? -Infinity : -0;
    }
    return x;
  }) as T;
}
