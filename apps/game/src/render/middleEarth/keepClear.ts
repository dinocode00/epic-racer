import type { Track } from '@epic/sim';

/**
 * Keeps scenery off the road: nothing may stand within `margin` of the road's edge anywhere on
 * the lap (where the road winds back past itself, a thing beside one stretch can land on
 * another), nor, between the arc lengths in `view`, across the line a driver looks along
 * round the bends.
 */
export function roadKeeper(track: Track, view?: [number, number]) {
  const CELL = 40;
  const grid = new Map<string, { x: number; z: number; hw: number }[]>();
  for (let s = 0; s < track.length; s += 2) {
    const f = track.frameAtS(s);
    const key = `${Math.floor(f.pos.x / CELL)},${Math.floor(f.pos.z / CELL)}`;
    (grid.get(key) ?? grid.set(key, []).get(key)!).push({
      x: f.pos.x,
      z: f.pos.z,
      hw: f.width / 2,
    });
  }
  // Sight lines: from each point of the climb to the road 45 m on.
  const chords: [number, number, number, number][] = [];
  if (view)
    for (let s = view[0]; s < view[1]; s += 3) {
      const a = track.frameAtS(s).pos,
        b = track.frameAtS(s + 45).pos;
      chords.push([a.x, a.z, b.x, b.z]);
    }
  const toSegment = (x: number, z: number, [ax, az, bx, bz]: [number, number, number, number]) => {
    const dx = bx - ax,
      dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(x - ax - dx * t, z - az - dz * t);
  };
  return {
    /** Is a footprint of radius r at (x, z) at least `margin` clear of the road? */
    clear(x: number, z: number, r: number, margin = 3): boolean {
      const reach = r + margin + 10;
      const cx = Math.floor(x / CELL),
        cz = Math.floor(z / CELL),
        n = Math.ceil(reach / CELL);
      for (let i = -n; i <= n; i++)
        for (let j = -n; j <= n; j++)
          for (const p of grid.get(`${cx + i},${cz + j}`) ?? [])
            if (Math.hypot(p.x - x, p.z - z) < p.hw + r + margin) return false;
      return true;
    },
    /** Would it stand across a driver's view round a bend? */
    blocksView(x: number, z: number, r: number): boolean {
      return chords.some((c) => toSegment(x, z, c) < r + 2);
    },
  };
}

export type RoadKeeper = ReturnType<typeof roadKeeper>;
