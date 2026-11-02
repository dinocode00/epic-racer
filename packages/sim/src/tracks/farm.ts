import type { HazardDef, TrackDef, TrackPoint, V3 } from '@epic/shared';
import { Track } from '../track.ts';
import DRAFT from './farmDraft.json';

/**
 * Grandpa's Farm: the owner's route round the grandparents' farm (docs/farm), laid out at 1:10
 * so the karts are RC-car sized among the buildings and trees. The centre line comes from the
 * approved draft (tools/farm-blueprint/racetrack.py, real metres); here it is scaled into game
 * metres, the loop-de-loops are put in as real loops, and the jumps, boost pads, item boxes
 * and the Christmas tree trunks standing in the forest road are placed along it.
 *
 * Game coordinates match the farm scene: x = (map x - 50) * 10, z = -(map y - 100) * 10, and
 * y is height (the ground plus the road's height above it, times 10).
 */

/** [x, y, h, width, kind, section, ground, s] in real metres along the draft. */
type DraftPoint = [number, number, number, number, string, string, number, number];
interface DraftFeature {
  kind: string;
  label: string;
  s: number;
  x: number;
  y: number;
  h: number;
}
const D = DRAFT as unknown as {
  pts: DraftPoint[];
  features: DraftFeature[];
  trunks: [number, number][];
  sections: { id: string; name: string; s: number }[];
};

const S = 10;
const game = (x: number, y: number, h: number): V3 => [(x - 50) * S, h * S, -(y - 100) * S];

/** Kinds of road, as stretches of the lap: walled road, wide, tube, barn, air (a gap). */
export type FarmPieceKind = 'road' | 'wide' | 'tube' | 'barn' | 'air';
export interface FarmPiece {
  kind: FarmPieceKind;
  s0: number;
  s1: number;
}

const LOOP_R = 26;
const LOOP_SHIFT = 22;
const STEP = 4; // game metres between centre-line points

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addS = (a: V, b: V, k: number): V => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V): V => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

interface Pt {
  p: V;
  up: V;
  w: number;
  kind: string;
  /** Where along the draft this point is (real metres), for placing features. */
  ds: number;
  loop: boolean;
}

function centreLine(): Pt[] {
  // The draft in game metres (ground-level road a few centimetres up, clear of the lawn).
  const src = D.pts.map((q) => ({
    p: game(q[0], q[1], q[6] + Math.max(q[2], 0.06)) as V,
    w: q[3] * S,
    kind: q[4],
    ds: q[7],
  }));
  // Even spacing.
  const even: typeof src = [];
  for (let i = 0; i < src.length; i++) {
    const a = src[i]!,
      b = src[(i + 1) % src.length]!;
    const n = Math.max(1, Math.round(len(sub(b.p, a.p)) / STEP));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      even.push({
        p: addS(a.p, sub(b.p, a.p), t),
        w: a.w + (b.w - a.w) * t,
        kind: t < 0.5 ? a.kind : b.kind,
        ds: i + 1 < src.length ? a.ds + (b.ds - a.ds) * t : a.ds,
      });
    }
  }
  // Iron out kinks where the draft's curves meet (a few passes of a 1-2-1 blur).
  for (let pass = 0; pass < 4; pass++) {
    const prev = even.map((q) => q.p);
    const m = even.length;
    for (let i = 0; i < m; i++) {
      const a = prev[(i - 1 + m) % m]!,
        b = prev[i]!,
        c = prev[(i + 1) % m]!;
      even[i]!.p = [
        (a[0] + 2 * b[0] + c[0]) / 4,
        (a[1] + 2 * b[1] + c[1]) / 4,
        (a[2] + 2 * b[2] + c[2]) / 4,
      ];
    }
  }
  const loopsAt = D.features.filter((f) => f.kind === 'loop').map((f) => f.s);
  const out: Pt[] = [];
  // Each loop comes out to one side of where it went in; the road carries on from there (so it
  // never runs back alongside the loop's own entry) and drifts back to the draft's line only
  // well after the loop. Loops in a row all step the same way (to the left), so each one stands
  // clear of the one before.
  let off: V = [0, 0, 0],
    from: V = [0, 0, 0],
    hold = 0,
    ease = 0,
    dir = -1;
  const HOLD = 90,
    EASE = 220;
  for (let i = 0; i < even.length; i++) {
    const q = even[i]!;
    const t = norm(
      sub(even[(i + 1) % even.length]!.p, even[(i - 1 + even.length) % even.length]!.p),
    );
    if (hold > 0) {
      hold -= STEP;
      if (hold <= 0) {
        from = off;
        ease = EASE;
      }
    } else if (ease > 0) {
      ease = Math.max(0, ease - STEP);
      const k = ease / EASE;
      const e = k * k * (3 - 2 * k);
      off = [from[0] * e, from[1] * e, from[2] * e];
    }
    const p = addS(q.p, off, 1);
    const up0: V = [0, 1, 0];
    const up = norm(addS(up0, t, -dot(up0, t)));
    out.push({ p, up, w: q.w, kind: q.kind, ds: q.ds, loop: false });
    const next = even[i + 1];
    const loopHere = next && loopsAt.some((s) => q.ds <= s && next.ds > s);
    if (!loopHere) continue;
    // A full vertical loop: up and over, coming out to one side of where it went in.
    const r0 = norm(cross(t, up));
    const right: V = [r0[0] * dir, r0[1] * dir, r0[2] * dir];
    const N = Math.round((Math.PI * 2 * LOOP_R) / STEP);
    for (let j = 1; j < N; j++) {
      const u = j / N;
      const th = u * Math.PI * 2;
      const sh = u * u * (3 - 2 * u) * LOOP_SHIFT;
      const c = addS(addS(p, up, LOOP_R), right, sh);
      const pos = addS(
        addS(addS(p, t, Math.sin(th) * LOOP_R), up, LOOP_R * (1 - Math.cos(th))),
        right,
        sh,
      );
      out.push({ p: pos, up: norm(sub(c, pos)), w: q.w, kind: 'tube', ds: q.ds, loop: true });
    }
    off = addS(off, right, LOOP_SHIFT);
    hold = HOLD;
    ease = 0;
  }
  return out;
}

