/**
 * A track is a closed centre-line spline. Each control point carries its own "up"
 * vector and width, so banking, loops and upside-down sections are just data.
 */
export type V3 = [number, number, number];

export interface TrackPoint {
  p: V3;
  /** Surface normal at this point. Defaults to world up. */
  up?: V3;
  /** Full road width in metres. */
  width?: number;
}

/** A hazard placed in track coordinates (arc length s, lateral offset from centre). */
export interface HazardDef {
  /** Visual / behaviour kind, e.g. 'oliphaunt', 'tentacle', 'pillar', 'boulder'. */
  kind: string;
  s: number;
  lat: number;
  /** Collision radius (m). */
  r: number;
  /** What happens to a kart that touches it. */
  effect: 'bump' | 'spin' | 'slow' | 'launch';
  /** Movers sweep along an axis: offset = amp * sin(2*pi*t/period + phase). */
  move?: { axis: 'lat' | 's'; amp: number; period: number; phase?: number };
  /**
   * Strikers are only dangerous part of the time: each `period` seconds they warn for
   * `warn` seconds, then hit for `active` seconds.
   */
  strike?: { period: number; warn: number; active: number; phase?: number };
  /** Only from this lap onward (1-based). */
  fromLap?: number;
  /**
   * Goes where a timetable says (grandpa on his rounds): every `dt` seconds of race time a
   * place on the track, round and round every `s.length * dt` seconds. Off the road where
   * `lat` is 999 (not there at all then).
   */
  schedule?: { dt: number; s: number[]; lat: number[] };
}

export interface TrackDef {
  id: string;
  name: string;
  points: TrackPoint[];
  defaultWidth: number;
  laps: number;
  /** Arc-length positions (metres from the start line) of boost pads. */
  boostPads?: number[];
  /**
   * Boost pads placed across the road (instead of a strip down the middle): where along, how
   * far off the centre line, and how wide. Used instead of boostPads when given.
   */
  pads?: { s: number; lat: number; width: number; super?: boolean }[];
  /** How hard boost pads push: seconds of boost and an instant kick (m/s). */
  padBoost?: { time: number; kick: number };
  /** The (rarer, blue) super pads: a longer boost and a much bigger kick. */
  superBoost?: { time: number; kick: number };
  /** Arc-length positions of item box rows. */
  itemRows?: number[];
  /** Ramps that throw karts into the air at s, with this much extra upward speed (m/s). */
  kickers?: { s: number; pop: number }[];
  /** Ranges with no road: karts must fly over them or fall. */
  gaps?: [number, number][];
  /** Ranges with no side walls: drive off the edge and you fall. */
  open?: [number, number][];
  hazards?: HazardDef[];
  /** Ranges that are closed tubes: you can't fly out of them. */
  tubes?: [number, number][];
  /**
   * Over a crest faster than gravity can hold you down, you leave the road and fly (instead
   * of being glued to it), except in the tubes.
   */
  crestAir?: boolean;
  /** Ranges that are underground (no sky, no terrain shaping). */
  tunnels?: [number, number][];
  /** Named landmark positions (arc length), for dressing the scene. */
  marks?: Record<string, number>;
  /** Regions in lap order: [id, start arc length]. */
  regions?: [string, number][];
}
