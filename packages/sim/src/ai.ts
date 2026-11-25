import { type PadState, neutralPad } from '@epic/shared';
import { type HazardState, sDelta } from './hazards.ts';
import type { KartState } from './kart.ts';
import type { Track } from './track.ts';
import { clamp, cross, dot, sub } from './vec.ts';

/**
 * How one AI racer drives: its line, how hard it pushes and when, how it takes the bends,
 * how often it slips up, and how it uses its items. Each AI in a race gets a different one,
 * so a full grid races like a field of different drivers, not eight copies of one.
 */
export interface AiStyle {
  name: string;
  /** Added to the pace it dares (a share of its top speed). */
  pace: number;
  /** Extra pace at the start of the race and at the end (fast starters fade, closers come on). */
  early: number;
  late: number;
  /**
   * Its line: 'wander' drifts across the road now and then; 'centre' holds the middle; 'inside'
   * cuts to the inside of each bend; 'outside' swings wide into bends; 'hunt' sits on the tail of
   * the kart ahead (for the slipstream and a bump).
   */
  line: 'wander' | 'centre' | 'inside' | 'outside' | 'hunt';
  /** Seconds between new lanes, shortest and longest. */
  laneEvery: [number, number];
  /** How much later (radians of bend, + later) it lifts and brakes for the bends. */
  corner: number;
  /** The sharpest bend (radians) it takes without drifting: low drifts everything. */
  drift: number;
  /** Steering: how hard it turns toward its line, and how much it wavers. */
  steer: number;
  wobble: number;
  /** How hard it pushes when it's behind (a share of the level's catch-up). */
  catchUp: number;
  /** Slips (a lift, a twitch of the wheel) a minute, before the level scales them. */
  slips: number;
  /** Items: 'quick' uses them at once, 'patient' saves boosts for the straights and waits for a
   *  sure shot, 'defensive' keeps a shield or a trap ready, 'aggressive' fires at the first chance. */
  items: 'quick' | 'patient' | 'defensive' | 'aggressive';
  /** Goes for the start boost on the countdown. */
  launch: boolean;
}

/** The styles the AI racers are dealt from, in this order round the grid (rotated per track). */
export const AI_STYLES: readonly AiStyle[] = [
  // Brakes late, cuts every corner, overcooks it now and then; uses items the moment it can.
  {
    name: 'Charger',
    pace: 0.03,
    early: 0.01,
    late: 0.02,
    line: 'inside',
    laneEvery: [1.5, 3],
    corner: 0.18,
    drift: 0.6,
    steer: 2.6,
    wobble: 0.01,
    catchUp: 1.3,
    slips: 1.6,
    items: 'aggressive',
    launch: true,
  },
  // Smooth and steady down the middle: few mistakes, never really pushes.
  {
    name: 'Cruiser',
    pace: -0.01,
    early: 0,
    late: 0,
    line: 'centre',
    laneEvery: [4, 7],
    corner: -0.12,
    drift: 0.95,
    steer: 1.8,
    wobble: 0,
    catchUp: 0.6,
    slips: 0.3,
    items: 'patient',
    launch: false,
  },
  // Throws it sideways into every bend for the mini-turbos, swinging wide on the way in.
  {
    name: 'Drifter',
    pace: 0,
    early: 0,
    late: 0.01,
    line: 'outside',
    laneEvery: [2, 4],
    corner: 0.06,
    drift: 0.32,
    steer: 2.4,
    wobble: 0.015,
    catchUp: 1,
    slips: 1,
    items: 'quick',
    launch: false,
  },
  // Rides the tail of whoever is ahead, bumps them and fires straight at them.
  {
    name: 'Bully',
    pace: 0.01,
    early: 0,
    late: 0.01,
    line: 'hunt',
    laneEvery: [1, 2],
    corner: 0.05,
    drift: 0.55,
    steer: 2.5,
    wobble: 0.01,
    catchUp: 1.2,
    slips: 0.9,
    items: 'aggressive',
    launch: true,
  },
  // Flies off the line and leads early, then fades.
  {
    name: 'Rocket',
    pace: 0.02,
    early: 0.06,
    late: -0.05,
    line: 'wander',
    laneEvery: [2, 4],
    corner: 0.08,
    drift: 0.55,
    steer: 2.2,
    wobble: 0.01,
    catchUp: 0.8,
    slips: 1.1,
    items: 'quick',
    launch: true,
  },
  // Slow to get going, saves its items, and comes on strong in the last lap.
  {
    name: 'Closer',
    pace: -0.01,
    early: -0.06,
    late: 0.05,
    line: 'centre',
    laneEvery: [3, 6],
    corner: 0,
    drift: 0.6,
    steer: 2.1,
    wobble: 0.005,
    catchUp: 1.4,
    slips: 0.6,
    items: 'patient',
    launch: false,
  },
  // All over the road: wanders, wobbles and makes mistakes, but has bursts of speed.
  {
    name: 'Wildcard',
    pace: -0.02,
    early: 0.02,
    late: 0,
    line: 'wander',
    laneEvery: [0.8, 1.8],
    corner: 0.1,
    drift: 0.45,
    steer: 2.8,
    wobble: 0.06,
    catchUp: 1.6,
    slips: 2.4,
    items: 'quick',
    launch: false,
  },
  // Plays it safe: holds a shield or a trap behind it to fend off the pack.
  {
    name: 'Guard',
    pace: 0,
    early: 0,
    late: 0,
    line: 'centre',
    laneEvery: [3, 5],
    corner: -0.05,
    drift: 0.7,
    steer: 2,
    wobble: 0.005,
    catchUp: 0.8,
    slips: 0.5,
    items: 'defensive',
    launch: false,
  },
];

