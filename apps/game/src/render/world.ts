import * as THREE from 'three';
import type { Track } from '@epic/sim';
import { Effects } from './effects.ts';
import { patchScene } from './look.ts';
import { Terrain, buildClouds, buildFoliage, buildGrandstand, buildSky, buildTerrain } from './scenery.ts';
import { buildTrackMesh } from './trackMesh.ts';

export const SUN_DIR = new THREE.Vector3(0.35, 0.82, -0.3).normalize();

/** Everything static in a race scene, plus the sun and shared effects. */
export class World {
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  readonly fx = new Effects();
  readonly terrain: Terrain;

  constructor(track: Track, renderer: THREE.WebGLRenderer) {
    const s = this.scene;
    s.fog = new THREE.Fog(0xcfe6f7, 260, 2200);
    const sky = buildSky();
    s.add(sky);

    // Image-based light from the sky, for paint and chrome reflections.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(buildSky());
    const ground = new THREE.Mesh(new THREE.CircleGeometry(3000, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4a6b32 }));
    ground.position.y = -20;
    envScene.add(ground);
    s.environment = pmrem.fromScene(envScene, 0.02).texture;
    s.environmentIntensity = 0.55;

    s.add(new THREE.HemisphereLight(0xcfe3ff, 0x4d5e33, 1.1));
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera;
    c.left = -45;
    c.right = 45;
    c.top = 45;
    c.bottom = -45;
    c.near = 1;
    c.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    s.add(this.sun, this.sun.target);

    this.terrain = new Terrain(track);
    s.add(buildTerrain(this.terrain));
    s.add(buildTrackMesh(track));
    s.add(buildFoliage(this.terrain));
    s.add(buildGrandstand(track));
    s.add(buildClouds(this.terrain));
    s.add(this.fx.group);
    patchScene(s);
  }

  /** Centre the shadow frustum on a point (per viewport). */
  focusSun(p: THREE.Vector3): void {
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(SUN_DIR, 200);
    this.sun.target.updateMatrixWorld();
  }
}
