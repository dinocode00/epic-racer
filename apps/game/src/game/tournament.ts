import { TRACKS } from './tracks.ts';

/**
 * Tournament: a cup of races over every track (starting with the one picked in the lobby; the
 * gray-box test track only if it's the one picked). Points after each race by finishing place,
 * standings shown between races, and a champion and podium at the end. The same AI racers
 * (same names and rides) run every race, so they're in the standings too.
 */

/** Points by finishing place, 1st to 8th. */
export const POINTS = [15, 12, 10, 8, 6, 4, 2, 1];

export interface Finisher {
  name: string;
  color: string;
  vehicle: string;
  human: boolean;
  time: number;
}

interface Entry {
  name: string;
  color: string;
  vehicle: string;
  human: boolean;
  points: number;
  /** Place in the standings before the latest race (for the up/down arrows). */
  before: number;
  /** Finishing place in each race so far (for breaking ties: more wins first). */
  places: number[];
}

export class Tournament {
  readonly tracks: string[];
  /** Index of the race being run (or just finished). */
  race = 0;
  private table = new Map<string, Entry>();
  /** Points just won, by name (for the results screen). */
  private gained = new Map<string, number>();

  /** `races`: how many races (0 = every track). */
  constructor(startTrack: string, races = 0) {
    const ids = TRACKS.map((t) => t.def.id).filter((id) => id !== 'proving' || id === startTrack);
    const i = Math.max(0, ids.indexOf(startTrack));
    const all = [...ids.slice(i), ...ids.slice(0, i)];
    this.tracks = races > 0 ? all.slice(0, Math.min(races, all.length)) : all;
  }

  get trackId(): string {
    return this.tracks[this.race]!;
  }
  get last(): boolean {
    return this.race >= this.tracks.length - 1;
  }

  /** Score a finished race (finishing order, first to last). */
  score(order: Finisher[]): void {
    const before = this.standings().map((e) => e.name);
    this.gained.clear();
    order.forEach((r, i) => {
      const e: Entry = this.table.get(r.name) ?? {
        name: r.name,
        color: r.color,
        vehicle: r.vehicle,
        human: r.human,
        points: 0,
        before: 0,
        places: [],
      };
      e.color = r.color;
      e.vehicle = r.vehicle;
      e.before = before.indexOf(r.name);
      const pts = POINTS[i] ?? 0;
      e.points += pts;
      e.places.push(i + 1);
      this.gained.set(r.name, pts);
      this.table.set(r.name, e);
    });
  }

  next(): void {
    this.race++;
  }

  /** Overall standings: most points, then most wins, seconds..., then the latest race. */
  standings(): Entry[] {
    return [...this.table.values()].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      for (let p = 1; p <= 8; p++) {
        const d = b.places.filter((x) => x === p).length - a.places.filter((x) => x === p).length;
        if (d) return d;
      }
      return (a.places[a.places.length - 1] ?? 9) - (b.places[b.places.length - 1] ?? 9);
    });
  }

  /** The between-races (or final) screen. */
  html(order: Finisher[], trackName: (id: string) => string, hint: string): string {
    const S = this.standings();
    const race = order
      .map(
        (r, i) =>
          `<div class="row ${r.human ? 'human' : ''}"><span>${i + 1}</span><span><i class="sw" style="background:${r.color}"></i>${r.name}</span><span>${Number.isNaN(r.time) ? '--' : r.time.toFixed(2) + 's'}</span><span class="pts">+${this.gained.get(r.name) ?? 0}</span></div>`,
      )
      .join('');
    const table = S.map((e, i) => {
      const move =
        this.race === 0 || e.before < 0 || e.before === i
          ? '<i class="mv"></i>'
          : e.before > i
            ? '<i class="mv up">▲</i>'
            : '<i class="mv down">▼</i>';
      return `<div class="row ${e.human ? 'human' : ''} ${this.last && i < 3 ? 'podium p' + (i + 1) : ''}"><span>${i + 1}</span><span>${move}<i class="sw" style="background:${e.color}"></i>${e.name}</span><span class="pts">${e.points}</span></div>`;
    }).join('');
    const dots = this.tracks
      .map(
        (id, i) =>
          `<span class="cup-dot ${i < this.race ? 'done' : i === this.race ? 'now' : ''}">${trackName(id)}</span>`,
      )
      .join('<span class="cup-sep">›</span>');
    const champ = S[0]!;
    const head = this.last
      ? `<div class="champion"><div class="trophy">🏆</div><div><div class="ch-label">TOURNAMENT CHAMPION</div><div class="ch-name" style="color:${champ.human ? champ.color : 'var(--gold)'}">${champ.name}</div><div class="ch-pts">${champ.points} points</div></div></div>`
      : `<h2>RACE ${this.race + 1} OF ${this.tracks.length} · ${trackName(this.trackId).toUpperCase()}</h2>`;
    return `<div class="cup ${this.last ? 'final' : ''}">
      ${head}
      <div class="cup-path">${dots}</div>
      <div class="cup-cols">
        <div class="cup-col"><h3>${this.last ? 'FINAL RACE' : 'THIS RACE'}</h3>${race}</div>
        <div class="cup-col"><h3>${this.last ? 'FINAL STANDINGS' : 'STANDINGS'}</h3>${table}</div>
      </div>
      <div class="hint">${hint}</div>
    </div>`;
  }
}