/** A clean, middle-of-the-road driver (the autopilot for a player who steps away). */
export const STEADY: AiStyle = {
  name: 'Steady',
  pace: 0,
  early: 0,
  late: 0,
  line: 'wander',
  laneEvery: [2, 5],
  corner: 0,
  drift: 0.55,
  steer: 2.2,
  wobble: 0,
  catchUp: 1,
  slips: 0,
  items: 'quick',
  launch: false,
};

export interface AiBrain {
  /** Preferred lane, metres from centre. */
  lane: number;
  /** 0..1, scales top-speed discipline and reaction. */
  skill: number;
  /** Difficulty: 0 kids, 1 easy, 2 normal, 3 hard, 4 expert (see AI_LEVELS). */
  level: number;
  /** Kids level: the habits of a clumsy little driver (see clumsy()). */
  kid?: KidHabits;
  style: AiStyle;
  laneTimer: number;
  /** A slip in progress: seconds left, and what it is (lift off, or a twitch of the wheel). */
  slip: number;
  slipKind: 'lift' | 'twitch';
  slipDir: number;
  /** Wobble phase. */
  phase: number;
  /** How it goes off the line: the start boost, too early (a spin), or on green. */
  start?: 'boost' | 'early' | 'green';
  seed: number;
}

export function createBrain(
  seed: number,
  skill: number,
  level = AI_NORMAL,
  style: AiStyle = STEADY,
): AiBrain {
  const s = seed * 9301 + 49297;
  return {
    lane: 0,
    skill,
    level,
    style,
    laneTimer: 0,
    slip: 0,
    slipKind: 'lift',
    slipDir: 1,
    phase: (s % 628) / 100,
    seed: s,
  };
}

/** The habits that make the kids-level AI a clumsy driver, each on its own clock. */
interface KidHabits {
  /** Wandering into a wall: which side (0 = not now), seconds left, and until the next time. */
  wall: number;
  wallT: number;
  wallWait: number;
  /** Bumper cars: steering into the nearest racer. */
  ram: boolean;
  ramT: number;
  ramWait: number;
  /** How far down the gas pedal is, and until it changes. */
  foot: number;
  footT: number;
  /** A drift for no reason. */
  silly: boolean;
  sillyT: number;
  sillyWait: number;
  /** Stopping to look around. */
  look: boolean;
  lookT: number;
  lookWait: number;
  /** Where the wheel actually is (it turns slowly). */
  steer: number;
}

