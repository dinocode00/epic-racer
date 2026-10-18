import type { PadState } from '@epic/shared';
import { sDelta } from './hazards.ts';
import { type ItemKind, type KartState, SPECIAL_OF, launch, spinOut } from './kart.ts';
import type { Track } from './track.ts';
import { cross, dot, sub } from './vec.ts';

/**
 * Items: rows of boxes on the road, a one-slot inventory with a short roulette, odds that
 * favour racers further behind the leader, projectiles, traps, the Balrog's whip, each
 * vehicle's special ability and the Great Eagle (Middle-earth's own item).
 */

export interface ItemBox {
  s: number;
  lat: number;
  /** Race time when the box comes back after being driven through. */
  takenUntil: number;
}

export interface Projectile {
  id: number;
  kind: 'shot' | 'homing' | 'robot';
  owner: number;
  s: number;
  lat: number;
  /** +1 forward along the track, -1 backward. */
  dir: number;
  speed: number;
  /** Kart id being chased (homing and robot only). */
  target: number | null;
  life: number;
}

export interface Trap {
  id: number;
  owner: number;
  s: number;
  lat: number;
  life: number;
}

/** A Balrog's whip on its way to the leader: warns, then lashes. */
export interface Strike {
  id: number;
  owner: number;
  target: number;
  time: number;
}

/** Things that just happened, for sounds and effects. */
export interface ItemEvent {
  kind: 'pickup' | 'use' | 'hit' | 'blocked' | 'lash';
  kart: number;
  item?: ItemKind;
}

const ROLL_TIME = 1.0;
const BOX_RESPAWN = 3;
const SHOT_SPEED = 72;
const HOMING_SPEED = 64;
const IMMUNE_AFTER_HIT = 2;
const MAX_TRAPS = 24;
/** No whip in the closing stretch of the last lap. */
const WHIP_CUTOFF = 0.92;

type Table = [ItemKind, number][];
/**
 * Odds by time behind the leader. 1st gets defensive and small items; the back of the
 * field gets the specials, boosts, eagles and the occasional whip.
 */
const TABLES: { maxGap: number; table: Table }[] = [
  {
    maxGap: 0,
    table: [
      ['trap', 30],
      ['shot', 28],
      ['shield', 22],
      ['boost', 15],
      ['special', 5],
    ],
  },
  {
    maxGap: 1.5,
    table: [
      ['shot', 20],
      ['homing', 18],
      ['trap', 15],
      ['boost', 18],
      ['shield', 10],
      ['special', 12],
      ['boost3', 7],
    ],
  },
  {
    maxGap: 4,
    table: [
      ['homing', 18],
      ['boost3', 16],
      ['boost', 12],
      ['special', 24],
      ['shot', 10],
      ['shield', 6],
      ['eagle', 7],
      ['whip', 7],
    ],
  },
  {
    maxGap: 8,
    table: [
      ['special', 26],
      ['boost3', 20],
      ['eagle', 20],
      ['whip', 10],
      ['homing', 14],
      ['boost', 10],
    ],
  },
  {
    maxGap: Infinity,
    table: [
      ['eagle', 34],
      ['special', 26],
      ['boost3', 20],
      ['whip', 14],
      ['homing', 6],
    ],
  },
];

export const TRAILABLE: ReadonlySet<ItemKind> = new Set(['shot', 'homing', 'trap']);

export class ItemSystem {
  readonly boxes: ItemBox[] = [];
  readonly projectiles: Projectile[] = [];
  readonly traps: Trap[] = [];
  readonly strikes: Strike[] = [];
  /** Events from the latest step (tests, AI). */
  events: ItemEvent[] = [];
  /** Events since the renderer last asked (several steps can run per frame). */
  private log: ItemEvent[] = [];
  private nextId = 1;
  private seed = 1234567;
  private held: boolean[];
  private aiTimer: number[];

