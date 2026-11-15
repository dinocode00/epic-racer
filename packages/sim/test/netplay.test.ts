import { describe, expect, it } from 'vitest';
import { type PadState, VEHICLES, neutralPad } from '@epic/shared';
import {
  DROPPED_SKILL,
  FARM_TRACK,
  MIDDLE_EARTH,
  Netplay,
  Race,
  SHIRE,
  decodeData,
  encodeData,
} from '../src/index.ts';
import type { TrackDef } from '@epic/shared';

/** 4 AI racers at the front, then 4 players: two on laptop A, two on laptop B. */
const entrants = Array.from({ length: 8 }, (_, i) => ({
  vehicle: VEHICLES[(i * 3) % VEHICLES.length]!,
  human: i >= 4,
}));
const KART_OF = [4, 5, 6, 7];
const ON_A = [true, true, false, false];

/** A busy, made-up player: weaves, drifts, fires items, sometimes brakes. Same on every run. */
function inputAt(h: number, f: number): PadState {
  let s = (h + 1) * 2654435761 + Math.floor(f / 9) * 40503;
  const r = () => ((s = (s * 16807 + 11) % 2147483647), s / 2147483647);
  const p = neutralPad();
  p.steer = Math.round((r() - 0.5) * 2 * 127) / 127;
  p.throttle = r() < 0.92 ? 1 : 0;
  p.brake = p.throttle ? 0 : 1;
  p.drift = r() < 0.3;
  p.item = f % 97 < 3 + h;
  p.lookBack = r() < 0.05;
  return p;
}

function reference(def: TrackDef, frames: number, auto?: (h: number, f: number) => boolean) {
  const race = new Race(def, entrants, 3, 1);
  for (let f = 0; f < frames; f++) {
    const pads: (PadState | undefined)[] = [];
    KART_OF.forEach((k, h) => {
      pads[k] = auto?.(h, f) ? { ...neutralPad(), auto: DROPPED_SKILL } : inputAt(h, f);
    });
    race.step(pads);
  }
  return race.hash();
}

interface Msg {
  due: number;
  h: number;
  f: number;
  pad: PadState;
}

/**
 * Two laptops stepping in turn with messages delayed `delay` ticks (plus random jitter), the
 * way Wi-Fi would. Returns both netplays once both have run and confirmed `frames` steps.
 */
function twoLaptops(
  def: TrackDef,
  frames: number,
  delay: number,
  jitter: number,
  hooks: { tick?: (t: number, a: Netplay, b: Netplay, toA: Msg[], toB: Msg[]) => void } = {},
) {
  const a = new Netplay(new Race(def, entrants, 3, 1), KART_OF, ON_A);
  const b = new Netplay(
    new Race(def, entrants, 3, 1),
    KART_OF,
    ON_A.map((x) => !x),
  );
  const toA: Msg[] = [],
    toB: Msg[] = [];
  let seed = 99;
  const rnd = () => ((seed = (seed * 16807) % 2147483647), seed / 2147483647);
  let lastDueA = 0,
    lastDueB = 0;
  for (let t = 0; t < frames * 3; t++) {
    for (const [np, out, mine] of [
      [a, toB, ON_A],
      [b, toA, ON_A.map((x) => !x)],
    ] as const) {
      if (np.frame >= frames || !np.canAdvance()) {
        if (np.frame < frames) np.stats.stalls++;
        continue;
      }
      const f = np.frame;
      mine.forEach((m, h) => m && np.setLocal(h, inputAt(h, f)));
      np.advance();
      // In order, like a TCP link: never earlier than the message before.
      const base = t + delay + Math.floor(rnd() * (jitter + 1));
      const due =
        out === toB ? (lastDueB = Math.max(lastDueB, base)) : (lastDueA = Math.max(lastDueA, base));
      mine.forEach((m, h) => m && out.push({ due, h, f, pad: inputAt(h, f) }));
    }
    hooks.tick?.(t, a, b, toA, toB);
    for (const [np, box] of [
      [a, toA],
      [b, toB],
    ] as const) {
      while (box.length && box[0]!.due <= t) {
        const m = box.shift()!;
        np.receive(m.h, m.f, m.pad);
      }
    }
    if (
      a.frame >= frames &&
      b.frame >= frames &&
      a.confirmed >= frames - 1 &&
      b.confirmed >= frames - 1
    )
      break;
  }
  return { a, b };
}

const hashAt = (np: Netplay, f: number) => np.race.hash(np.stateAt(f)!);