/** Tick the kids-level habits; returns what it's up to now. */
function clumsy(b: AiBrain, dt: number): KidHabits {
  const r = () => rand(b);
  const h = (b.kid ??= {
    wall: 0,
    wallT: 0,
    wallWait: 2 + r() * 4,
    ram: false,
    ramT: 0,
    ramWait: 3 + r() * 6,
    foot: 0.7,
    footT: 0,
    silly: false,
    sillyT: 0,
    sillyWait: 6 + r() * 10,
    look: false,
    lookT: 0,
    lookWait: 12 + r() * 15,
    steer: 0,
  });
  // Into a wall every few seconds, scraping along it for a moment or two.
  if ((h.wallT -= dt) <= 0) h.wall = 0;
  if (!h.wall && (h.wallWait -= dt) <= 0) {
    h.wall = r() < 0.5 ? -1 : 1;
    h.wallT = 1 + r() * 1.5;
    h.wallWait = 3 + r() * 5;
  }
  // Bumper cars now and then.
  if ((h.ramT -= dt) <= 0) h.ram = false;
  if (!h.ram && (h.ramWait -= dt) <= 0) {
    h.ram = true;
    h.ramT = 1.2 + r() * 1.3;
    h.ramWait = 4 + r() * 6;
  }
  // The foot on the gas: anywhere from half to all the way, and now and then right off it.
  if ((h.footT -= dt) <= 0) {
    const x = r();
    h.foot = x < 0.12 ? 0 : 0.45 + r() * 0.55;
    h.footT = h.foot === 0 ? 0.3 + r() * 0.5 : 0.6 + r() * 1.6;
  }
  if ((h.sillyT -= dt) <= 0) h.silly = false;
  if (!h.silly && (h.sillyWait -= dt) <= 0) {
    h.silly = true;
    h.sillyT = 0.6 + r() * 0.8;
    h.sillyWait = 6 + r() * 10;
  }
  if ((h.lookT -= dt) <= 0) h.look = false;
  if (!h.look && (h.lookWait -= dt) <= 0) {
    h.look = true;
    h.lookT = 0.8 + r() * 1;
    h.lookWait = 12 + r() * 16;
  }
  return h;
}

/** AI difficulty levels, easiest first. */
export const AI_LEVELS = ['Kids', 'Easy', 'Normal', 'Hard', 'Expert'] as const;
/** The level index of Normal, the default. */
export const AI_NORMAL = 2;
/** The easiest level: so gentle that small children beat it. */
export const AI_KIDS = 0;
/** A level as an index into the tables below. */
export const aiLevelIndex = (level: number): number =>
  Math.max(0, Math.min(AI_LEVELS.length - 1, Math.round(level)));
/** How close to its top speed an AI dares to drive at each level (before its own skill). */
const PACE = [0.5, 0.74, 0.85, 0.92, 0.97];
const PACE_SPAN = [0.04, 0.06, 0.06, 0.05, 0.04];
/** How sharp a bend ahead (radians) has it lift off, and brake. */
const LIFT = [0.4, 0.6, 0.78, 0.92, 1.05];
const BRAKE = [0.9, 1.2, 1.42, 1.62, 1.82];
/** An AI kart's engine against a player's at each level (the classic arcade handicap). */
export const AI_POWER = [0.68, 0.84, 0.9, 0.94, 0.98];
/** How much harder it pushes when it's behind the leader. */
const CATCH_UP = [0, 0.01, 0.04, 0.07, 0.09];
/** How often it slips up, against its style's rate. */
const SLIPS = [3.5, 1.8, 1.1, 0.6, 0.3];
/** How long it thinks before using an item (seconds), and how often it goes for the start boost. */
export const AI_THINK = [3.5, 1.6, 1.0, 0.7, 0.45];
const LAUNCH = [0, 0, 0.3, 0.6, 0.9];

function rand(b: AiBrain): number {
  b.seed = (b.seed * 16807) % 2147483647;
  return b.seed / 2147483647;
}

/** What the AI knows about the race beyond its own kart. */
export interface AiContext {
  /** Everyone in the race (for 'hunt'). */
  karts?: readonly KartState[];
  /** The whole race distance (for pace that changes over the race). */
  raceLength?: number;
  /** Is a jump over a gap coming up? There it drives flat out, no slips. */
  runUp?: (s: number) => boolean;
  /** How far the best human player has got (the kids level waits for them). */
  humanBest?: number;
  /** The countdown is on (the start boost). */
  countdown?: { left: number };
}

