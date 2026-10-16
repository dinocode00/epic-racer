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
}

export interface TrackDef {
  id: string;
  name: string;
  points: TrackPoint[];
  defaultWidth: number;
  laps: number;
  /** Arc-length positions (metres from the start line) of boost pads. */
  boostPads?: number[];
  /** Arc-length positions of item box rows. */
  itemRows?: number[];
  /** Ramps that throw karts into the air at s, with this much extra upward speed (m/s). */
  kickers?: { s: number; pop: number }[];
  /** Ranges with no road: karts must fly over them or fall. */
  gaps?: [number, number][];
  /** Ranges with no side walls: drive off the edge and you fall. */
  open?: [number, number][];
  hazards?: HazardDef[];
  /** Ranges that are underground (no sky, no terrain shaping). */
  tunnels?: [number, number][];
  /** Named landmark positions (arc length), for dressing the scene. */
  marks?: Record<string, number>;
  /** Regions in lap order: [id, start arc length]. */
  regions?: [string, number][];
}