const PTS = centreLine();
const points: TrackPoint[] = PTS.map((q) => ({
  p: [q.p[0], q.p[1], q.p[2]],
  up: [q.up[0], q.up[1], q.up[2]],
  width: q.w,
}));
const base: TrackDef = { id: 'farm', name: "Grandpa's Farm", points, defaultWidth: 16, laps: 2 };
const track = new Track(base);
const L = track.length;

// Arc length of every centre-line point (walking along, so stacked loops don't confuse it).
const sOf: number[] = [];
{
  let hint = 0;
  for (const q of PTS) {
    const pr = track.project({ x: q.p[0], y: q.p[1], z: q.p[2] }, hint, 30);
    hint = pr.index;
    sOf.push(pr.s);
  }
  sOf[0] = 0;
}
/** Game arc length for a distance along the draft (real metres). */
function sForDraft(ds: number): number {
  let best = 0,
    bd = Infinity;
  for (let i = 0; i < PTS.length; i++) {
    if (PTS[i]!.loop) continue;
    const d = Math.abs(PTS[i]!.ds - ds);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return sOf[best]!;
}

// Stretches of each kind.
export const FARM_PIECES: FarmPiece[] = [];
for (let i = 0; i < PTS.length; i++) {
  const kind = PTS[i]!.kind as FarmPieceKind;
  const last = FARM_PIECES[FARM_PIECES.length - 1];
  const s = sOf[i]!;
  if (last && last.kind === kind) last.s1 = i + 1 < PTS.length ? sOf[i + 1]! : L;
  else {
    if (last) last.s1 = s;
    FARM_PIECES.push({ kind, s0: s, s1: i + 1 < PTS.length ? sOf[i + 1]! : L });
  }
}
const ranges = (k: FarmPieceKind): [number, number][] =>
  FARM_PIECES.filter((p) => p.kind === k).map((p) => [p.s0, p.s1]);

// Jumps and boosts.
const kickers: { s: number; pop: number }[] = [];
const boostPads: number[] = [];
for (const f of D.features) {
  const s = sForDraft(f.s);
  if (f.kind === 'pad' || f.kind === 'boost') boostPads.push(s);
  if (f.kind === 'jump') kickers.push({ s, pop: f.label.includes('rest') ? 9 : 10 });
  // The big ramp over the pumpkin wagon: it has to throw them clear of the gap that follows,
  // so it sits right at the gap's edge.
  if (f.kind === 'bigjump') {
    const g = FARM_PIECES.find((p) => p.kind === 'air' && p.s0 > s - 10);
    kickers.push({ s: (g ? g.s0 : s) - 6, pop: 32 });
  }
}

// The Christmas tree trunks in the forest road: solid.
const forest = D.sections.find((x) => x.id === 'forest')!;
const forestS = sForDraft(forest.s);
const hazards: HazardDef[] = D.trunks.map(([x, y]) => {
  const p = game(x, y, 0);
  let best = 0,
    bd = Infinity;
  for (let i = 0; i < track.count; i++) {
    const f = track.frames[i]!;
    const ds = (((i * track.spacing - forestS) % L) + L) % L;
    if (ds > 2200) continue;
    const d = (f.pos.x - p[0]) ** 2 + (f.pos.z - p[2]) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  const pr = track.project({ x: p[0], y: track.frames[best]!.pos.y, z: p[2] }, best, 30);
  return { kind: 'trunk', s: pr.s, lat: pr.lateral, r: 0.9, effect: 'bump' };
});

// Item boxes about every 900 m, never in the air.
const gaps = ranges('air');
const itemRows: number[] = [];
for (let s = 350; s < L - 200; s += 900) {
  let at = s;
  while (gaps.some(([a, b]) => at > a - 30 && at < b + 30)) at += 40;
  itemRows.push(at);
}

export const FARM_MARKS: Record<string, number> = Object.fromEntries(
  D.sections.map((x) => [x.id, x.id === 'start' ? 0 : sForDraft(x.s)]),
);

// Boost pads: narrow (you have to aim for them), set off to one side or the other in turn,
// and they kick hard.
const PAD_W = 4;
const pads = boostPads.map((s, i) => {
  const w = track.frameAtS(s).width;
  const side = [0, -1, 1, 1, -1, 0][i % 6]!;
  const tube = FARM_PIECES.some((p) => p.kind === 'tube' && s >= p.s0 && s < p.s1);
  // (In the tubes a pad spans the whole floor: the drop off the house needs the speed.)
  return { s, lat: tube ? 0 : side * Math.max(0, w * 0.27 - PAD_W / 2), width: tube ? w : PAD_W };
});

export const FARM_TRACK: TrackDef = {
  ...base,
  boostPads,
  pads,
  padBoost: { time: 1.7, kick: 10 },
  kickers,
  gaps,
  tunnels: ranges('barn'),
  hazards,
  itemRows,
  marks: FARM_MARKS,
};
