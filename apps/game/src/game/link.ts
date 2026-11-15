import { LINK_TAG, type PadState, type PauseAction, neutralPad } from '@epic/shared';
import { type Netplay, type RaceSnap, decodeData, encodeData } from '@epic/sim';
import type { Net } from './net.ts';
import type { RaceSettings } from './settings.ts';

/**
 * 8-Player Local: two laptops on the same network (or joined by a cable) racing one race,
 * up to four players on each.
 *
 * The laptop that runs the game server is the main one: its lobby picks the track and the
 * settings and starts each race. The other laptop opens the main one's address in a browser
 * and becomes its second screen, with its own QR code for its own phones. In a race, each
 * laptop runs the whole race itself (see Netplay): only the players' inputs travel between
 * them, a few dozen bytes 60 times a second, so nobody's controls ever wait for the network.
 */

/** A player in a lobby, as the other laptop sees them. */
export interface RosterMember {
  key: string;
  name: string;
  color: string;
  vehicle: string;
  ready: boolean;
  kind: 'keyboard' | 'gamepad' | 'phone';
  connected: boolean;
}

/** What the main laptop sends to start a race: the same on every laptop. */
export interface RaceSpec {
  /** Counts races, so messages from an earlier one are ignored. */
  id: number;
  track: string;
  laps: number;
  /** Racers in all, players and AI. */
  total: number;
  level: number;
  /** Every player, in kart order (main laptop's first). */
  humans: { name: string; color: string; vehicle: string; screen: number; key: string }[];
  cup: { start: string; races: number; race: number } | null;
}

export type LinkMsg =
  /** Main to the others: is 8-Player Local on, and is this laptop the one it races with? */
  | { t: 'hello'; on: boolean; full?: boolean }
  /** Second laptop to main: its players, whenever they change. */
  | { t: 'roster'; members: RosterMember[] }
  /** Main to the second laptop: the whole lobby. */
  | {
      t: 'lobby';
      track: string;
      cupMode: boolean;
      settings: RaceSettings;
      rosters: [number, RosterMember[]][];
      /** Seconds to the start (0 = not counting down). */
      starting: number;
      /** A race is on (a second laptop that just arrived joins the next one). */
      racing: boolean;
    }
  /** Second laptop to main: something its players asked for. */
  | { t: 'cmd'; c: 'track'; dir: number }
  | { t: 'cmd'; c: 'cup' }
  | { t: 'cmd'; c: 'pause'; action: PauseAction }
  | { t: 'cmd'; c: 'continue' }
  | { t: 'start'; spec: RaceSpec }
  /** Built the race and ready to go; main then says go and both clocks start. */
  | { t: 'loaded'; id: number }
  | { t: 'go'; id: number }
  | { t: 'paused'; id: number; on: boolean }
  | { t: 'toLobby' }
  | { t: 'ping'; n: number }
  | { t: 'pong'; n: number }
  /** A confirmed step's fingerprint (second laptop to main), every half second. */
  | { t: 'hash'; id: number; frame: number; hash: number }
  /** Main to a laptop that disagreed: the race as it really was before step `frame`. */
  | { t: 'repair'; id: number; frame: number; state: string }
  /** Main to the second laptop: how many steps main is ahead of what it has heard from it. */
  | { t: 'adv'; id: number; d: number };

// ---------- race inputs on the wire ----------
// [LINK_TAG][race id u8][screen u8][step u32][players u8] then per player
// [player u8][steer i8][throttle u8][brake u8][buttons u8][autopilot u8].
const HEAD = 8,
  PER = 6;
const B_DRIFT = 1,
  B_ITEM = 2,
  B_BACK = 4;

