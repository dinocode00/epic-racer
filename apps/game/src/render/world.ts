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
import { type Atmosphere, PROVING_THEME, type Theme } from './themes.ts';
import { buildTrackMesh } from './trackMesh.ts';

/** Everything static in a race scene, plus the sun and shared effects. */
export class World {
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  readonly fx = new Effects();
  readonly terrain: Terrain;
  private animate?: (t: number, dt: number) => void;
  private t = 0;
  private sky!: THREE.Mesh;
  private hemi!: THREE.HemisphereLight;
  private track: Track;
  private current?: Atmosphere;

  constructor(
    track: Track,
    renderer: THREE.WebGLRenderer,
    readonly theme: Theme = PROVING_THEME,
  ) {
    const s = this.scene;
    this.track = track;
    s.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far);
    const sky = buildSky(theme.sky.top, theme.sky.horizon, theme.sunDir);
    this.sky = sky;
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

    this.hemi = new THREE.HemisphereLight(theme.hemi.sky, theme.hemi.ground, theme.hemi.intensity);
    s.add(this.hemi);
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
    s.add(buildTerrain(this.terrain, theme.terrainPaint?.(track) ?? theme.terrainLook));
    const R = theme.regions;
    s.add(
      buildTrackMesh(
        track,
        R
          ? {
              styleAt: (sv) => R.looks[this.regionAt(sv)]!.road,
              boundaries: (track.def.regions ?? []).map((r) => r[1]),
              gaps: track.def.gaps,
              open: track.def.open,
            }
          : theme.road(track),
      ),
    );
    s.add(
      buildFoliage(this.terrain, {
        ...theme.foliage,
        keepOut: theme.keepOut?.(track),
        kindAt: theme.foliageAt?.(track, this.terrain),
      }),
    );
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

  regionAt(sv: number): string {
    const regions = this.track.def.regions ?? [];
    let r = regions[0]?.[0] ?? '';
    for (const [id, rs] of regions) if (sv >= rs) r = id;
    return r;
  }

  /** The blended atmosphere at an arc length (multi-land tracks only). */
  atmosphereAt(sv: number): Atmosphere | null {
    const R = this.theme.regions;
    if (!R) return null;
    const regions = this.track.def.regions ?? [];
    const L = this.track.length;
    const W = 70;
    let a = R.looks[this.regionAt(sv)]!.atmosphere;
    for (let i = 0; i < regions.length; i++) {
      let d = sv - regions[i]![1];
      if (d > L / 2) d -= L;
      if (d < -L / 2) d += L;
      if (Math.abs(d) < W) {
        const prev = R.looks[regions[(i - 1 + regions.length) % regions.length]![0]]!.atmosphere;
        const next = R.looks[regions[i]![0]]!.atmosphere;
        a = mixAtmos(prev, next, (d + W) / (2 * W));
      }
    }
    // Fade to darkness underground.
    for (const [t0, t1] of this.track.def.tunnels ?? []) {
      const inside = Math.min(sv - t0, t1 - sv);
      if (inside > -10) a = mixAtmos(a, R.underground, Math.min(1, (inside + 10) / 40));
    }
    return a;
  }

  /** Apply sky, fog and light for the camera about to render. */
  applyAtmosphere(a: Atmosphere | null): void {
    if (!a || a === this.current) return;
    this.current = a;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setHex(a.fog);
    fog.near = a.fogNear;
    fog.far = a.fogFar;
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    u.top!.value.setHex(a.skyTop);
    u.horizon!.value.setHex(a.skyHorizon);
    this.sun.color.setHex(a.sun);
    this.sun.intensity = a.sunIntensity;
    this.hemi.color.setHex(a.hemiSky);
    this.hemi.groundColor.setHex(a.hemiGround);
    this.hemi.intensity = a.hemiIntensity;
    this.scene.environmentIntensity = a.env;
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

const mixC = (a: number, b: number, t: number) =>
  new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
const mixN = (a: number, b: number, t: number) => a + (b - a) * t;
function mixAtmos(a: Atmosphere, b: Atmosphere, t: number): Atmosphere {
  const k = Math.min(1, Math.max(0, t));
  return {
    skyTop: mixC(a.skyTop, b.skyTop, k),
    skyHorizon: mixC(a.skyHorizon, b.skyHorizon, k),
    fog: mixC(a.fog, b.fog, k),
    fogNear: mixN(a.fogNear, b.fogNear, k),
    fogFar: mixN(a.fogFar, b.fogFar, k),
    sun: mixC(a.sun, b.sun, k),
    sunIntensity: mixN(a.sunIntensity, b.sunIntensity, k),
    hemiSky: mixC(a.hemiSky, b.hemiSky, k),
    hemiGround: mixC(a.hemiGround, b.hemiGround, k),
    hemiIntensity: mixN(a.hemiIntensity, b.hemiIntensity, k),
    env: mixN(a.env, b.env, k),
  };
}