  constructor(
    private track: Track,
    private karts: KartState[],
    private isAi: boolean[],
    private laps: number,
  ) {
    for (const s of track.def.itemRows ?? []) {
      const w = track.frameAtS(s).width;
      // Five boxes across the road, close enough that there's no way through untouched.
      for (const f of [-0.4, -0.2, 0, 0.2, 0.4])
        this.boxes.push({ s, lat: f * (w - 2), takenUntil: 0 });
    }
    this.held = karts.map(() => false);
    this.aiTimer = karts.map(() => 0);
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private get raceLength(): number {
    return this.track.length * this.laps;
  }

  /** Roughly how many seconds a kart is behind the leader. */
  private gapSeconds(k: KartState): number {
    const lead = Math.max(...this.karts.map((q) => q.progress));
    return (lead - k.progress) / 36;
  }

  /** Draw an item for a kart: odds by gap to the leader, a little gentler for the AI. */
  roll(k: KartState): ItemKind {
    let gap = this.gapSeconds(k);
    if (k.place === 1) gap = 0;
    else gap = Math.max(0.01, gap);
    if (this.isAi[k.id]) gap *= 0.6;
    const table = TABLES.find((t) => gap <= t.maxGap)!.table;
    const leader = this.karts.find((q) => q.place === 1);
    const lateRace = leader ? leader.progress > this.raceLength * WHIP_CUTOFF : false;
    const usable = table.filter(([kind]) => !(kind === 'whip' && lateRace));
    const total = usable.reduce((a, [, w]) => a + w, 0);
    let r = this.rand() * total;
    for (const [kind, w] of usable) if ((r -= w) <= 0) return kind;
    return usable[0]![0];
  }

  /** Run one step. `pads[i]` is the human input (AI decide for themselves). */
  step(time: number, dt: number, pads: (PadState | undefined)[], racing: boolean): void {
    this.events = [];
    for (const k of this.karts) {
      k.immuneTime = Math.max(0, k.immuneTime - dt);
      k.shieldTime = Math.max(0, k.shieldTime - dt);
      k.threat = null;
      if (k.rollTime > 0) {
        k.rollTime = Math.max(0, k.rollTime - dt);
        if (k.rollTime === 0 && k.rollItem) {
          k.item = k.rollItem;
          k.itemCount = k.item === 'boost3' ? 3 : 1;
          k.rollItem = null;
        }
      }
    }
    if (!racing) return;
    this.pickups(time);
    this.stepActions(dt, pads);
    this.log.push(...this.events);
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
  }

  /** Hand over (and clear) the events since the last call. */
  takeLog(): ItemEvent[] {
    const out = this.log;
    this.log = [];
    return out;
  }

  private stepActions(dt: number, pads: (PadState | undefined)[]): void {
    this.karts.forEach((k, i) => {
      if (k.finished) return;
      if (this.isAi[i]) this.aiUse(k, dt);
      else this.humanUse(k, pads[i]);
    });
    this.specials(dt);
    this.moveProjectiles(dt);
    this.checkTraps(dt);
    this.runStrikes(dt);
  }

  // ------------------------------------------------------------------ pickups

  private pickups(time: number): void {
    for (const b of this.boxes) {
      if (b.takenUntil > time) continue;
      for (const k of this.karts) {
        if (k.rescueTime > 0) continue;
        if (Math.abs(sDelta(b.s, k.s, this.track.length)) > 2.2) continue;
        if (Math.abs(k.lat - b.lat) > 1.8) continue;
        b.takenUntil = time + BOX_RESPAWN;
        if (k.item === null && k.rollTime === 0) {
          k.rollItem = this.roll(k);
          k.rollTime = ROLL_TIME;
          this.events.push({ kind: 'pickup', kart: k.id, item: k.rollItem });
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------------ using items

  private humanUse(k: KartState, pad: PadState | undefined): void {
    const down = !!pad?.item;
    const was = this.held[k.id]!;
    this.held[k.id] = down;
    const back = !!pad && (pad.lookBack || pad.brake > 0.5);
    if (!k.item || k.rollTime > 0) {
      k.trailing = false;
      return;
    }
    if (TRAILABLE.has(k.item)) {
      // Hold to trail it behind you; let go to fire (hold brake or look back to fire back).
      if (down) k.trailing = true;
      else if (was && k.trailing) this.use(k, back);
      return;
    }
    if (down && !was) this.use(k, back);
  }

  /** Fire, drop or activate the held item. */
  use(k: KartState, back = false): void {
    const kind = k.item;
    if (!kind || k.stunTime > 0 || k.rescueTime > 0) return;
    k.trailing = false;
    k.itemCount--;
    if (k.itemCount <= 0) k.item = null;
    this.events.push({ kind: 'use', kart: k.id, item: kind });
    const dir = back ? -1 : 1;
    switch (kind) {
      case 'boost':
      case 'boost3':
        k.boostTime = Math.max(k.boostTime, 1.3);
        break;
      case 'shield':
        k.shieldTime = 8;
        break;
      case 'shot':
        this.projectiles.push({
          id: this.nextId++,
          kind: 'shot',
          owner: k.id,
          s: k.s + dir * 3,
          lat: k.lat,
          dir,
          speed: SHOT_SPEED,
          target: null,
          life: 2.2,
        });
        break;
      case 'homing': {
        const target = this.neighbour(k, dir);
        this.projectiles.push({
          id: this.nextId++,
          kind: 'homing',
          owner: k.id,
          s: k.s + dir * 3,
          lat: k.lat,
          dir,
          speed: HOMING_SPEED,
          target: target?.id ?? null,
          life: 8,
        });
        break;
      }
      case 'trap':
        this.traps.push({
          id: this.nextId++,
          owner: k.id,
          s: (k.s + (back ? -4 : 24) + this.track.length) % this.track.length,
          lat: k.lat,
          life: 45,
        });
        if (this.traps.length > MAX_TRAPS) this.traps.shift();
        break;
      case 'whip': {
        const leader = this.karts.find((q) => q.place === 1);
        const target = leader === k ? this.karts.find((q) => q.place === 2) : leader;
        if (!target || target.progress > this.raceLength * WHIP_CUTOFF) {
          // Too late in the race to lash the leader: it turns into boosts instead.
          k.item = 'boost3';
          k.itemCount = 3;
          break;
        }
        this.strikes.push({ id: this.nextId++, owner: k.id, target: target.id, time: 1.8 });
        break;
      }
      case 'eagle':
        k.eagleTime = 2.6;
        k.drift = { active: false, dir: 0, charge: 0 };
        break;
      case 'special':
        this.startSpecial(k);
        break;
    }
  }

  /** The racer directly ahead (dir 1) or behind (dir -1) in the running order. */
  private neighbour(k: KartState, dir: number): KartState | undefined {
    return this.karts.find((q) => q.place === k.place - dir && !q.finished);
  }

  // ------------------------------------------------------------------ hits

  /** An item hit: spin out, unless shielded, immune, carried, or a Batmissile. */
  hit(k: KartState, by: number, slow = 0): boolean {
    if (k.immuneTime > 0 || k.eagleTime > 0 || k.rescueTime > 0) return false;
    if (k.special?.kind === 'missile') return false;
    if (k.shieldTime > 0) {
      k.shieldTime = 0;
      k.immuneTime = 0.6;
      this.events.push({ kind: 'blocked', kart: k.id });
      return false;
    }
    spinOut(k, 0.9, 0.5);
    k.slowTime = Math.max(k.slowTime, slow);
    k.immuneTime = IMMUNE_AFTER_HIT;
    k.hitCooldown = Math.max(k.hitCooldown, 1.2);
    k.bump = 1;
    this.events.push({ kind: 'hit', kart: k.id });
    void by;
    return true;
  }

  // ------------------------------------------------------------------ specials

  private startSpecial(k: KartState): void {
    const kind = SPECIAL_OF[k.vehicle.id] ?? 'flame';
    switch (kind) {
      case 'morgul':
        k.special = { kind, time: 3, side: 1 };
        break;
      case 'flame':
        k.special = { kind, time: 2.5, side: 0 };
        break;
      case 'missile':
        k.special = { kind, time: 3, side: 0 };
        k.drift = { active: false, dir: 0, charge: 0 };
        break;
      case 'jacks': {
        k.special = { kind, time: 2.2, side: 0 };
        if (!k.air) launch(k, 15);
        k.boostTime = Math.max(k.boostTime, 3.2);
        const target = this.neighbour(k, 1);
        if (target)
          this.projectiles.push({
            id: this.nextId++,
            kind: 'robot',
            owner: k.id,
            s: k.s + 3,
            lat: k.lat,
            dir: 1,
            speed: HOMING_SPEED,
            target: target.id,
            life: 8,
          });
        break;
      }
    }
  }

  private specials(dt: number): void {
    for (const A of this.karts) {
      const sp = A.special;
      if (!sp) continue;
      sp.time -= dt;
      if (sp.time <= 0) {
        A.special = null;
        continue;
      }
      const right = cross(A.fwd, A.up);
      if (sp.kind === 'morgul') {
        // The blade swings to whichever side the nearest rival is on.
        let best = 14;
        for (const B of this.karts) {
          if (B === A) continue;
          const rel = sub(B.pos, A.pos);
          const d = Math.hypot(dot(rel, A.fwd), dot(rel, right));
          if (d < best) {
            best = d;
            sp.side = Math.sign(dot(rel, right)) || sp.side;
          }
        }
        for (const B of this.karts) {
          if (B === A || B.air) continue;
          const rel = sub(B.pos, A.pos);
          const along = dot(rel, A.fwd);
          const side = dot(rel, right) * sp.side;
          if (Math.abs(along) < 2.6 && side > 0.8 && side < 5.2) this.hit(B, A.id, 1.5);
        }
      } else if (sp.kind === 'flame') {
        // Flame jet out of the back: anyone tailing you gets scorched.
        for (const B of this.karts) {
          if (B === A || B.air) continue;
          const rel = sub(B.pos, A.pos);
          const along = dot(rel, A.fwd);
          if (along < -1.5 && along > -14 && Math.abs(dot(rel, right)) < 2.2 - along * 0.05)
            this.hit(B, A.id, 0.6);
        }
      }
    }
  }

  /** Batmissile contact: the other kart is knocked aside, the Batmissile ploughs on. */
  ram(missile: KartState, other: KartState): void {
    const right = cross(other.fwd, other.up);
    const side = Math.sign(dot(sub(other.pos, missile.pos), right)) || 1;
    if (this.hit(other, missile.id)) {
      other.slide = side * 9;
      other.wobbleTime = 0.7;
    }
  }

  // ------------------------------------------------------------------ projectiles

  private moveProjectiles(dt: number): void {
    const L = this.track.length;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      p.life -= dt;
      const target = p.target !== null ? this.karts[p.target] : undefined;
      if (target && (p.kind === 'homing' || p.kind === 'robot')) {
        const ds = sDelta(p.s, target.s, L);
        p.s += Math.sign(ds) * Math.min(Math.abs(ds), p.speed * dt);
        p.lat += Math.sign(target.lat - p.lat) * Math.min(Math.abs(target.lat - p.lat), 9 * dt);
        if (Math.abs(ds) < 70) target.threat = target.threat ?? 'homing';
      } else {
        p.s += p.dir * p.speed * dt;
        const half = this.track.frameAtS(((p.s % L) + L) % L).width / 2 - 0.6;
        p.lat = Math.max(-half, Math.min(half, p.lat));
      }
      p.s = ((p.s % L) + L) % L;
      let gone = p.life <= 0;
      // Shots and homers hit the first racer they reach (not their owner, early on).
      for (const k of this.karts) {
        if (gone) break;
        if (k.id === p.owner && p.life > 1.6) continue;
        if (k.air && k.eagleTime <= 0) continue;
        if (Math.abs(sDelta(p.s, k.s, L)) > 2.2 || Math.abs(p.lat - k.lat) > 1.9) continue;
        if (k.trailing && k.item) {
          // A trailed shot or trap soaks it up.
          k.item = null;
          k.itemCount = 0;
          k.trailing = false;
          this.events.push({ kind: 'blocked', kart: k.id });
        } else this.hit(k, p.owner);
        gone = true;
      }
      // Shots knock out traps they meet.
      for (let t = this.traps.length - 1; t >= 0 && !gone; t--) {
        const tr = this.traps[t]!;
        if (Math.abs(sDelta(p.s, tr.s, L)) < 1.5 && Math.abs(p.lat - tr.lat) < 1.5) {
          this.traps.splice(t, 1);
          gone = true;
        }
      }
      if (gone) this.projectiles.splice(i, 1);
    }
  }

  private checkTraps(dt: number): void {
    for (let t = this.traps.length - 1; t >= 0; t--) {
      const tr = this.traps[t]!;
      tr.life -= dt;
      let gone = tr.life <= 0;
      for (const k of this.karts) {
        if (gone) break;
        if (k.air || k.eagleTime > 0) continue;
        if (Math.abs(sDelta(tr.s, k.s, this.track.length)) > 1.8) continue;
        if (Math.abs(tr.lat - k.lat) > 1.5) continue;
        if (k.trailing && k.item) {
          k.item = null;
          k.itemCount = 0;
          k.trailing = false;
          this.events.push({ kind: 'blocked', kart: k.id });
        } else this.hit(k, tr.owner);
        gone = true;
      }
      if (gone) this.traps.splice(t, 1);
    }
  }

  private runStrikes(dt: number): void {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const st = this.strikes[i]!;
      const k = this.karts[st.target]!;
      st.time -= dt;
      k.threat = 'whip';
      if (st.time <= 0) {
        this.events.push({ kind: 'lash', kart: k.id });
        if (!k.finished) this.hit(k, st.owner, 1.0);
        this.strikes.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------ AI

  /** Simple rules for when the AI uses what it holds. */
  private aiUse(k: KartState, dt: number): void {
    if (!k.item) {
      this.aiTimer[k.id] = 0;
      return;
    }
    if (k.rollTime > 0 || k.stunTime > 0) return;
    this.aiTimer[k.id] = (this.aiTimer[k.id] ?? 0) + dt;
    const t = this.aiTimer[k.id]!;
    if (t < 0.6) return; // a moment's thought
    const right = cross(k.fwd, k.up);
    const near = (pred: (along: number, side: number) => boolean) =>
      this.karts.some((q) => {
        if (q === k) return false;
        const rel = sub(q.pos, k.pos);
        return pred(dot(rel, k.fwd), dot(rel, right));
      });
    const fire = (back = false) => {
      this.aiTimer[k.id] = 0;
      this.use(k, back);
    };
    switch (k.item) {
      case 'boost':
      case 'boost3':
      case 'eagle':
      case 'whip':
        if (t > 1.2) fire();
        break;
      case 'shield':
        if (k.threat || t > 6) fire();
        break;
      case 'shot':
        k.trailing = true;
        if (near((a, s) => a > 4 && a < 45 && Math.abs(s) < 1.6)) fire();
        else if (near((a, s) => a < -3 && a > -25 && Math.abs(s) < 1.6)) fire(true);
        else if (t > 12) fire();
        break;
      case 'homing':
        k.trailing = true;
        if (t > 2.5) fire();
        break;
      case 'trap':
        k.trailing = true;
        if (near((a) => a < -3 && a > -30) || t > 10) fire(true);
        break;
      case 'special': {
        const kind = SPECIAL_OF[k.vehicle.id];
        const go =
          kind === 'morgul'
            ? near((a, s) => a > -4 && a < 14 && Math.abs(s) < 7)
            : kind === 'flame'
              ? near((a, s) => a < -2 && a > -16 && Math.abs(s) < 3)
              : kind === 'missile'
                ? near((a, s) => a > 0 && a < 30 && Math.abs(s) < 4)
                : near((a) => a > 5 && a < 80);
        if (go || t > 8) fire();
        break;
      }
    }
  }
}
