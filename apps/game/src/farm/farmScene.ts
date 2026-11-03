import * as THREE from 'three';
import { setWind, windUniforms } from '../render/wind.ts';
import { patchScene } from '../render/look.ts';
import { buildSky } from '../render/scenery.ts';
import type { BeeSpot } from './bees.ts';
import { buildBuildings } from './buildings.ts';
import { buildCritters } from './critters.ts';
import { type Grass, buildGrass } from './grass.ts';
import { type GrandpaRounds, buildGrandpaRounds } from './grandpaRounds.ts';
import { setGrimeFrame } from './grime.ts';
import { buildGround, meshHeight } from './ground.ts';
import { CENTRE, FARM, FARM_SCALE, type XY, driveHeight, groundHeight, inside } from './layout.ts';
import { keptClear } from './flowers.ts';
import { PERCHES, type Perch, addPerch } from './perches.ts';
import { buildPlants } from './plants.ts';
import { type Obstacle, buildSongbirds } from './songbirds.ts';
import { addCloudShadow, farmSky } from './sky.ts';

/**
 * The Grandparents' Farm scene: lush green summer into early fall, sunshine, built from the
 * locked blueprint at FARM_SCALE so racers are miniatures. The farm is modelled in real
 * metres inside one scaled group; everything outside it (cameras, karts) is in game metres.
 */
export class FarmScene {
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sunDir = new THREE.Vector3(-0.45, 0.78, 0.43).normalize();
  private sky: THREE.Mesh;
  private t = 0;
  private updateProps: (t: number) => void;
  private solids: { c: XY; w: number; h: number; angle: number }[];
  private grass: Grass;
  private critters: ReturnType<typeof buildCritters>;
  readonly birds: ReturnType<typeof buildSongbirds>;
  /** Grandpa on his rounds: walking three loops and mowing the Christmas tree aisles. */
  readonly grandpa: GrandpaRounds;
  private farm: THREE.Group;
  private camLocal = new THREE.Vector3();
  private pressLocal = new THREE.Vector3();

