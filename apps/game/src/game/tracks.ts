import type { TrackDef } from '@epic/shared';
import { MIDDLE_EARTH, PROVING, SHIRE } from '@epic/sim';
import { MIDDLE_EARTH_THEME } from '../render/middleEarth/theme.ts';
import { SHIRE_THEME } from '../render/props/shire.ts';
import { PROVING_THEME, type Theme } from '../render/themes.ts';

export interface TrackEntry {
  def: TrackDef;
  theme: Theme;
  /** Short line for the lobby. */
  blurb: string;
}

export const TRACKS: TrackEntry[] = [
  { def: MIDDLE_EARTH, theme: MIDDLE_EARTH_THEME, blurb: 'From Hobbiton to Mordor and back again' },
  { def: SHIRE, theme: SHIRE_THEME, blurb: 'Rolling hills, hobbit holes and a stone bridge' },
  { def: PROVING, theme: PROVING_THEME, blurb: 'Gray-box test track with a loop' },
];

export const trackById = (id: string): TrackEntry =>
  TRACKS.find((t) => t.def.id === id) ?? TRACKS[0]!;