describe('save and load', () => {
  it('a race loaded back runs on exactly as before', () => {
    const race = new Race(SHIRE, entrants, 3, 1);
    const step = (f: number) => {
      const pads: PadState[] = [];
      KART_OF.forEach((k, h) => (pads[k] = inputAt(h, f)));
      race.step(pads);
    };
    for (let f = 0; f < 600; f++) step(f);
    const saved = race.save();
    const h0 = race.hash();
    for (let f = 600; f < 1200; f++) step(f);
    const h1 = race.hash();
    race.load(saved);
    expect(race.hash()).toBe(h0);
    for (let f = 600; f < 1200; f++) step(f);
    expect(race.hash()).toBe(h1);
  });

  it('a copy sent over the wire comes back bit for bit (NaN, -0 and all)', () => {
    const race = new Race(MIDDLE_EARTH, entrants, 3, 1);
    for (let f = 0; f < 400; f++) race.step([]);
    const s = race.save();
    const back = decodeData<typeof s>(encodeData(s));
    expect(race.hash(back)).toBe(race.hash(s));
    expect(back.firstThrottle.some(Number.isNaN)).toBe(true);
  });
});

describe('8-Player Local netplay', () => {
  for (const [name, def] of [
    ['Shire', SHIRE],
    ['Middle-earth', MIDDLE_EARTH],
    ['Farm', FARM_TRACK],
  ] as const) {
    it(`two laptops over laggy Wi-Fi end up exactly where perfect lockstep does (${name})`, () => {
      const F = 1500;
      const { a, b } = twoLaptops(def, F, 4, 3);
      const want = reference(def, F);
      expect(hashAt(a, F)).toBe(want);
      expect(hashAt(b, F)).toBe(want);
      // It really did have to put guesses right, and never waited long.
      expect(a.stats.rollbacks).toBeGreaterThan(50);
      expect(b.stats.rollbacks).toBeGreaterThan(50);
      expect(a.stats.deepest).toBeLessThanOrEqual(a.maxPredict);
    });
  }

  it('over a cable (no delay at all) nothing ever needs rewinding far', () => {
    const { a, b } = twoLaptops(SHIRE, 900, 1, 0);
    expect(hashAt(a, 900)).toBe(reference(SHIRE, 900));
    expect(hashAt(b, 900)).toBe(hashAt(a, 900));
    expect(a.stats.deepest).toBeLessThanOrEqual(3);
  });

  it('a laptop that drops out hands its karts to the autopilot on the same step everywhere', () => {
    const F = 1200,
      DROP = 500;
    let last = -1;
    const { a } = twoLaptops(SHIRE, F, 3, 2, {
      tick: (_t, a, b, toA) => {
        if (last >= 0) return;
        if (b.frame > DROP) {
          // Laptop B goes: drop what it hasn't sent; A hears it left after B's last input.
          last = DROP;
          for (let i = toA.length - 1; i >= 0; i--) if (toA[i]!.f > DROP) toA.splice(i, 1);
          b.frame = Infinity; // B stops
          for (const h of [2, 3]) a.endInput(h, DROP);
        }
      },
    });
    const want = reference(SHIRE, F, (h, f) => h >= 2 && f > DROP);
    expect(hashAt(a, F)).toBe(want);
  });

  it('a laptop that somehow went wrong is put right from a copy', () => {
    const F = 900;
    let broke = false,
      fixed = false;
    const { a, b } = twoLaptops(SHIRE, F, 2, 1, {
      tick: (_t, a, b) => {
        if (!broke && b.frame === 300) {
          // Laptop B goes wrong for good (live, and in every step it could rewind to).
          for (let f = b.confirmed + 1; f < b.frame; f++) b.stateAt(f)!.karts[6]!.speed += 3;
          b.race.karts[6]!.speed += 3;
          broke = true;
        }
        if (broke && !fixed && b.frame > 330 && a.confirmed > 320) {
          const f = a.confirmed + 1;
          const copy = decodeData<NonNullable<ReturnType<Netplay['stateAt']>>>(
            encodeData(a.stateAt(f)!),
          );
          expect(b.race.hash(b.stateAt(f)!)).not.toBe(a.race.hash(copy));
          expect(b.repair(f, copy)).toBe(true);
          fixed = true;
        }
      },
    });
    expect(fixed).toBe(true);
    const want = reference(SHIRE, F);
    expect(hashAt(a, F)).toBe(want);
    expect(hashAt(b, F)).toBe(want);
  });
});
