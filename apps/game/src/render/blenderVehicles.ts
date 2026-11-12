import * as THREE from 'three';
import { MAT, type VehicleModel, pilot } from './modelKit.ts';
import { blenderModel } from './rigged.ts';

/**
 * Racing vehicles modelled in Blender (tools/blender/podracer.py, ...), as opposed to the
 * ones built from code. Each .glb holds:
 *   - "body": everything rigid, with its soft shadows baked into vertex colour;
 *   - "wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR": each wheel centred on its axle;
 *   - "fan_*": parts that spin about their own forward axis (the pod's intake fans);
 *   - empties "exhaust_*" (boost flames) and "rear_*" (drift sparks and dust).
 * Colours, roughness and metalness come from Blender; a few materials are swapped by name
 * for the game's own (the player's accent colour, glass, chrome and anything that glows).
 */

interface Spec {
  /** The Blender file (rigged.ts loads it). */
  file: string;
  hover: boolean;
  camHeight?: number;
  /** Idle and per-(m/s) spin of the fans, radians a second. */
  fanSpin?: [number, number];
  /** A driver the game seats (open cockpits): its style and where, in the game's coordinates. */
  driver?: { style: Parameters<typeof pilot>[0]; at: [number, number, number] };
}

const SPECS: Record<string, Spec> = {
  pod: { file: 'podracer', hover: true, fanSpin: [9, 2.2] },
  corolla: { file: 'corolla', hover: false },
  landcruiser: { file: 'landcruiser', hover: false, camHeight: 2.1 },
  mach5: { file: 'mach5', hover: false, driver: { style: 'speed', at: [0, 1.12, 0.4] } },
};

const WHEELS = ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'];

/** Materials that glow: drawn unlit by the game, no baked shading, no shadow. */
function glowing(name: string, accent: number): THREE.Material | null {
  switch (name) {
    case 'accent':
      return MAT.glow(accent, 1.2);
    case 'glow':
      return MAT.glow(0x6fd0ff, 2.5);
    case 'lamp':
      return MAT.glow(0xfff4d6, 1.4);
    case 'tail':
      return MAT.glow(0xd01818, 1.6);
    case 'amber':
      return MAT.glow(0xff8a1a, 1);
    case 'reverse':
      return MAT.glow(0xf2f2ea, 0.5);
    case 'binder':
      return new THREE.MeshBasicMaterial({
        color: 0x9fe6ff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    default:
      return null;
  }
}

/** Shiny materials the game makes its own way (reflections tuned for its environment map). */
function special(name: string): THREE.MeshStandardMaterial | null {
  if (name === 'glass' || name === 'lens') return MAT.glass();
  if (name === 'chrome') return MAT.chrome();
  return null;
}

export const isBlenderVehicle = (id: string): boolean =>
  !!SPECS[id] && !!blenderModel(SPECS[id].file);

/** The Blender-built vehicle `id`, or null if there is none (or its file failed to load). */
export function blenderVehicle(id: string, accent: number): VehicleModel | null {
  const spec = SPECS[id];
  const gltf = spec && blenderModel(spec.file);
  if (!spec || !gltf) return null;
  const root = new THREE.Group() as VehicleModel;
  const body = new THREE.Group();
  const scene = gltf.scene.clone(true);
  body.add(scene);

  const made = new Map<string, THREE.Material>();
  const dress = (m: THREE.Mesh) => {
    const own = m.material as THREE.MeshStandardMaterial;
    const name = own.name;
    const glow = made.get(name) ?? glowing(name, accent);
    if (glow) {
      made.set(name, glow);
      m.material = glow;
      m.castShadow = false;
      m.receiveShadow = false;
      return;
    }
    const shiny = special(name);
    if (shiny) {
      // Keep the baked shading on chrome and glass too.
      shiny.vertexColors = !!m.geometry.attributes.color;
      m.material = shiny;
    }
    m.castShadow = true;
    m.receiveShadow = true;
  };

  const exhausts: THREE.Vector3[] = [];
  const rear: THREE.Vector3[] = [];
  const fans: THREE.Object3D[] = [];
  const wheels: THREE.Object3D[] = [];
  for (const node of [...scene.children]) {
    node.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) dress(o as THREE.Mesh);
    });
    if (node.name.startsWith('exhaust')) exhausts.push(node.position.clone());
    else if (node.name.startsWith('rear')) rear.push(node.position.clone());
    else if (node.name.startsWith('fan')) fans.push(node);
  }
  // Wheels ride on the root (the body leans and bobs above them), fronts first.
  for (const name of WHEELS) {
    const w = scene.getObjectByName(name);
    if (!w) continue;
    root.add(w);
    wheels.push(w);
  }
  exhausts.sort((a, b) => a.x - b.x);
  rear.sort((a, b) => a.x - b.x);

  if (spec.driver) {
    const d = pilot(spec.driver.style);
    d.position.set(...spec.driver.at);
    d.traverse((o) => {
      o.castShadow = true;
    });
    body.add(d);
  }

  let spin = 0;
  const [idle, perSpeed] = spec.fanSpin ?? [0, 0];
  root.add(body);
  root.userData = {
    body,
    wheels,
    exhausts,
    hover: spec.hover,
    ...(rear.length ? { rear } : {}),
    ...(spec.camHeight ? { camHeight: spec.camHeight } : {}),
    ...(fans.length
      ? {
          animate: (_t: number, speed: number, dt: number) => {
            spin += (idle + Math.abs(speed) * perSpeed) * dt;
            for (const f of fans) f.rotation.z = spin;
          },
        }
      : {}),
  };
  return root;
}
