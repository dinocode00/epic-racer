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
}