/** Simple racing-line follower: aim at a point ahead, drift in long corners. */
export function aiDrive(
  b: AiBrain,
  k: KartState,
  track: Track,
  leaderProgress: number,
  dt: number,
  hazards: HazardState[] = [],
  ctx: AiContext = {},
): PadState {
  const pad = neutralPad();
  const st = b.style;
  const lv = aiLevelIndex(b.level);
  // The start: a launcher hits the gas in the last second for the boost, a wild one sometimes
  // revs too early and spins, the rest go on green.
  if (ctx.countdown) {
    const left = ctx.countdown.left;
    if (b.start === undefined) {
      const r = rand(b);
      b.start =
        st.launch && r < LAUNCH[lv]!
          ? 'boost'
          : r > 1 - st.slips * SLIPS[lv]! * 0.08
            ? 'early'
            : 'green';
    }
    if (b.start === 'boost' && left < 0.6 + b.skill * 0.3) pad.throttle = 1;
    if (b.start === 'early' && left < 2.4) pad.throttle = 1;
    return pad;
  }
  const look = 8 + Math.max(0, k.speed) * 0.55;
  const frame = track.frameAtS(k.s + look);
  const halfW = frame.width / 2 - 1.5;
  // The bend ahead: how sharp, and which way (+1 turning right).
  const far = track.frameAtS(k.s + look * 2.2).tan;
  const bend = Math.acos(clamp(dot(far, k.fwd), -1, 1));
  const turn = Math.sign(dot(cross(k.fwd, far), k.up)) || 1;
  const runUp = ctx.runUp?.(k.s) ?? false;

  b.laneTimer -= dt;
  if (b.laneTimer <= 0) {
    b.lane = (rand(b) - 0.5) * frame.width * (st.line === 'wander' ? 0.6 : 0.3);
    b.laneTimer = st.laneEvery[0] + rand(b) * (st.laneEvery[1] - st.laneEvery[0]);
  }
  let lane = b.lane;
  if (st.line === 'centre') lane = b.lane * 0.3;
  else if (st.line === 'inside' && bend > 0.25) lane = -turn * halfW * 0.7;
  else if (st.line === 'outside' && bend > 0.25) lane = turn * halfW * 0.6;
  else if (st.line === 'hunt' && ctx.karts) {
    // The nearest kart ahead within reach: get in behind it.
    let best: KartState | null = null,
      bestD = 45;
    for (const q of ctx.karts) {
      if (q === k || q.finished) continue;
      const d = sDelta(k.s, q.s, track.length);
      if (d > 2 && d < bestD) {
        best = q;
        bestD = d;
      }
    }
    if (best) lane = best.lat;
  }
  // Dodge hazards ahead: pick the side of the road with more room around them.
  for (const h of hazards) {
    if (!h.present) continue;
    const ahead = sDelta(k.s, h.s, track.length);
    if (ahead < 2 || ahead > look * 1.8) continue;
    const sweep = h.def.move?.axis === 'lat' ? Math.abs(h.def.move.amp) * 0.5 : 0;
    const clear = h.def.r + 2.2 + sweep;
    if (Math.abs(lane - h.lat) < clear) {
      const left = h.lat - clear,
        right = h.lat + clear;
      lane =
        Math.abs(left) < Math.abs(right) && left > -halfW ? left : right < halfW ? right : left;
    }
  }
  lane = Math.max(-halfW, Math.min(halfW, lane));
  // Kids level: a clumsy little driver, wandering into walls and into the others.
  const kids = lv === AI_KIDS && !runUp;
  const kid = kids ? clumsy(b, dt) : null;
  if (kid?.wall) lane = kid.wall * (frame.width / 2 + 3);
  else if (kid?.ram && ctx.karts) {
    // Bumper cars: steer into whoever is nearest, alongside or just ahead.
    let best: KartState | null = null,
      bestD = 30;
    for (const q of ctx.karts) {
      if (q === k || q.finished) continue;
      const ahead = sDelta(k.s, q.s, track.length);
      const d = ahead < -4 ? Infinity : Math.abs(ahead);
      if (d < bestD) {
        best = q;
        bestD = d;
      }
    }
    if (best) {
      lane = best.lat + Math.sign(best.lat - k.lat || 1) * 1.5;
      kid.foot = 1; // and floors it to catch them
    } else kid.ram = false;
  }
  const target = track.pointAt(k.s + look, lane, 0);
  const to = sub(target, k.pos);
  const right = cross(k.fwd, k.up);
  const angle = Math.atan2(dot(to, right), dot(to, k.fwd));
  b.phase += dt * (1.7 + b.skill);
  const waver = runUp
    ? 0
    : (st.wobble + (kids ? 0.07 : 0)) * (Math.sin(b.phase) + 0.5 * Math.sin(b.phase * 2.3));
  pad.steer = clamp((angle + waver) * st.steer, -1, 1);
  if (kid) {
    // Slow hands: the wheel only gets round so fast, so it swings wide in the bends and weaves.
    kid.steer += clamp(pad.steer * 0.8 - kid.steer, -dt * 1.6, dt * 1.6);
    pad.steer = kid.steer;
  }

  // Better drivers, and bolder ones, lift later and brake later for the bends.
  pad.throttle = bend > LIFT[lv]! + st.corner && k.speed > 26 ? 0.5 : 1;
  if (bend > BRAKE[lv]! + st.corner && k.speed > 22) pad.brake = 0.6;
  pad.drift = bend > st.drift && k.speed > 18 && Math.abs(angle) > 0.12;

  if (kid) {
    // Never quite flat out: the foot goes up and down on the pedal. A drift for no reason now
    // and then, and the odd stop to look around.
    pad.throttle = Math.min(pad.throttle, kid.foot);
    if (kid.silly) pad.drift = true;
    if (kid.look) {
      pad.throttle = 0;
      pad.brake = k.speed > 6 ? 0.7 : 0;
      pad.drift = false;
    }
  }

  // Slip-ups: a moment off the gas, or a twitch of the wheel. Never on the run-up to a jump.
  if (b.slip > 0) {
    b.slip -= dt;
    if (!runUp) {
      if (b.slipKind === 'lift') {
        pad.throttle = 0;
        pad.drift = false;
      } else pad.steer = clamp(pad.steer + b.slipDir * 0.6, -1, 1);
    }
  } else if (!runUp && k.speed > 20 && rand(b) < ((st.slips * SLIPS[lv]!) / 60) * dt) {
    b.slipKind = rand(b) < 0.6 ? 'lift' : 'twitch';
    b.slip = b.slipKind === 'lift' ? 0.4 + rand(b) * 0.7 : 0.2 + rand(b) * 0.25;
    b.slipDir = rand(b) < 0.5 ? -1 : 1;
  }

  // Pace: the level's, its skill, its style, where it is in the race, and a mild rubber band
  // (on the AI only: never slows players).
  const gap = leaderProgress - k.progress;
  const through = ctx.raceLength ? clamp(k.progress / ctx.raceLength, 0, 1) : 0.5;
  const arc = through < 0.5 ? st.early * (1 - through * 2) : st.late * (through * 2 - 1);
  const discipline =
    PACE[lv]! +
    PACE_SPAN[lv]! * b.skill +
    st.pace +
    arc +
    clamp((gap / 300) * st.catchUp, -0.05, CATCH_UP[lv]! * st.catchUp);
  // Kids level: ahead of every player, it dawdles, and well ahead it crawls, so they catch up.
  const lead = ctx.humanBest === undefined ? -Infinity : k.progress - ctx.humanBest;
  const dawdle = lv !== AI_KIDS ? 0 : lead > 120 ? 0.15 : lead > 25 ? 0.35 : 0;
  if (!runUp && k.speed > k.params.topSpeed * discipline && k.boostTime <= 0) pad.throttle = 0.2;
  if (dawdle && !runUp && k.speed > k.params.topSpeed * dawdle) {
    pad.throttle = 0;
    pad.drift = false;
    if (k.speed > k.params.topSpeed * dawdle * 1.3) pad.brake = 0.4;
  }
  return pad;
}
