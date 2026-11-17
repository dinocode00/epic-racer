import type { XY } from './layout.ts';

/**
 * Where grandpa's two old tractors are parked on the farm, and how big they are (tractors.ts
 * builds them). Plain data, so the layout can clear the ground under them as it loads.
 */

export type TractorId = 'wd45' | 'sc';

/** What parking needs: wheelbase, tyre radii, half treads (front and rear), rear tyre width. */
export const TRACTOR_SIZE: Record<
  TractorId,
  { wb: number; fr: number; rr: number; fx: number; rx: number; rw: number }
> = {
  wd45: { wb: 2.27, fr: 0.37, rr: 0.67, fx: 0.66, rx: 0.8, rw: 0.33 },
  // A tricycle front: the twin front wheels sit close together under the pedestal.
  sc: { wb: 2.12, fr: 0.31, rr: 0.71, fx: 0.15, rx: 0.78, rw: 0.26 },
};

/** Where each is parked: map metres, and the way its nose points (degrees from east). */
export const TRACTOR_SPOTS: { id: TractorId; c: XY; heading: number }[] = [
  // In the pumpkin patch, alongside the wagon (south of the road), nose to the oncoming racers.
  { id: 'sc', c: [45.6, 7.6], heading: 8 },
  // On the grass outside the bend after the greenhouse, facing the racers coming down it.
  { id: 'wd45', c: [83.3, 106.4], heading: 142 },
];

/** A footprint (map metres) a kart can't drive through, for the farm's drive mode. */
export function tractorFootprint(s: (typeof TRACTOR_SPOTS)[number]): {
  c: XY;
  w: number;
  h: number;
  angle: number;
} {
  const z = TRACTOR_SIZE[s.id];
  return { c: s.c, w: z.wb + z.fr + z.rr, h: 2 * (z.rx + z.rw / 2), angle: s.heading };
}

/** Is a map point under a parked tractor (with a margin)? For clearing the pumpkins. */
export function underTractor(x: number, y: number, margin = 0.5): boolean {
  for (const s of TRACTOR_SPOTS) {
    const f = tractorFootprint(s);
    const a = (f.angle * Math.PI) / 180;
    const dx = x - f.c[0],
      dy = y - f.c[1];
    const u = dx * Math.cos(a) + dy * Math.sin(a),
      v = -dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(u) < f.w / 2 + margin && Math.abs(v) < f.h / 2 + margin) return true;
  }
  return false;
}
