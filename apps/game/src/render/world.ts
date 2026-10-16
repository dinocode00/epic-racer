import * as THREE from 'three';
import type { Track } from '@epic/sim';
import { Effects } from './effects.ts';
import { patchScene } from './look.ts';
import {
  Terrain,
  buildClouds,
  buildFoliage,
  buildGrandstand,
  buildSky,
  buildTerrain,
} from './scenery.ts';
import { PROVING_THEME, type Theme } from './themes.ts';
import { buildTrackMesh } from './trackMesh.ts';

/** Everything static in a race scene, plus the sun and shared effects. */
export class World {
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  readonly fx = new Effects();
  readonly terrain: Terrain;
  private animate?: (t: number, dt: number) => void;
  private t = 0;

  constructor(
    track: Track,
    renderer: THREE.WebGLRenderer,
    readonly theme: Theme = PROVING_THEME,
  ) {
    const s = this.scene;
    s.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far);
    const sky = buildSky(theme.sky.top, theme.sky.horizon, theme.sunDir);
    s.add(sky);

    // Image-based light from the sky, for paint and chrome reflections.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(buildSky(theme.sky.top, theme.sky.horizon, theme.sunDir));
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3000, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x4a6b32 }),
    );
    ground.position.y = -20;
    envScene.add(ground);
    s.environment = pmrem.fromScene(envScene, 0.02).texture;
    s.environmentIntensity = 0.55;

    s.add(new THREE.HemisphereLight(theme.hemi.sky, theme.hemi.ground, theme.hemi.intensity));
    this.sun = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
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

    this.terrain = new Terrain(track, theme.terrain(track));
    s.add(buildTerrain(this.terrain, theme.terrainLook));
    s.add(buildTrackMesh(track, theme.road(track)));
    s.add(buildFoliage(this.terrain, { ...theme.foliage, keepOut: theme.keepOut?.(track) }));
    if (theme.grandstand) s.add(buildGrandstand(track));
    if (theme.clouds) s.add(buildClouds(this.terrain));
    if (theme.dress) {
      const props = new THREE.Group();
      this.animate = theme.dress({ scene: props, track, terrain: this.terrain }) ?? undefined;
      s.add(props);
    }
    s.add(this.fx.group);
    patchScene(s);
  }

  /** Per-frame animation of props (mill wheels, water...). */
  update(dt: number): void {
    this.t += dt;
    this.animate?.(this.t, dt);
  }

  /** Centre the shadow frustum on a point (per viewport). */
  focusSun(p: THREE.Vector3): void {
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(this.theme.sunDir, 200);
    this.sun.target.updateMatrixWorld();
  }
}
