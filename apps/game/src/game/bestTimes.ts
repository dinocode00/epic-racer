/**
 * The best times board (⏱ the 5 fastest race times on each track, for each number of laps).
 * Saved by the laptop's server in saves/best-times.json, so it lasts between sessions; this
 * browser keeps a copy too, so couch mode without the server still remembers (and hands its
 * times to the server the next time there is one).
 */
import {
  type BestTime,
  type BestTimes,
  addTimes,
  bestTimesKey,
  mergeBestTimes,
} from '@epic/shared';

const KEY = 'epic-racer-best-times';
const esc = (t: string) =>
  t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface Run {
  name: string;
  vehicle: string;
  time: number;
}

export class BestTimesBoard {
  private board: BestTimes = {};

  constructor(private changed: () => void) {
    try {
      this.board = mergeBestTimes({}, JSON.parse(localStorage.getItem(KEY) ?? '{}'));
    } catch {
      this.board = {};
    }
    void this.sync(this.board);
  }

  /** Swap boards with the server (ours may hold times set while it wasn't there). */
  private async sync(send: BestTimes): Promise<void> {
    try {
      const r = await fetch('/api/times', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(send),
      });
      if (!r.ok) return;
      this.board = mergeBestTimes(this.board, await r.json());
      this.save();
      this.changed();
    } catch {
      // No server (couch mode): this browser's copy is all there is.
    }
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.board));
    } catch {
      // Private window or storage full: the server's file still has them.
    }
  }

  top(track: string, laps: number): BestTime[] {
    return this.board[bestTimesKey(track, laps)] ?? [];
  }

  /** Add the players' finishing times; returns the ones that made the board. */
  record(track: string, laps: number, runs: Run[]): BestTime[] {
    const at = Date.now();
    const fresh = runs
      .filter((r) => Number.isFinite(r.time) && r.time > 0)
      .map((r, i) => ({ ...r, at: at + i }));
    if (!fresh.length) return [];
    const key = bestTimesKey(track, laps);
    this.board[key] = addTimes(this.board[key] ?? [], fresh);
    this.save();
    void this.sync({ [key]: this.board[key]! });
    return this.board[key]!.filter((t) => t.at >= at);
  }

  /** "⏱ Record 92.31s · Rex" for the lobby, or '' when there's none yet. */
  recordLine(track: string, laps: number): string {
    const best = this.top(track, laps)[0];
    return best ? `⏱ Record <b>${best.time.toFixed(2)}s</b> · ${esc(best.name)}` : '';
  }

  /** The board for the results screen, with the times just set marked NEW. */
  html(track: string, trackName: string, laps: number, fresh: BestTime[]): string {
    const list = this.top(track, laps);
    const rows = list.length
      ? list
          .map((t, i) => {
            const isNew = fresh.some((f) => f.at === t.at && f.name === t.name);
            const day = new Date(t.at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            return `<div class="row ${isNew ? 'new' : ''}"><span>${i + 1}</span><span>${esc(t.name)} · ${esc(t.vehicle)}${isNew ? ' <b class="new-tag">NEW!</b>' : ''}</span><span>${t.time.toFixed(2)}s</span><span class="day">${day}</span></div>`;
          })
          .join('')
      : '<div class="none">No times yet: finish a race to set one.</div>';
    return `<div class="best-times"><h3>⏱ BEST TIMES · ${esc(trackName)} · ${laps} lap${laps === 1 ? '' : 's'}</h3>${rows}</div>`;
  }
}
