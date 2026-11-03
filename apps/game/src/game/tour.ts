import * as THREE from 'three';
import { Track } from '@epic/sim';
import type { View } from '../render/view.ts';
import { World } from '../render/world.ts';
import type { TrackEntry } from './tracks.ts';

/**
 * Map Tour: a slow drone tour of the whole map, round and round until you leave.
 *
 * Rather than chasing the road through every bend, it works like a camera crew: one shot for
 * each part of the course (long parts get two). For each shot the drone stands out toward the
 * edge of the map on that part's outer side and looks in across it (there's nothing to see
 * looking out past the boundary), choosing a spot with a clear view. It then pans slowly
 * sideways across the scene (17 to 26 seconds a shot) while craning up or settling down, somewhere between 6 ft off the
 * ground and 30 ft, never looking straight down. Between shots it glides over to the next spot
 * in a gentle arc. It keeps clear of roofs and trees by looking down at what's under it and
 * just ahead.
 *
 * Heights are real feet: on the farm (built at 1:10) a foot is ten times bigger in world units.
 */

const FT = 0.3048;
const LOW = 6 * FT;

/** Height (feet) at the start and end of each shot, in turn: crane up, settle, low glide, rise. */
const PROFILES: [number, number][] = [
  [6, 22],
  [30, 15],
  [10, 7],
  [16, 30],
  [24, 10],
];

interface Shot {
  name: string;
  /** Arc length in the middle of the part (for the light, e.g. Middle-earth's lands). */
  s: number;
  /** Camera slides from a to b (ground plane), looking from la to lb. */
  a: THREE.Vector2;
  b: THREE.Vector2;
  la: THREE.Vector3;
  lb: THREE.Vector3;
  feet: [number, number];
  dur: number;
  /** The glide over to the next shot. */
  move: number;
}

const smooth = (u: number) => {
  const c = Math.min(1, Math.max(0, u));
  return c * c * c * (c * (c * 6 - 15) + 10);
};