export function encodeFrame(
  race: number,
  screen: number,
  frame: number,
  pads: [number, PadState][],
): Uint8Array {
  const out = new Uint8Array(HEAD + PER * pads.length);
  const v = new DataView(out.buffer);
  out[0] = LINK_TAG;
  out[1] = race & 0xff;
  out[2] = screen;
  v.setUint32(3, frame, true);
  out[7] = pads.length;
  pads.forEach(([h, p], i) => {
    const o = HEAD + PER * i;
    out[o] = h;
    v.setInt8(o + 1, Math.round(clamp(p.steer, -1, 1) * 127));
    out[o + 2] = Math.round(clamp(p.throttle, 0, 1) * 255);
    out[o + 3] = Math.round(clamp(p.brake, 0, 1) * 255);
    out[o + 4] = (p.drift ? B_DRIFT : 0) | (p.item ? B_ITEM : 0) | (p.lookBack ? B_BACK : 0);
    out[o + 5] = Math.round(clamp(p.auto ?? 0, 0, 1) * 100);
  });
  return out;
}

export function decodeFrame(
  bytes: Uint8Array,
): { race: number; screen: number; frame: number; pads: [number, PadState][] } | null {
  if (bytes[0] !== LINK_TAG || bytes.byteLength < HEAD) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = bytes[7]!;
  if (bytes.byteLength < HEAD + PER * n) return null;
  const pads: [number, PadState][] = [];
  for (let i = 0; i < n; i++) {
    const o = HEAD + PER * i;
    const b = bytes[o + 4]!;
    const p = neutralPad();
    p.steer = v.getInt8(o + 1) / 127;
    p.throttle = bytes[o + 2]! / 255;
    p.brake = bytes[o + 3]! / 255;
    p.drift = (b & B_DRIFT) !== 0;
    p.item = (b & B_ITEM) !== 0;
    p.lookBack = (b & B_BACK) !== 0;
    if (bytes[o + 5]) p.auto = bytes[o + 5]! / 100;
    pads.push([bytes[o]!, p]);
  }
  return { race: bytes[1]!, screen: bytes[2]!, frame: v.getUint32(3, true), pads };
}

/**
 * An input exactly as the other laptop will read it off the wire. Each laptop drives its own
 * players with this rounded version too: otherwise a stick at 0.3721 here and 0.3701 there
 * would be two different races.
 */
export function quantizePad(p: PadState): PadState {
  return decodeFrame(encodeFrame(0, 0, 0, [[0, p]]))!.pads[0]![1];
}

/** Hooks a linked race session calls each step (implemented by LinkRace). */
export interface LinkSetup {
  /** After each step this laptop ran: its own players' inputs for it, to send on. */
  onStep(frame: number, pads: [number, PadState][]): void;
  /** How fast to run the race clock (about 1), to stay level with the main laptop. */
  rate(): number;
  /** The fingerprint of a confirmed step, every half second. */
  onHash(frame: number, hash: number): void;
}

const EVERY = 30; // steps between fingerprints and clock reports

/** One linked race, on one laptop: sends, receives, keeps time, checks and repairs. */
export class LinkRace implements LinkSetup {
  private np: Netplay | null = null;
  /** Latest step heard from each other screen. */
  private heard = new Map<number, number>();
  /** Smoothed "steps I'm ahead of what I hear from the main laptop" (second laptop only). */
  private lead = 0;
  private leadInit = false;
  /** The main laptop's own figure for us. */
  private mainLead = 0;
  /** Main: our own fingerprints, and each other screen's. */
  private hashes = new Map<number, number>();
  private theirs = new Map<number, Map<number, number>>();
  private lastRepair = new Map<number, number>();
  /** For the link readout and tests. */
  stats = { mismatches: 0, repairs: 0, rate: 1 };

  constructor(
    readonly spec: RaceSpec,
    private net: Net,
    readonly me: number,
  ) {}

  get isMain(): boolean {
    return this.me === 0;
  }

  attach(np: Netplay): void {
    this.np = np;
  }

