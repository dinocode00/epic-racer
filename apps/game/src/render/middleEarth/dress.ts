import type { DressContext } from '../themes.ts';
import { dressHobbiton } from './hobbiton.ts';
import { dressLands } from './lands.ts';
import { dressMoria } from './moria.ts';
import { dressMordor } from './mordor.ts';
import { dressPelennor } from './pelennor.ts';

/** Landmarks for every land. */
export function dressMiddleEarth(ctx: DressContext): (t: number, dt: number) => void {
  const hooks = [
    dressHobbiton(ctx),
    dressMoria(ctx),
    dressPelennor(ctx),
    dressMordor(ctx),
    dressLands(ctx),
  ];
  return (t, dt) => hooks.forEach((h) => h(t, dt));
}
