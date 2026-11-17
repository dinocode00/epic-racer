import * as THREE from 'three';
import { blenderModel } from '../render/rigged.ts';
import { meshHeight } from './ground.ts';
import { TRACTOR_SIZE, TRACTOR_SPOTS, type TractorId } from './tractorSpots.ts';

/**
 * Grandpa's two old tractors, modelled in Blender from photos and the factory specs
 * (tools/blender/tractors.py): a 1954 Allis-Chalmers WD45 in Persian Orange and a 1953 J.I.
 * Case SC in Flambeau Red. One is parked in the pumpkin patch beside the hay wagon the road
 * jumps over; the other beside the road past the greenhouse, before it runs into the Christmas
 * tree forest. Copies of both stand in the dark barn as black silhouettes, astride the opening
 * the road dives through, so the racers drive underneath them.
 *
 * Real metres; the models face -Z, sit on y = 0 and are centred between the axles.
 */

/** A fresh copy of one tractor from the Blender file, at the origin; null if it didn't load. */
export function tractorModel(id: TractorId): THREE.Object3D | null {
  const node = blenderModel('tractors')?.scene.getObjectByName(id);
  if (!node) return null;
  const o = node.clone(true);
  o.position.set(0, 0, 0);
  o.rotation.set(0, 0, 0);
  o.name = `tractor-${id}`;
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

/** A map direction (degrees from east) as the yaw of something that faces -Z. */
const yawOf = (deg: number) => {
  const phi = (deg * Math.PI) / 180;
  return Math.atan2(-Math.cos(phi), Math.sin(phi));
};

/**
 * Both tractors parked on the farm (in the farm group's real metres), each settled on the
 * ground under its wheels: pitched and rolled to the slope.
 */
export function parkedTractors(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'tractors';
  for (const s of TRACTOR_SPOTS) {
    const o = tractorModel(s.id);
    if (!o) continue;
    const z = TRACTOR_SIZE[s.id];
    const yaw = yawOf(s.heading);
    // Ground under the wheels: front (local -z) and rear (+z), left (-x) and right (+x).
    const at = (lx: number, lz: number) => {
      const x = s.c[0] + lx * Math.cos(yaw) + lz * Math.sin(yaw);
      const y = s.c[1] - (-lx * Math.sin(yaw) + lz * Math.cos(yaw));
      return meshHeight(x, y);
    };
    const fl = at(-z.fx, -z.wb / 2),
      fr = at(z.fx, -z.wb / 2),
      rl = at(-z.rx, z.wb / 2),
      rr = at(z.rx, z.wb / 2);
    o.rotation.order = 'YXZ';
    o.rotation.y = yaw;
    o.rotation.x = Math.atan2((fl + fr) / 2 - (rl + rr) / 2, z.wb);
    o.rotation.z = Math.atan2(rr - rl, 2 * z.rx);
    o.position.set(s.c[0], (fl + fr + rl + rr) / 4 - 0.02, -s.c[1]);
    o.userData.tractor = s.id;
    g.add(o);
  }
  return g;
}

let silhouetteMat: THREE.Material | null = null;
/**
 * Black, unlit, with a faint warm rim where a surface turns away from the eye, as if caught
 * by the daylight through the cracks between the boards behind it.
 */
function silhouette(): THREE.Material {
  if (silhouetteMat) return silhouetteMat;
  const m = new THREE.MeshBasicMaterial({ color: 0x050302, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRimN;\nvarying vec3 vRimV;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvRimN = normalize(normalMatrix * normal);\nvRimV = -mvPosition.xyz;',
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRimN;\nvarying vec3 vRimV;')
      .replace(
        '#include <opaque_fragment>',
        `float rim = 1.0 - abs(dot(normalize(vRimN), normalize(vRimV)));
outgoingLight += vec3(0.42, 0.27, 0.13) * pow(rim, 4.0);
#include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'tractor-silhouette';
  return (silhouetteMat = m);
}

/** How much bigger than life the silhouettes in the barn are, so a racer fits under them. */
export const SILHOUETTE_SCALE = 2.25;

/**
 * The two tractors as silhouettes in the barn (barn-local metres: x along the barn, y up, z
 * across), parked crosswise over the floor opening the road dives through: each one's front
 * wheels on the floor on one side of it, its rear wheels on the other, the gap between its
 * tyres over the opening. `hole` is the opening (x0..x1 along, z0..z1 across), `floor` the
 * upper floor's height; `at` the centre of each along the barn, WD45 first.
 */
export function barnSilhouettes(
  hole: { x0: number; x1: number; z0: number; z1: number },
  floor: number,
  at: [number, number],
): THREE.Group {
  const g = new THREE.Group();
  g.name = 'tractor-silhouettes';
  const k = SILHOUETTE_SCALE;
  const zc = (hole.z0 + hole.z1) / 2;
  (['wd45', 'sc'] as const).forEach((id, i) => {
    const o = tractorModel(id);
    if (!o) return;
    const z = TRACTOR_SIZE[id];
    o.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = silhouette();
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    // The WD45 faces across the barn one way (nose to +z), the Case the other.
    const nose = i === 0 ? 1 : -1;
    // The middle of the gap between the front tyre and the rear tyre, from the tractor's centre
    // toward its nose, goes over the middle of the opening.
    const gap = ((z.rr - z.fr) / 2) * k;
    o.scale.setScalar(k);
    o.rotation.y = nose > 0 ? Math.PI : 0;
    o.position.set(at[i]!, floor, zc - nose * gap);
    g.add(o);
  });
  return g;
}
