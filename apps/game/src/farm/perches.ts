/**
 * Where the songbirds can land, in farm-local real metres (x east, height, z = -map y): tree
 * tops, flower heads, roof ridges, posts, lawn and field. The plants and flowers add theirs as
 * they're placed; the buildings' are found by looking down onto their roofs (farmScene.ts).
 */
export type PerchTag =
  | 'spruce'
  | 'pine'
  | 'orchard'
  | 'xmas'
  | 'arbor'
  | 'lilac'
  | 'roof'
  | 'post'
  | 'flower'
  | 'lawn'
  | 'field';

export interface Perch {
  x: number;
  y: number;
  z: number;
  tag: PerchTag;
  /** Ground spots (lawn, field) take any number of birds, scattered round the spot. */
  ground?: boolean;
  /** A bird is sitting here (or on its way). */
  busy?: boolean;
}

export const PERCHES: Perch[] = [];

export function addPerch(x: number, y: number, z: number, tag: PerchTag, ground = false): void {
  PERCHES.push({ x, y, z, tag, ground });
}
