import { AI_LEVELS } from '@epic/sim';
import { TRACKS } from './tracks.ts';

/**
 * Race settings chosen in the lobby (⚙ Settings): how many AI racers, how good they are, laps
 * per race, and how many races a tournament has. Remembered in this browser between visits.
 */
export interface RaceSettings {
  /** AI racers to fill the grid with (0-7; there are never more than 8 racers in all). */
  ai: number;
  /** AI difficulty: 0 easy, 1 normal, 2 hard, 3 expert. */
  level: number;
  /** Laps per race; 0 = each track's own. */
  laps: number;
  /** Races in a tournament; 0 = every track. */
  cupRaces: number;
}

export const DEFAULT_SETTINGS: RaceSettings = { ai: 7, level: 1, laps: 0, cupRaces: 0 };
export const MAX_RACERS = 8;
const KEY = 'epic-racer-settings';

export function loadSettings(): RaceSettings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<RaceSettings>;
    return { ...DEFAULT_SETTINGS, ...s };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: RaceSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage blocked (private window): the settings just last for this visit.
  }
}

const LEVEL_NOTES = [
  'The AI eases off: you can catch them.',
  'A fair race.',
  'The AI drives nearly flat out.',
  'The AI drives flat out and fights back when it falls behind.',
];

/** Tracks a tournament can use (the gray-box test track only if it's the one picked). */
export const cupTrackCount = (): number => TRACKS.filter((t) => t.def.id !== 'proving').length;

export interface SettingRow {
  key: keyof RaceSettings;
  label: string;
  /** The value as shown, and a line explaining it. */
  value: (s: RaceSettings, humans: number) => string;
  note: (s: RaceSettings, humans: number) => string;
  /** Step the setting one way or the other (wrapping round). */
  step: (s: RaceSettings, dir: number) => void;
}

const wrap = (v: number, lo: number, hi: number) => (v < lo ? hi : v > hi ? lo : v);

export const SETTING_ROWS: SettingRow[] = [
  {
    key: 'ai',
    label: 'AI racers',
    value: (s) => (s.ai === 0 ? 'None' : String(s.ai)),
    note: (s, humans) => {
      const n = Math.min(s.ai, MAX_RACERS - Math.max(1, humans));
      const total = n + Math.max(1, humans);
      return s.ai === 0
        ? 'Just the players: no computer racers.'
        : `${total} racers in all with ${Math.max(1, humans)} player${humans > 1 ? 's' : ''} (up to ${MAX_RACERS}).`;
    },
    step: (s, d) => (s.ai = wrap(s.ai + d, 0, MAX_RACERS - 1)),
  },
  {
    key: 'level',
    label: 'AI skill',
    value: (s) => AI_LEVELS[s.level] ?? 'Normal',
    note: (s) => LEVEL_NOTES[s.level] ?? '',
    step: (s, d) => (s.level = wrap(s.level + d, 0, AI_LEVELS.length - 1)),
  },
  {
    key: 'laps',
    label: 'Laps per race',
    value: (s) => (s.laps === 0 ? "Track's own" : String(s.laps)),
    note: (s) =>
      s.laps === 0
        ? 'Each track sets its own: ' +
          TRACKS.map((t) => `${t.def.name} ${t.def.laps}`).join(', ') +
          '.'
        : `Every race is ${s.laps} lap${s.laps > 1 ? 's' : ''}.`,
    step: (s, d) => (s.laps = wrap(s.laps + d, 0, 5)),
  },
  {
    key: 'cupRaces',
    label: 'Tournament races',
    value: (s) => (s.cupRaces === 0 ? 'Every track' : String(s.cupRaces)),
    note: (s) =>
      s.cupRaces === 0
        ? 'A tournament races every track once, starting with the one picked.'
        : `A tournament is ${s.cupRaces} races, starting with the track picked.`,
    step: (s, d) => {
      // All the tracks, or two, three... up to one fewer than all.
      const opts = [
        0,
        ...Array.from({ length: Math.max(0, cupTrackCount() - 2) }, (_, i) => i + 2),
      ];
      const i = Math.max(0, opts.indexOf(s.cupRaces));
      s.cupRaces = opts[(i + d + opts.length) % opts.length]!;
    },
  },
];
