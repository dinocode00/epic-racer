import * as THREE from 'three';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ragMaterial } from './horse.ts';
import { DETAIL, MAT, type VehicleModel } from './modelKit.ts';
import catGlb from './models/cat.glb?inline';
import corollaGlb from './models/corolla.glb?inline';
import landcruiserGlb from './models/landcruiser.glb?inline';
import nazgulGlb from './models/nazgul.glb?inline';
import podracerGlb from './models/podracer.glb?inline';
import pumpkinsGlb from './models/pumpkins.glb?inline';
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
  if (loaded.size) return;
  for (const [id, glb] of [
    ['nazgul', nazgulGlb],
    ['cat', catGlb],
    ['pumpkins', pumpkinsGlb],
    ['podracer', podracerGlb],
    ['corolla', corollaGlb],
    ['landcruiser', landcruiserGlb],
  ] as const) {
    try {
      loaded.set(id, await new GLTFLoader().parseAsync(bytes(glb), ''));
    } catch (e) {
      console.warn(`Blender model "${id}" failed to load; using the code-built one.`, e);
    }
  }
}

export const hasRigged = (id: string): boolean => loaded.has(id);

/** One of the loaded Blender files, if it loaded. */
export const blenderModel = (id: string): GLTF | undefined => loaded.get(id);

/** A mesh's geometry from one of the loaded Blender files (static models), by mesh name. */
export function modelGeometry(id: string, mesh: string): THREE.BufferGeometry | null {
  let g: THREE.BufferGeometry | null = null;
  loaded.get(id)?.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.name === mesh) g = (o as THREE.Mesh).geometry;
  });
  return g;
}

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

// ---------------------------------------------------------------- barn cats

export type CatState = 'walk' | 'sit' | 'groom';
export interface RiggedCat {
  /** Nose along +x, paws on y = 0 (like the code-built cat it replaces). */
  root: THREE.Group;
  /** Change what it's doing; it eases from one clip to the next. */
  set(state: CatState, walkSpeed?: number): void;
  update(dt: number): void;
}

/**
 * A barn cat from Blender (tools/blender/cat.py), coloured from the model's mask: `coat`
 * overall, `patch` on the chest, muzzle, paws and tail tip, `stripe` for tabby markings (pass
 * the coat colour for none).
 */
export function catRigged(coat: number, patch: number, stripe: number, eyes = 0xb8c23a): RiggedCat {
  const gltf = loaded.get('cat')!;
  const model = cloneSkinned(gltf.scene);
  model.rotation.y = -Math.PI / 2; // the model faces -z; turn its nose to +x
  const root = new THREE.Group();
  root.add(model);
  const C = new THREE.Color(coat),
    P = new THREE.Color(patch),
    S = new THREE.Color(stripe),
    c = new THREE.Color();
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const name = (m.material as THREE.Material).name;
    m.castShadow = true;
    m.frustumCulled = false;
    if (name === 'fur') {
      // This cat's own colours, from the mask: red = patches, green = stripes.
      const g = m.geometry.clone();
      const mask = g.attributes.color!;
      const out = new Float32Array(mask.count * 3);
      for (let i = 0; i < mask.count; i++) {
        c.copy(C).lerp(S, mask.getY(i)).lerp(P, mask.getX(i));
        out.set([c.r, c.g, c.b], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(out, 3));
      m.geometry = g;
      m.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    } else if (name === 'eye') m.material = MAT.glow(eyes, 0.6);
    else if (name === 'pupil') m.material = MAT.paint(0x050505, 0.2, 0);
    else if (name === 'nose') m.material = MAT.paint(0xd99a9a, 0.6, 0);
  });
  const mixer = new THREE.AnimationMixer(model);
  const actions = Object.fromEntries(
    (['Walk', 'Sit', 'Groom'] as const).map((n) => [
      n.toLowerCase(),
      mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, n)!),
    ]),
  ) as Record<CatState, THREE.AnimationAction>;
  for (const a of Object.values(actions)) {
    a.play();
    a.setEffectiveWeight(0);
    a.time = Math.random() * a.getClip().duration;
  }
  let state: CatState = 'sit';
  const weights: Record<CatState, number> = { walk: 0, sit: 1, groom: 0 };
  return {
    root,
    set(s, walkSpeed = 0.35) {
      state = s;
      actions.walk.timeScale = walkSpeed / 0.26; // the clip is one 26 cm stride a second
    },
    update(dt) {
      for (const k of Object.keys(weights) as CatState[]) {
        weights[k] += ((k === state ? 1 : 0) - weights[k]) * Math.min(1, dt * 3.5);
        actions[k].setEffectiveWeight(weights[k]);
      }
      mixer.update(dt);
    },
  };
}
