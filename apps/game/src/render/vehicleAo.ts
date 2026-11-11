import type { BakedAo } from '../farm/buildingsAo.ts';
import batAo from './models/ao/bat.json';
import batImg from './models/ao/bat.jpg?inline';
import corollaAo from './models/ao/corolla.json';
import corollaImg from './models/ao/corolla.jpg?inline';
import deloreanAo from './models/ao/delorean.json';
import deloreanImg from './models/ao/delorean.jpg?inline';
import landcruiserAo from './models/ao/landcruiser.json';
import landcruiserImg from './models/ao/landcruiser.jpg?inline';
import mach5Ao from './models/ao/mach5.json';
import mach5Img from './models/ao/mach5.jpg?inline';
import mysteryAo from './models/ao/mystery.json';
import mysteryImg from './models/ao/mystery.jpg?inline';
import podAo from './models/ao/pod.json';
import podImg from './models/ao/pod.jpg?inline';

/** Each code-built vehicle's soft-shadow bake from Blender: the atlas and its coordinates. */
export const VEHICLE_AO: Record<string, { data: BakedAo; image: string }> = {
  pod: { data: podAo as BakedAo, image: podImg },
  bat: { data: batAo as BakedAo, image: batImg },
  mach5: { data: mach5Ao as BakedAo, image: mach5Img },
  corolla: { data: corollaAo as BakedAo, image: corollaImg },
  landcruiser: { data: landcruiserAo as BakedAo, image: landcruiserImg },
  delorean: { data: deloreanAo as BakedAo, image: deloreanImg },
  mystery: { data: mysteryAo as BakedAo, image: mysteryImg },
};