export class MapTour {
  readonly world: World;
  readonly camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.3, 20000);
  /** 0..1 round the loop of shots. */
  progress = 0;
  /** The tour loops until it's left; kept for the caller's sake. */
  readonly done = false;
  /** The part of the course in view, when the track names its parts. */
  caption = '';

  private track: Track;
  private sc: number;
  private shots: Shot[] = [];
  private total = 0;
  private solids: { obj: THREE.Object3D; box: THREE.Box3 }[] = [];
  private tops = new Map<string, number>();
  private ray = new THREE.Raycaster();
  private t = 0;
  private alt = NaN;
  private look = new THREE.Vector3();
  private lookInit = false;
  /** `world`: the lobby's world of the same track, flown through instead of building another. */
  private ownWorld: boolean;

  constructor(
    private view: View,
    private entry: TrackEntry,
    world?: World,
  ) {
    this.track = new Track(entry.def);
    this.ownWorld = !world;
    this.world = world ?? new World(this.track, view.renderer, entry.theme);
    this.world.setCamera(this.camera);
    this.sc = entry.tourScale ?? 1;
    this.ray.camera = this.camera;
    this.collectSolids();
    this.planShots();
  }

  // ---------------------------------------------------------------- what's solid

  /** Everything solid enough to fly over (not the ground, the road, clouds, grass or effects). */
  private collectSolids(): void {
    this.world.scene.updateMatrixWorld(true);
    const skip = (o: THREE.Object3D) => {
      for (let p: THREE.Object3D | null = o; p; p = p.parent)
        if (p.userData.tourIgnore) return true;
      return false;
    };
    this.world.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible || skip(o)) return;
      if ((m.geometry as THREE.InstancedBufferGeometry).isInstancedBufferGeometry) return;
      const box = new THREE.Box3().setFromObject(m);
      if (box.isEmpty() || !Number.isFinite(box.min.x)) return;
      // Skip the sky dome and other things wrapped round the whole world.
      if (box.max.x - box.min.x > 3000 * this.sc) return;
      this.solids.push({ obj: m, box });
    });
  }

  /** Top of whatever stands at (x, z), ground included, found by looking straight down. */
  private topAt(x: number, z: number): number {
    const cell = 0.8 * this.sc;
    const key = `${Math.round(x / cell)},${Math.round(z / cell)}`;
    const known = this.tops.get(key);
    if (known !== undefined) return known;
    const ground = this.world.groundHeight(x, z);
    let top = ground;
    const under = this.solids.filter(
      (s) => x >= s.box.min.x && x <= s.box.max.x && z >= s.box.min.z && z <= s.box.max.z,
    );
    if (under.length) {
      this.ray.set(new THREE.Vector3(x, ground + 80 * this.sc, z), new THREE.Vector3(0, -1, 0));
      this.ray.far = 82 * this.sc;
      const hit = this.ray.intersectObjects(
        under.map((s) => s.obj),
        false,
      )[0];
      if (hit) top = Math.max(top, hit.point.y);
    }
    this.tops.set(key, top);
    return top;
  }

  /** How much of the way from `from` to `to` is clear (1 = nothing in the way). */
  private clearView(from: THREE.Vector3, to: THREE.Vector3): number {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    dir.normalize();
    const r = new THREE.Ray(from, dir);
    const hits = this.solids.filter((s) => r.intersectsBox(s.box));
    if (!hits.length) return 1;
    this.ray.set(from, dir);
    this.ray.far = len;
    const hit = this.ray.intersectObjects(
      hits.map((s) => s.obj),
      false,
    )[0];
    return hit ? hit.distance / len : 1;
  }

  // ---------------------------------------------------------------- planning the shots

  private planShots(): void {
    const tr = this.track;
    const sc = this.sc;
    const step = 4 * sc;
    const pts: { x: number; z: number; y: number; s: number }[] = [];
    for (let s = 0; s < tr.length; s += step) {
      const f = tr.frameAtS(s);
      pts.push({ x: f.pos.x, z: f.pos.z, y: f.pos.y, s });
    }
    // The middle of the map and how far out the course reaches.
    const M = new THREE.Vector2(
      pts.reduce((a, p) => a + p.x, 0) / pts.length,
      pts.reduce((a, p) => a + p.z, 0) / pts.length,
    );
    const reach = Math.max(...pts.map((p) => Math.hypot(p.x - M.x, p.z - M.y)));
    const x0 = Math.min(...pts.map((p) => p.x)) - 14 * sc,
      x1 = Math.max(...pts.map((p) => p.x)) + 14 * sc,
      z0 = Math.min(...pts.map((p) => p.z)) - 14 * sc,
      z1 = Math.max(...pts.map((p) => p.z)) + 14 * sc;

    // The parts of the course: the track's named parts, or eight equal stretches.
    const stops = [...(this.entry.stops ?? [])].sort((a, b) => a.s - b.s);
    let parts: { name: string; s0: number; s1: number }[] = stops.length
      ? stops.map((st, i) => ({
          name: st.name,
          s0: st.s,
          s1: stops[i + 1]?.s ?? tr.length,
        }))
      : Array.from({ length: 8 }, (_, i) => ({
          name: '',
          s0: (i * tr.length) / 8,
          s1: ((i + 1) * tr.length) / 8,
        }));
    // Long parts get two shots.
    const avg = tr.length / parts.length;
    parts = parts.flatMap((p) =>
      p.s1 - p.s0 > avg * 1.8
        ? [
            { ...p, s1: (p.s0 + p.s1) / 2 },
            { ...p, s0: (p.s0 + p.s1) / 2 },
          ]
        : [p],
    );

    parts.forEach((part, k) => {
      const ps = pts.filter((p) => p.s >= part.s0 && p.s < part.s1);
      if (ps.length < 2) return;
      const C = new THREE.Vector2(
        ps.reduce((a, p) => a + p.x, 0) / ps.length,
        ps.reduce((a, p) => a + p.z, 0) / ps.length,
      );
      const d = ps.map((p) => Math.hypot(p.x - C.x, p.z - C.y)).sort((a, b) => a - b);
      const extent = d[Math.floor(d.length * 0.85)]!;
      const ground = this.world.groundHeight(C.x, C.y);
      // Look at the road's own height where it climbs (the farm's sky tube), within reason.
      const above =
        ps.reduce((a, p) => a + (p.y - this.world.groundHeight(p.x, p.z)), 0) / ps.length;
      const target = new THREE.Vector3(
        C.x,
        ground + Math.min(Math.max(above * 0.6, 1.5 * sc), 20 * sc),
        C.y,
      );

      // Stand out on the part's outer side, looking in across it toward the middle of the map.
      const r = Math.min(Math.max(extent * 0.8 + 10 * sc, 22 * sc), 75 * sc);
      let best: THREE.Vector2 | null = null,
        bestScore = -Infinity;
      // Try a ring of spots, and rings farther out in case something big (a barn) is in the way.
      for (const [ri, rm] of [1, 1.45, 1.9].entries())
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2;
          const cand = new THREE.Vector2(C.x + Math.cos(a) * r * rm, C.y + Math.sin(a) * r * rm);
          if (cand.x < x0 || cand.x > x1 || cand.y < z0 || cand.y > z1) continue;
          const toC = new THREE.Vector2().subVectors(C, cand).normalize();
          const toM = new THREE.Vector2().subVectors(M, cand);
          const inward = toM.length() > 1e-6 ? toC.dot(toM.normalize()) : 0;
          const edge = cand.distanceTo(M) / Math.max(reach, 1);
          const eye = new THREE.Vector3(
            cand.x,
            Math.max(this.topAt(cand.x, cand.y), this.world.groundHeight(cand.x, cand.y)) +
              14 * FT * sc,
            cand.y,
          );
          const dist = eye.distanceTo(target);
          const clear = this.clearView(eye, target);
          // Open space in front of the lens matters most: no wall filling the frame.
          const open = Math.min(1, (clear * dist) / (28 * sc));
          const score = edge + inward * 0.9 + clear * 0.8 + open * 1.2 - ri * 0.12;
          if (score > bestScore) {
            bestScore = score;
            best = cand;
          }
        }
      if (!best) best = new THREE.Vector2(C.x, C.y).add(new THREE.Vector2(r, 0));
      // Pan sideways across the scene, heading the way the next part lies.
      const toC = new THREE.Vector2().subVectors(C, best).normalize();
      const side = new THREE.Vector2(-toC.y, toC.x);
      const span = Math.min(extent * 0.6, 16 * sc);
      const nextPart = parts[(k + 1) % parts.length]!;
      const np = pts.find((p) => p.s >= nextPart.s0) ?? pts[0]!;
      if (side.dot(new THREE.Vector2(np.x - C.x, np.z - C.y)) < 0) side.negate();
      const a = best.clone().addScaledVector(side, -span / 2),
        b = best.clone().addScaledVector(side, span / 2);
      const la = target
        .clone()
        .add(new THREE.Vector3(side.x, 0, side.y).multiplyScalar(-span * 0.3));
      const lb = target
        .clone()
        .add(new THREE.Vector3(side.x, 0, side.y).multiplyScalar(span * 0.3));
      // Slow: an easy stroll across the scene, 17 to 26 seconds a shot.
      const dur = Math.min(26, Math.max(17, span / (0.9 * sc)));
      this.shots.push({
        name: part.name,
        s: (part.s0 + part.s1) / 2,
        a,
        b,
        la,
        lb,
        feet: PROFILES[this.shots.length % PROFILES.length]!,
        dur,
        move: 0,
      });
    });
    // Glides between shots: a few seconds, longer for longer hops.
    this.shots.forEach((sh, i) => {
      const nx = this.shots[(i + 1) % this.shots.length]!;
      sh.move = Math.min(12, Math.max(4.5, sh.b.distanceTo(nx.a) / (8 * sc)));
    });
    this.total = this.shots.reduce((a, sh) => a + sh.dur + sh.move, 0);
  }

  // ---------------------------------------------------------------- flying

  /** Where the drone wants to be (and look) at tour time t. */
  private pose(t: number, pos: THREE.Vector3, look: THREE.Vector3): Shot {
    const sc = this.sc;
    let u = ((t % this.total) + this.total) % this.total;
    for (let i = 0; i < this.shots.length; i++) {
      const sh = this.shots[i]!;
      if (u < sh.dur) {
        // A steady pan with the gentlest ease at either end.
        const e = 0.8 * (u / sh.dur) + 0.2 * smooth(u / sh.dur);
        const x = sh.a.x + (sh.b.x - sh.a.x) * e,
          z = sh.a.y + (sh.b.y - sh.a.y) * e;
        const ft = sh.feet[0] + (sh.feet[1] - sh.feet[0]) * smooth(u / sh.dur);
        pos.set(x, this.world.groundHeight(x, z) + ft * FT * sc, z);
        look.lerpVectors(sh.la, sh.lb, e);
        return sh;
      }
      u -= sh.dur;
      if (u < sh.move) {
        const nx = this.shots[(i + 1) % this.shots.length]!;
        const k = smooth(u / sh.move);
        const x = sh.b.x + (nx.a.x - sh.b.x) * k,
          z = sh.b.y + (nx.a.y - sh.b.y) * k;
        const hA = sh.feet[1] * FT * sc,
          hB = nx.feet[0] * FT * sc;
        const lift = Math.min(sh.b.distanceTo(nx.a) * 0.08, 8 * sc) * Math.sin(Math.PI * k);
        pos.set(x, this.world.groundHeight(x, z) + hA + (hB - hA) * k + lift, z);
        // Turn toward the next scene a little ahead of getting there.
        look.lerpVectors(sh.lb, nx.la, smooth(Math.min(1, (u / sh.move) * 1.25)));
        return k < 0.5 ? sh : nx;
      }
      u -= sh.move;
    }
    return this.shots[0]!;
  }

  frame(dt: number): void {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    if (!this.shots.length) return;
    this.progress = (this.t % this.total) / this.total;
    const pos = new THREE.Vector3(),
      look = new THREE.Vector3(),
      ahead = new THREE.Vector3(),
      tmp = new THREE.Vector3();
    const shot = this.pose(this.t, pos, look);
    // Keep clear of anything under the drone now and just ahead of it.
    const clear = 1.6 * this.sc;
    let floor = this.topAt(pos.x, pos.z) + clear;
    for (const k of [0.8, 1.6, 2.4]) {
      this.pose(this.t + k, ahead, tmp);
      floor = Math.max(floor, this.topAt(ahead.x, ahead.z) + clear);
    }
    floor = Math.max(floor, this.world.groundHeight(pos.x, pos.z) + LOW * this.sc * 0.8);
    const want = Math.max(pos.y, floor);
    if (Number.isNaN(this.alt)) this.alt = want;
    // Rise quickly when something's in the way, settle back down gently.
    this.alt += (want - this.alt) * Math.min(1, dt * (want > this.alt ? 2.5 : 0.8));
    this.alt = Math.max(this.alt, this.topAt(pos.x, pos.z) + 0.5 * this.sc);
    this.camera.position.set(pos.x, this.alt, pos.z);

    // Never look straight down: keep the view within about 25 degrees of level.
    const flat = Math.hypot(look.x - pos.x, look.z - pos.z);
    const minY = this.alt - flat * Math.tan(0.44);
    if (look.y < minY) look.y = minY;
    if (!this.lookInit) {
      this.look.copy(look);
      this.lookInit = true;
    }
    this.look.lerp(look, Math.min(1, dt * 3));
    this.camera.lookAt(this.look);

    this.caption = shot.name;
    this.world.applyAtmosphere(this.world.atmosphereAt(shot.s, true));
    this.world.focusSun(
      this.camera.position.clone().lerp(this.look, 0.5),
      Math.max(60, 40 * this.sc),
    );
    this.world.fx.update(dt);
    this.world.update(dt, this.t);
    this.view.render(this.world.scene, [{ x: 0, y: 0, w: 1, h: 1, camera: this.camera }]);
  }

  dispose(): void {
    this.world.setCamera(null);
    this.world.applyAtmosphere(this.world.atmosphereAt(0, true));
    if (this.ownWorld) this.world.scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}