  onStep(frame: number, pads: [number, PadState][]): void {
    this.net.sendLinkFrame(encodeFrame(this.spec.id, this.me, frame, pads));
    if (!this.isMain) {
      const h = this.heard.get(0);
      if (h !== undefined) {
        const d = frame - h;
        if (!this.leadInit) ((this.lead = d), (this.leadInit = true));
        else this.lead += (d - this.lead) * 0.05;
      }
    } else if (frame % EVERY === 0) {
      for (const [s, h] of this.heard)
        this.net.sendLink({ t: 'adv', id: this.spec.id, d: frame - h } satisfies LinkMsg, s);
    }
  }

  rate(): number {
    if (this.isMain || !this.leadInit) return 1;
    // We're this many steps ahead of the main laptop (half the difference of the two views;
    // the network delay is in both and cancels out). Ease off or catch up a little.
    const ahead = (this.lead - this.mainLead) / 2;
    this.stats.rate = clamp(1 - ahead * 0.03, 0.75, 1.5);
    return this.stats.rate;
  }

  onHash(frame: number, hash: number): void {
    if (!this.isMain) {
      this.net.sendLink({ t: 'hash', id: this.spec.id, frame, hash } satisfies LinkMsg, 0);
      return;
    }
    this.hashes.set(frame, hash);
    for (const [s, m] of this.theirs) this.compare(s, frame, m);
    this.prune(frame);
  }

  /** A race-input frame from another laptop. */
  onFrame(bytes: Uint8Array): void {
    const m = decodeFrame(bytes);
    if (!m || !this.np || m.race !== (this.spec.id & 0xff)) return;
    this.heard.set(m.screen, Math.max(this.heard.get(m.screen) ?? -1, m.frame));
    for (const [h, pad] of m.pads) {
      if (this.spec.humans[h]?.screen === m.screen) this.np.receive(h, m.frame, pad);
    }
  }

  onMsg(from: number, msg: LinkMsg): void {
    if (!('id' in msg) || msg.id !== this.spec.id || !this.np) return;
    if (msg.t === 'adv' && from === 0) this.mainLead = msg.d;
    else if (msg.t === 'hash' && this.isMain) {
      let m = this.theirs.get(from);
      if (!m) this.theirs.set(from, (m = new Map()));
      m.set(msg.frame, msg.hash);
      this.compare(from, msg.frame, m);
    } else if (msg.t === 'repair' && !this.isMain) {
      this.stats.repairs++;
      this.np.repair(msg.frame, decodeData<RaceSnap>(msg.state));
    }
  }

  /** A laptop left mid-race: the autopilot takes its players over, on every laptop alike. */
  screenLeft(screen: number): void {
    if (!this.np) return;
    const last = this.heard.get(screen) ?? -1;
    this.spec.humans.forEach((h, i) => h.screen === screen && this.np!.endInput(i, last));
  }

  private compare(screen: number, frame: number, theirs: Map<number, number>): void {
    const mine = this.hashes.get(frame),
      other = theirs.get(frame);
    if (mine === undefined || other === undefined) return;
    theirs.delete(frame);
    if (mine === other) return;
    // They went wrong somewhere (shouldn't happen; this is the safety net): send the race as
    // it really is at our latest confirmed step, at most once a second.
    this.stats.mismatches++;
    const now = performance.now();
    if (now - (this.lastRepair.get(screen) ?? -Infinity) < 1000) return;
    this.lastRepair.set(screen, now);
    const f = this.np!.confirmed + 1;
    const s = this.np!.stateAt(f);
    if (!s) return;
    this.stats.repairs++;
    console.warn(`[8-Player Local] screen ${screen + 1} disagreed at step ${frame}: repairing`);
    this.net.sendLink(
      { t: 'repair', id: this.spec.id, frame: f, state: encodeData(s) } satisfies LinkMsg,
      screen,
    );
  }

  private prune(frame: number): void {
    for (const f of this.hashes.keys()) if (f < frame - 40 * EVERY) this.hashes.delete(f);
    for (const m of this.theirs.values())
      for (const f of m.keys()) if (f < frame - 40 * EVERY) m.delete(f);
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
