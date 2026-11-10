import * as THREE from 'three';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ragMaterial } from './horse.ts';
import { DETAIL, MAT, type VehicleModel } from './modelKit.ts';
import nazgulGlb from './models/nazgul.glb?inline';
import { wraithCloak } from './nazgul.ts';

/**
 * Vehicles modelled, rigged and animated in Blender (see tools/blender), as opposed to the
 * ones built from code. The .glb carries the skinned meshes, the skeleton and the clips;
 * materials are matched by name to the game's own, so both kinds share one look.
 *
 * Models ride inside the script as data, so there is nothing extra to host or fetch.
 */

const loaded = new Map<string, GLTF>();

function bytes(dataUri: string): ArrayBuffer {
  const bin = atob(dataUri.slice(dataUri.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Parse the bundled models once, before any vehicle is built. Never throws. */
export async function preloadRigged(): Promise<void> {
  try {
    loaded.set('nazgul', await new GLTFLoader().parseAsync(bytes(nazgulGlb), ''));
  } catch (e) {
    console.warn('Blender Nazgûl failed to load; using the code-built one.', e);
  }
}

export const hasRigged = (id: string): boolean => loaded.has(id);

let shared: Record<string, THREE.Material> | null = null;
/** The game's materials for each material name used in the Blender file. */
function nazgulMaterials(): Record<string, THREE.Material> {
  const coat = DETAIL.coat(0x16161b);
  return (shared ??= {
    coat,
    hair: coat,
    hoof: MAT.paint(0x141416, 0.55, 0.3),
    rag: ragMaterial(0x121216),
    eye: MAT.glow(0xff2a10, 3),
    dark: MAT.paint(0x050505, 0.9, 0),
    steel: DETAIL.steel(),
    leather: MAT.paint(0x2a1d16, 0.6, 0.1),
    robe: DETAIL.fabric(0x1a1a20),
    hood: DETAIL.fabric(0x17171c),
    void: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    blade: new THREE.MeshStandardMaterial({
      color: 0xd7dce6,
      metalness: 1,
      roughness: 0.12,
      emissive: 0x2a3550,
      emissiveIntensity: 0.6,
    }),
    grip: MAT.paint(0x111111, 0.8, 0),
  });
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const tmp = new THREE.Vector3();

/**
 * The Nazgûl from Blender: one skinned horse and rider playing an "Idle" and a "Gallop" clip,
 * blended by speed. The cloak stays procedural (it answers to speed) and hangs from the
 * rider's shoulders wherever the animation carries them.
 */
export function nazgulRigged(accent: number): VehicleModel {
  const gltf = loaded.get('nazgul')!;
  const root = new THREE.Group() as VehicleModel;
  const body = new THREE.Group();
  const scene = cloneSkinned(gltf.scene);
  body.add(scene);

  const mats = nazgulMaterials();
  let shoulders: THREE.Object3D | null = null;
  scene.traverse((o) => {
    if (o.name === 'r_head') shoulders = o;
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const name = (m.material as THREE.Material).name;
    m.material = name === 'trim' ? MAT.glow(accent, 1.2) : (mats[name] ?? m.material);
    m.castShadow = name !== 'rag';
    m.receiveShadow = true;
    // The skeleton moves the mesh well outside its rest-pose bounds.
    m.frustumCulled = false;
  });

  const cloak = wraithCloak();
  cloak.mesh.castShadow = false;
  body.add(cloak.mesh);

  const mixer = new THREE.AnimationMixer(scene);
  const clip = (name: string) =>
    mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, name)!);
  const idle = clip('Idle').play();
  const gallop = clip('Gallop').play();
  idle.time = Math.random() * idle.getClip().duration;
  gallop.time = Math.random();
  let gait = 0;

  const animate = (t: number, speed: number, dt: number): void => {
    const v = Math.abs(speed);
    // Standing -> a collected canter -> the full gallop.
    const target = v > 0.8 ? Math.min(1, 0.35 + v / 18) : 0;
    gait += (target - gait) * Math.min(1, dt * 4);
    idle.setEffectiveWeight(1 - gait);
    gallop.setEffectiveWeight(gait);
    // Strides a second (the clip is one stride); played backwards when backing up.
    gallop.timeScale = Math.min(2.6, 0.6 + v / 5) * (speed < -0.8 ? -1 : 1);
    mixer.update(dt);
    if (shoulders) {
      shoulders.getWorldPosition(tmp);
      body.worldToLocal(tmp);
      cloak.mesh.position.set(tmp.x, tmp.y + 0.02, tmp.z + 0.1);
    }
    cloak.update(t, speed, dt);
  };
  root.add(body);
  animate(0, 0, 0);

  root.userData = {
    body,
    wheels: [],
    exhausts: [],
    hover: false,
    ghost: true,
    camHeight: 3.7,
    rear: [V(-0.2, 0.05, 0.75), V(0.2, 0.05, 0.75)],
    animate,
  };
  return root;
}
