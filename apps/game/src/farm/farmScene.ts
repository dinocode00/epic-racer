import * as THREE from 'three';
import { setWind, windUniforms } from '../render/wind.ts';
import { patchScene } from '../render/look.ts';
import { buildSky } from '../render/scenery.ts';
import { buildBuildings } from './buildings.ts';
import { buildGround } from './ground.ts';
import { CENTRE, FARM, FARM_SCALE, type XY, driveHeight, inside } from './layout.ts';
import { buildPlants } from './plants.ts';

/**
 * The Grandparents' Farm scene: lush green summer into early fall, sunshine, built from the
 * locked blueprint at FARM_SCALE so racers are miniatures. The farm is modelled in real
 * metres inside one scaled group; everything outside it (cameras, karts) is in game metres.
 */
export class FarmScene {
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  readonly sunDir = new THREE.Vector3(-0.45, 0.78, 0.43).normalize();
  private sky: THREE.Mesh;
  private t = 0;
  private updateProps: (t: number) => void;
  private solids: { c: XY; w: number; h: number; angle: number }[];

  constructor(renderer: THREE.WebGLRenderer) {
    const s = this.scene;
    const S = FARM_SCALE;
    // A summer breeze out of the south-west (map +x +y is world +x -z), sized in real metres.
    setWind(1, -1, 1 / S, 1);
    s.background = new THREE.Color(0xcfe3f2);
    s.fog = new THREE.Fog(0xd6e6ee, 2400, 14000);
    this.sky = buildSky(0x3f86d9, 0xd9ebf6, this.sunDir);
    this.sky.scale.setScalar(4);
    s.add(this.sky);

    // Sky light for paint and chrome reflections on the karts.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = new THREE.Scene();
    env.add(buildSky(0x3f86d9, 0xd9ebf6, this.sunDir));
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3000, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x5f8a3a }),
    );
    ground.position.y = -20;
    env.add(ground);
    s.environment = pmrem.fromScene(env, 0.02).texture;
    s.environmentIntensity = 0.55;

    s.add(new THREE.HemisphereLight(0xd6e8ff, 0x5a6b3a, 1.15));
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.6;
    s.add(this.sun, this.sun.target);

    // The farm, in real metres, scaled up and centred on the origin.
    const farm = new THREE.Group();
    farm.scale.setScalar(S);
    farm.position.set(-CENTRE[0] * S, 0, CENTRE[1] * S);
    farm.add(buildGround());
    const b = buildBuildings();
    const plants = buildPlants();
    farm.add(b.group, plants);
    const bees = plants.userData.update as (t: number) => void;
    this.updateProps = (t) => {
      b.update(t);
      bees(t);
    };
    this.solids = b.solids;
    s.add(farm);
    patchScene(s);
  }

  /** Game-world position of a map point (metres, x east, y north) at ground level. */
  static world(p: XY, lift = 0): THREE.Vector3 {
    const S = FARM_SCALE;
    return new THREE.Vector3(
      (p[0] - CENTRE[0]) * S,
      driveHeight(p[0], p[1]) * S + lift,
      -(p[1] - CENTRE[1]) * S,
    );
  }

  /** Map point (real metres) under a game-world position. */
  static map(x: number, z: number): XY {
    const S = FARM_SCALE;
    return [x / S + CENTRE[0], -z / S + CENTRE[1]];
  }

  /** Height a kart drives at, in game metres. */
  heightAt(x: number, z: number): number {
    const [mx, my] = FarmScene.map(x, z);
    return driveHeight(mx, my) * FARM_SCALE;
  }

  /** Inside the property line? */
  onFarm(x: number, z: number): boolean {
    const [mx, my] = FarmScene.map(x, z);
    return inside(mx, my, FARM.boundary);
  }

  /** Push a game-world point out of buildings; returns the corrected point. */
  collide(p: THREE.Vector3, radius: number): boolean {
    const [mx, my] = FarmScene.map(p.x, p.z);
    const r = radius / FARM_SCALE;
    let hit = false;
    for (const b of this.solids) {
      const a = (b.angle * Math.PI) / 180;
      const dx = mx - b.c[0],
        dy = my - b.c[1];
      const u = dx * Math.cos(a) + dy * Math.sin(a);
      const v = -dx * Math.sin(a) + dy * Math.cos(a);
      const hw = b.w / 2 + r,
        hh = b.h / 2 + r;
      if (Math.abs(u) < hw && Math.abs(v) < hh) {
        const pu = hw - Math.abs(u),
          pv = hh - Math.abs(v);
        let nu = u,
          nv = v;
        if (pu < pv) nu = Math.sign(u || 1) * hw;
        else nv = Math.sign(v || 1) * hh;
        const nx = b.c[0] + nu * Math.cos(a) - nv * Math.sin(a);
        const ny = b.c[1] + nu * Math.sin(a) + nv * Math.cos(a);
        p.x = (nx - CENTRE[0]) * FARM_SCALE;
        p.z = -(ny - CENTRE[1]) * FARM_SCALE;
        hit = true;
      }
    }
    return hit;
  }

  /** Shadow map centred on a point, covering `half` game metres each way. */
  focusSun(p: THREE.Vector3, half: number): void {
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(this.sunDir, half * 2 + 400);
    this.sun.target.updateMatrixWorld();
    const c = this.sun.shadow.camera;
    if (c.right !== half) {
      c.left = c.bottom = -half;
      c.right = c.top = half;
      c.near = 10;
      c.far = half * 4 + 1200;
      c.updateProjectionMatrix();
    }
  }

  update(dt: number, camera: THREE.Camera): void {
    this.t += dt;
    windUniforms.uTime.value = this.t;
    this.updateProps(this.t);
    this.sky.position.copy(camera.position);
  }
}