  constructor(renderer: THREE.WebGLRenderer) {
    const s = this.scene;
    const S = FARM_SCALE;
    // A summer breeze out of the south-west (map +x +y is world +x -z), sized in real metres.
    setWind(1, -1, 1 / S, 1);
    s.background = new THREE.Color(0xcfe3f2);
    s.fog = new THREE.Fog(0xd6e6ee, 2400, 14000);
    this.sky = farmSky(0x3f86d9, 0xd9ebf6, this.sunDir);
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

    this.hemi = new THREE.HemisphereLight(0xd6e8ff, 0x5a6b3a, 1.15);
    s.add(this.hemi);
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
    setGrimeFrame(farm);
    const land = buildGround();
    farm.add(land);
    this.grass = buildGrass((land.material as THREE.MeshStandardMaterial).map!);
    farm.add(this.grass.group);
    this.farm = farm;
    PERCHES.length = 0;
    const b = buildBuildings();
    const plants = buildPlants();
    const spots = birdSpots(b.group);
    farm.add(b.group, plants);
    const bees = plants.userData.update as (t: number) => void;
    this.critters = buildCritters(plants.userData.spots as BeeSpot[]);
    farm.add(this.critters.group);
    this.birds = buildSongbirds(spots.perches, spots.obstacles);
    farm.add(this.birds.group);
    this.grandpa = buildGrandpaRounds();
    farm.add(this.grandpa.group);
    this.updateProps = (t) => {
      b.update(t);
      bees(t);
    };
    this.solids = b.solids;
    s.add(farm);
    farm.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m) (Array.isArray(m) ? m : [m]).forEach(addCloudShadow);
    });
    patchScene(s);
  }

  /** Put something in the farm group (real metres, map x east, z south). */
  addToFarm(o: THREE.Object3D): void {
    this.farm.add(o);
  }

  /** Farm-local (real metres) to game-world, in place. */
  farmToWorld(v: THREE.Vector3): THREE.Vector3 {
    return this.farm.localToWorld(v);
  }

  /** Game-world position of where one of the grandpas is now (at his chest height). */
  grandpaAt(i: number, out: THREE.Vector3): THREE.Vector3 {
    const p = this.grandpa.folks[i]!.pos;
    out.set(p.x, meshHeight(p.x, p.y) + 1.3, -p.y);
    return this.farm.localToWorld(out);
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
    // Grandpa (and his tractor): a circle to keep out of.
    for (const o of this.grandpa.obstacles()) {
      const dx = mx - o.x,
        dy = my - o.y;
      const d = Math.hypot(dx, dy),
        rr = o.r + r;
      if (d < rr && d > 1e-6) {
        p.x = (o.x + (dx / d) * rr - CENTRE[0]) * FARM_SCALE;
        p.z = -(o.y + (dy / d) * rr - CENTRE[1]) * FARM_SCALE;
        hit = true;
      }
    }
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

  /** The kart (game-world position) presses down the grass where it sits or drives. */
  pressGrass(p: THREE.Vector3 | null): void {
    this.grass.press(p ? this.farm.worldToLocal(this.pressLocal.copy(p)) : null);
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

  /** `clock`: what grandpa's timetable runs on (a race passes its own clock). */
  update(dt: number, camera: THREE.Camera, clock?: number): void {
    this.t += dt;
    windUniforms.uTime.value = this.t;
    this.updateProps(this.t);
    this.sky.position.copy(camera.position);
    this.farm.worldToLocal(this.camLocal.copy(camera.position));
    this.grass.update(this.camLocal);
    this.critters.update(this.t, this.camLocal);
    this.birds.update(this.t, this.camLocal);
    this.grandpa.update(clock ?? this.t, dt, this.camLocal);
  }
}

/**
 * Where songbirds can land beyond the trees and flowers (roof ridges, posts, the lawn and the
 * fields), found by looking straight down onto the buildings, and what their flights must clear.
 */
function birdSpots(buildings: THREE.Object3D): { perches: Perch[]; obstacles: Obstacle[] } {
  buildings.updateMatrixWorld(true);
  const solids: THREE.Mesh[] = [];
  buildings.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && o.visible) solids.push(m);
  });
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const topAt = (x: number, y: number): number | null => {
    ray.set(new THREE.Vector3(x, 60, -y), down);
    const hit = ray.intersectObjects(solids, false)[0];
    return hit ? hit.point.y : null;
  };
  const obstacles: Obstacle[] = [];
  const rects = [
    FARM.barn,
    FARM.wooden_garage,
    FARM.red_garage,
    FARM.shed,
    FARM.greenhouse,
    FARM.playhouse,
    { ...FARM.house.main, angle: FARM.house.angle },
    { ...FARM.house.wing, angle: FARM.house.angle },
  ];
  for (const r of rects) {
    const th = ((r.angle ?? 0) * Math.PI) / 180;
    const ax: XY = [Math.cos(th), Math.sin(th)],
      ay: XY = [-Math.sin(th), Math.cos(th)];
    const hits: [number, number, number][] = [];
    const half = Math.max(r.w, r.h) / 2;
    for (let i = -2; i <= 2; i++)
      for (let j = -2; j <= 2; j++) {
        const x = r.c[0] + (ax[0] * i + ay[0] * j) * half * 0.4,
          y = r.c[1] + (ax[1] * i + ay[1] * j) * half * 0.4;
        const h = topAt(x, y);
        if (h !== null && h > 1.5) hits.push([x, y, h]);
      }
    if (!hits.length) continue;
    hits.sort((a, b) => b[2] - a[2]);
    obstacles.push({ x: r.c[0], z: -r.c[1], r: Math.hypot(r.w, r.h) / 2 + 1, top: hits[0]![2] });
    // Up to three spots along the ridge, a metre or more apart.
    const kept: [number, number, number][] = [];
    for (const h of hits)
      if (h[2] > hits[0]![2] - 0.3 && kept.every((k) => Math.hypot(k[0] - h[0], k[1] - h[1]) > 1.2))
        if (kept.push(h) >= 3) break;
    for (const [x, y, h] of kept) addPerch(x, h + 0.01, -y, 'roof');
  }
  // Posts and tops of things: the windmill, the corn crib, the clothes-line posts, the well,
  // the mailbox.
  for (const [p, big] of [
    [FARM.windmill, true],
    [FARM.corn_crib, true],
    [FARM.clothes_lines[0], false],
    [FARM.clothes_lines[1], false],
    [FARM.well, false],
    [FARM.mailbox, false],
  ] as const) {
    let best: [number, number, number] | null = null;
    for (const [dx, dy] of [
      [0, 0],
      [0.15, 0],
      [-0.15, 0],
      [0, 0.15],
      [0, -0.15],
    ]) {
      const h = topAt(p[0] + dx, p[1] + dy);
      if (h !== null && (!best || h > best[2])) best = [p[0] + dx, p[1] + dy, h];
    }
    if (!best) continue;
    addPerch(best[0], best[2] + 0.01, -best[1], 'post');
    if (big) obstacles.push({ x: p[0], z: -p[1], r: 2.5, top: best[2] });
  }
  // The trees they'd otherwise fly through.
  const R: Partial<Record<Perch['tag'], number>> = {
    spruce: 2.8,
    pine: 5,
    orchard: 2.2,
    arbor: 0.9,
  };
  for (const q of PERCHES) if (R[q.tag]) obstacles.push({ x: q.x, z: q.z, r: R[q.tag]!, top: q.y });
  // Lawn round the house and the yard, and the fields beyond the line.
  for (const c of [FARM.well, FARM.clothes_lines[0], FARM.clothes_lines[1], ...FARM.lilacs]) {
    const x = c[0] + 3,
      y = c[1] - 2;
    addPerch(x, groundHeight(x, y), -y, 'lawn', true);
  }
  for (const poly of [FARM.outside_east_field, FARM.outside_hill]) {
    const xs = poly.map((p) => p[0]),
      ys = poly.map((p) => p[1]);
    for (let n = 0, tries = 0; n < 14 && tries < 400; tries++) {
      const x = Math.min(...xs) + Math.random() * (Math.max(...xs) - Math.min(...xs));
      const y = Math.min(...ys) + Math.random() * (Math.max(...ys) - Math.min(...ys));
      if (!inside(x, y, poly)) continue;
      addPerch(x, groundHeight(x, y), -y, 'field', true);
      n++;
    }
  }
  // Nothing lands on the racetrack.
  const perches = PERCHES.filter((q) => !(q.ground && keptClear(q.x, -q.z)));
  return { perches, obstacles };
}
