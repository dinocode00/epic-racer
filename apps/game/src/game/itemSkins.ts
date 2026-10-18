import type { ItemKind, SpecialKind } from '@epic/sim';

/** How each item looks and is named. Every film track reskins the shared mechanics. */
export interface ItemSkin {
  icon: string;
  name: string;
}

const MIDDLE_EARTH: Record<ItemKind, ItemSkin> = {
  boost: { icon: '🍞', name: 'Lembas' },
  boost3: { icon: '🍞', name: 'Lembas ×3' },
  shot: { icon: '🏹', name: 'Elven arrows' },
  homing: { icon: '🎆', name: 'Dragon firework' },
  trap: { icon: '✴️', name: 'Orc caltrops' },
  shield: { icon: '🛡️', name: 'Mithril' },
  whip: { icon: '🔥', name: "Balrog's whip" },
  eagle: { icon: '🦅', name: 'Great Eagle' },
  special: { icon: '⭐', name: 'Special' },
};

const GENERIC: Record<ItemKind, ItemSkin> = {
  boost: { icon: '⚡', name: 'Boost' },
  boost3: { icon: '⚡', name: 'Boost ×3' },
  shot: { icon: '➤', name: 'Shot' },
  homing: { icon: '🎯', name: 'Homing shot' },
  trap: { icon: '✴️', name: 'Trap' },
  shield: { icon: '🛡️', name: 'Shield' },
  whip: { icon: '🔥', name: 'Leader strike' },
  eagle: { icon: '🦅', name: 'Great Eagle' },
  special: { icon: '⭐', name: 'Special' },
};

export const SPECIAL_NAMES: Record<SpecialKind, ItemSkin> = {
  morgul: { icon: '🗡️', name: 'Morgul Charge' },
  flame: { icon: '🔥', name: 'Flame Vent' },
  missile: { icon: '🚀', name: 'Batmissile' },
  jacks: { icon: '🅰️', name: 'Auto-Jacks + Robot' },
};

export function itemSkin(trackId: string, kind: ItemKind, special?: SpecialKind): ItemSkin {
  if (kind === 'special' && special) return SPECIAL_NAMES[special];
  return (trackId === 'middleEarth' ? MIDDLE_EARTH : GENERIC)[kind];
}

/** Icons cycled during the roulette. */
export const ROULETTE: ItemKind[] = [
  'boost',
  'shot',
  'homing',
  'trap',
  'shield',
  'special',
  'eagle',
  'whip',
];
