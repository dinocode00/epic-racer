/**
 * The best times board: the 5 fastest race times on each track (for each number of laps),
 * kept across sessions. The laptop's server saves it to a file (saves/best-times.json); the
 * game keeps a copy in the browser too, for couch mode without the server.
 */
export interface BestTime {
  name: string;
  vehicle: string;
  /** Race time (s). */
  time: number;
  /** When it was set (ms since 1970). */
  at: number;
}
/** Track and laps ("farm:3") → its fastest times, quickest first. */
export type BestTimes = Record<string, BestTime[]>;

export const BEST_TIMES_KEPT = 5;
export const bestTimesKey = (track: string, laps: number) => `${track}:${laps}`;

const valid = (e: unknown): e is BestTime => {
  const t = e as BestTime;
  return (
    !!t &&
    typeof t.name === 'string' &&
    typeof t.vehicle === 'string' &&
    typeof t.time === 'number' &&
    Number.isFinite(t.time) &&
    t.time > 0 &&
    typeof t.at === 'number'
  );
};

/** Put times into one track's list: quickest first, the top 5, no repeats of the same run. */
export function addTimes(list: BestTime[], times: unknown[]): BestTime[] {
  const all = [...list, ...times.filter(valid)].map((t) => ({
    name: t.name.slice(0, 24),
    vehicle: t.vehicle.slice(0, 40),
    time: Math.round(t.time * 1000) / 1000,
    at: t.at,
  }));
  const seen = new Set<string>();
  return all
    .sort((a, b) => a.time - b.time || a.at - b.at)
    .filter((t) => {
      const id = `${t.name}|${t.time}|${t.at}`;
      return !seen.has(id) && !!seen.add(id);
    })
    .slice(0, BEST_TIMES_KEPT);
}

/** Two boards together (e.g. the server's and this browser's). */
export function mergeBestTimes(a: BestTimes, b: unknown): BestTimes {
  const out: BestTimes = { ...a };
  if (b && typeof b === 'object')
    for (const [key, list] of Object.entries(b as Record<string, unknown>))
      if (/^[\w-]{1,40}:\d{1,2}$/.test(key) && Array.isArray(list))
        out[key] = addTimes(out[key] ?? [], list);
  return out;
}
