import type { TrackDef } from '@epic/shared';
import { FARM_MARKS, FARM_TRACK, MIDDLE_EARTH, PROVING, SHIRE } from '@epic/sim';
import DRAFT from '../farm/racetrackDraft.json';
import { FARM_THEME } from '../farm/raceEnv.ts';
import { MIDDLE_EARTH_THEME } from '../render/middleEarth/theme.ts';
import { SHIRE_THEME } from '../render/props/shire.ts';
import { PROVING_THEME, type Theme } from '../render/themes.ts';

export interface TrackEntry {
  def: TrackDef;
  theme: Theme;
  /** Short line for the lobby. */
  blurb: string;
  /**
   * For the map tour: world units per real metre (the farm is built at 1:10, so its "6 ft off
   * the ground" is ten times higher in world units), and the places to name along the way.
   */
  tourScale?: number;
  stops?: { s: number; name: string }[];
}

const ME_NAMES: Record<string, string> = {
  hobbiton: 'Hobbiton',
  weathertop: 'Weathertop',
  rivendell: 'Rivendell',
  moria: 'The Mines of Moria',
  lothlorien: 'Lothlórien',
  argonath: 'The Argonath',
  rohan: 'Rohan',
  pelennor: 'The Pelennor Fields',
  osgiliath: 'Osgiliath',
  mordor: 'Mordor',
  deadMarshes: 'The Dead Marshes',
};

export const TRACKS: TrackEntry[] = [
  {
    def: FARM_TRACK,
    theme: FARM_THEME,
    blurb:
      "Round grandpa's farm: over the house, through the barn, the Christmas trees and the pumpkins",
    tourScale: 10,
    stops: (DRAFT as unknown as { sections: { id: string; name: string }[] }).sections
      .filter((x) => FARM_MARKS[x.id] !== undefined)
      .map((x) => ({ s: FARM_MARKS[x.id]!, name: x.name })),
  },
  {
    def: MIDDLE_EARTH,
    theme: MIDDLE_EARTH_THEME,
    blurb: 'From Hobbiton to Mordor and back again',
    stops: (MIDDLE_EARTH.regions ?? [])
      .slice(0, -1)
      .map(([id, s]) => ({ s, name: ME_NAMES[id] ?? id })),
  },
  { def: SHIRE, theme: SHIRE_THEME, blurb: 'Rolling hills, hobbit holes and a stone bridge' },
  { def: PROVING, theme: PROVING_THEME, blurb: 'Gray-box test track with a loop' },
];

export const trackById = (id: string): TrackEntry =>
  TRACKS.find((t) => t.def.id === id) ?? TRACKS[0]!;
