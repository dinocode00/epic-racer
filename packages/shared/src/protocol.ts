/**
 * Wire protocol between phone controllers, the local server, and the game host.
 * High-rate input travels as tiny binary frames. Everything else is JSON.
 */

export const DEFAULT_PORT = 4000;
export const WS_PATH = '/ws';

/** Button bit flags inside an input frame. */
export const Btn = {
  Drift: 1,
  Item: 2,
  LookBack: 4,
  Pause: 8,
} as const;

/** Normalised controller state, shared by every input source. */
export interface PadState {
  /** -1 (full left) .. 1 (full right) */
  steer: number;
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  drift: boolean;
  item: boolean;
  lookBack: boolean;
  pause: boolean;
}

export const neutralPad = (): PadState => ({
  steer: 0,
  throttle: 0,
  brake: 0,
  drift: false,
  item: false,
  lookBack: false,
  pause: false,
});

/** Binary input frame: [tag u8][seq u16][steer i8][throttle u8][brake u8][buttons u8] */
export const INPUT_TAG = 1;
export const INPUT_FRAME_BYTES = 7;

export function encodeInput(pad: PadState, seq: number): ArrayBuffer {
  const buf = new ArrayBuffer(INPUT_FRAME_BYTES);
  const v = new DataView(buf);
  v.setUint8(0, INPUT_TAG);
  v.setUint16(1, seq & 0xffff, true);
  v.setInt8(3, Math.round(clamp(pad.steer, -1, 1) * 127));
  v.setUint8(4, Math.round(clamp(pad.throttle, 0, 1) * 255));
  v.setUint8(5, Math.round(clamp(pad.brake, 0, 1) * 255));
  let b = 0;
  if (pad.drift) b |= Btn.Drift;
  if (pad.item) b |= Btn.Item;
  if (pad.lookBack) b |= Btn.LookBack;
  if (pad.pause) b |= Btn.Pause;
  v.setUint8(6, b);
  return buf;
}

export function decodeInput(buf: ArrayBuffer | Uint8Array): { seq: number; pad: PadState } | null {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (bytes.byteLength < INPUT_FRAME_BYTES || bytes[0] !== INPUT_TAG) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const b = v.getUint8(6);
  return {
    seq: v.getUint16(1, true),
    pad: {
      steer: v.getInt8(3) / 127,
      throttle: v.getUint8(4) / 255,
      brake: v.getUint8(5) / 255,
      drift: (b & Btn.Drift) !== 0,
      item: (b & Btn.Item) !== 0,
      lookBack: (b & Btn.LookBack) !== 0,
      pause: (b & Btn.Pause) !== 0,
    },
  };
}

/**
 * The server prefixes binary frames it forwards to the host with the sender's slot,
 * so the host knows whose input it is: [slot u8][frame...].
 */
export function prefixSlot(slot: number, frame: Uint8Array): Uint8Array {
  const out = new Uint8Array(frame.byteLength + 1);
  out[0] = slot;
  out.set(frame, 1);
  return out;
}

// ---------- JSON messages ----------

/** Phone -> server -> host */
export type PadToHost =
  | { t: 'hello'; playerId: string; name: string }
  | { t: 'pickVehicle'; vehicle: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'menu'; action: 'next' | 'prev' | 'confirm' | 'back' };

/** Host -> server -> phone */
export type HostToPad =
  | { t: 'welcome'; slot: number; color: string; name: string }
  | {
      t: 'lobby';
      vehicle: string | null;
      ready: boolean;
      vehicles: string[];
      track?: string;
      canChangeTrack?: boolean;
    }
  | { t: 'race' }
  | { t: 'hud'; place: number; lap: number; laps: number; item: string | null; boost: number }
  | { t: 'results'; place: number };

/** Server <-> host envelope */
export type ServerToHost =
  | { t: 'padJoined'; slot: number; playerId: string; name: string }
  | { t: 'padLeft'; slot: number }
  | { t: 'padMsg'; slot: number; msg: PadToHost };

export type HostToServer = { t: 'toPad'; slot: number; msg: HostToPad };

/** Returned by GET /api/info */
export interface ServerInfo {
  room: string;
  controllerUrl: string;
  qrSvg: string;
  lanAddresses: string[];
}

export const PLAYER_COLORS = [
  '#e8433a',
  '#2f7de1',
  '#3fbf5f',
  '#f5c518',
  '#b05de0',
  '#ff8c2e',
  '#28c4c4',
  '#f070b0',
];

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
