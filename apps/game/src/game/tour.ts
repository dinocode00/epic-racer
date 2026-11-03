import * as THREE from 'three';
import { Track } from '@epic/sim';
import type { View } from '../render/view.ts';
import { World } from '../render/world.ts';
import type { TrackEntry } from './tracks.ts';

/**
 * Map Tour: a drone fly-by of the whole map, to see all the detail before racing it.
 *
 * The drone follows the course (a smoothed line beside the road, so it sees the road and what's
 * round it), never looking down from above: it cruises between about 6 ft off the ground (low,
 * among things) and 30 ft (high, over them), rising and falling as it goes, looks ahead along
 * the way and pans slowly from side to side. It climbs over roofs and trees it would otherwise
 * hit, looking ahead so it starts climbing before it gets there. Heights are real feet: on the
 * farm (built at 1:10) a foot is ten times bigger in world units.
 */

const FT = 0.3048;
const LOW = 6 * FT,
  HIGH = 30 * FT;

export class MapTour {
  readonly world: World;
  readonly camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.3, 20000);
  /** 0..1 along the tour. */
  progress = 0;
  done = false;
  /** The place being flown over, when the track names its parts. */
  caption = '';

  private track: Track;
  private sc: number;
  /** The drone's line: points on the ground plane every `step` world units. */
  private path: THREE.Vector2[] = [];
  /** Arc length on the track for each path point (for captions and atmosphere). */
  private trackS: number[] = [];
  private step: number;
  private length = 0;
  /** Highest solid thing under each path point (null = not looked at yet). */
  private tops: (number | null)[] = [];
  private solids: { obj: THREE.Object3D; box: THREE.Box3 }[] = [];
  private ray = new THREE.Raycaster();
  private dist = 0;
  private speed: number;
  private t = 0;
  private alt = 0;
  private look = new THREE.Vector3();
  private started = false;

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
    this.step = 2 * this.sc;
    this.buildPath();
    this.collectSolids();
    // About two minutes, whatever the size of the map, but never slower than a drone's stroll.
    this.speed = Math.max(7 * this.sc, this.length / 130);
    this.ray.camera = this.camera;
  }

  /** The course's ground line, smoothed out (loops and corkscrews become sweeps), off to one side. */
  private buildPath(): void {
    const tr = this.track;
    const n = Math.ceil(tr.length / this.step);
    const raw: THREE.Vector2[] = [];
    for (let i = 0; i < n; i++) {
      const f = tr.frameAtS(i * this.step);
      raw.push(new THREE.Vector2(f.pos.x, f.pos.z));
    }
    // Moving average over about 6 real metres either side, three passes.
    const R = Math.max(3, Math.round((6 * this.sc) / this.step));
    let cur = raw;
    for (let pass = 0; pass < 3; pass++) {
      const next: THREE.Vector2[] = [];
      for (let i = 0; i < n; i++) {
        const acc = new THREE.Vector2();
        for (let k = -R; k <= R; k++) acc.add(cur[(i + k + n) % n]!);
        next.push(acc.multiplyScalar(1 / (2 * R + 1)));
      }
      cur = next;
    }
    // Off to the side of the road, swapping sides now and then. The sideways direction comes from
    // a long stretch of the line (so it doesn't spin round tight corners and loops), and the
    // offset shrinks where the line bends hard.
    const K = Math.max(4, Math.round((16 * this.sc) / this.step));
    const offset: THREE.Vector2[] = [];
    for (let i = 0; i < n; i++) {
      const a = cur[(i - K + n) % n]!,
        m = cur[i]!,
        b = cur[(i + K) % n]!;
      const chord = a.distanceTo(b);
      const d = new THREE.Vector2().subVectors(b, a).normalize();
      // Straightness: chord over the path length between a and b (1 straight, small on a hairpin).
      let arc = 0;
      for (let k = -K; k < K; k++)
        arc += cur[(i + k + n) % n]!.distanceTo(cur[(i + k + 1 + n) % n]!);
      const straight = Math.max(0, Math.min(1, (chord / Math.max(arc, 1e-6) - 0.55) / 0.4));
      const w = tr.frameAtS(i * this.step).width;
      const side = Math.sin((i * this.step) / (90 * this.sc) + 0.6);
      const off = side * (w / 2 + 3 * this.sc) * straight;
      offset.push(m.clone().add(new THREE.Vector2(-d.y, d.x).multiplyScalar(off)));
    }
    cur = offset;
    // Even spacing along the smoothed line.
    this.path = [cur[0]!.clone()];
    this.trackS = [0];
    let carry = 0;
    for (let i = 1; i <= n; i++) {
      const a = cur[(i - 1) % n]!,
        b = cur[i % n]!;
      const seg = a.distanceTo(b);
      let u = this.step - carry;
      while (u <= seg) {
        this.path.push(a.clone().lerp(b, u / seg));
        this.trackS.push(((i - 1 + u / seg) * this.step) % tr.length);
        u += this.step;
      }
      carry = seg - (u - this.step);
    }
    this.length = this.path.length * this.step;
    this.tops = new Array(this.path.length).fill(null);
  }

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

  /** Top of whatever stands at path point i (ground included), found by looking straight down. */
  private topAt(i: number): number {
    const k = ((i % this.path.length) + this.path.length) % this.path.length;
    const known = this.tops[k];
    if (known !== null && known !== undefined) return known;
    const p = this.path[k]!;
    const ground = this.world.groundHeight(p.x, p.y);
    let top = ground;
    const from = new THREE.Vector3(),
      down = new THREE.Vector3(0, -1, 0);
    const r = 1.2 * this.sc;
    for (const [dx, dz] of [
      [0, 0],
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ] as const) {
      const x = p.x + dx,
        z = p.y + dz;
      const hits = this.solids.filter(
        (s) => x >= s.box.min.x && x <= s.box.max.x && z >= s.box.min.z && z <= s.box.max.z,
      );
      if (!hits.length) continue;
      from.set(x, ground + 80 * this.sc, z);
      this.ray.set(from, down);
      this.ray.far = 80 * this.sc + 2 * this.sc;
      const hit = this.ray.intersectObjects(
        hits.map((s) => s.obj),
        false,
      )[0];
      if (hit) top = Math.max(top, hit.point.y);
    }
    this.tops[k] = top;
    return top;
  }

  /** How high above the ground to cruise here: swells between low and high, two rhythms mixed. */
  private cruise(d: number): number {
    const u = d / (this.speed * 26);
    const k = 0.5 - 0.5 * Math.cos(u * Math.PI * 2) * 0.75 - 0.25 * Math.cos(u * 4.7 + 1.3);
    return (LOW + (HIGH - LOW) * Math.min(1, Math.max(0, k))) * this.sc;
  }

  private pointAt(d: number, out: THREE.Vector2): THREE.Vector2 {
    const n = this.path.length;
    const f = d / this.step;
    const i = Math.floor(f);
    const a = this.path[((i % n) + n) % n]!,
      b = this.path[(((i + 1) % n) + n) % n]!;
    return out.copy(a).lerp(b, f - i);
  }

  /** Height the drone should be at, at distance d: cruising, but over anything in the way ahead. */
  private wantAlt(d: number): number {
    const i = Math.floor(d / this.step);
    const p = this.path[((i % this.path.length) + this.path.length) % this.path.length]!;
    const ground = this.world.groundHeight(p.x, p.y);
    let want = ground + this.cruise(d);
    // Look ahead (and a little behind): rise early for what's coming, stay up till it's passed.
    const ahead = Math.ceil((12 * this.sc) / this.step);
    for (let k = -2; k <= ahead; k++) {
      const top = this.topAt(i + k);
      if (top > ground + 0.3 * this.sc) want = Math.max(want, top + 2.2 * this.sc);
    }
    return want;
  }

  frame(dt: number): void {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    // Ease in at the start and out at the end.
    const total = this.length / this.speed;
    const tLeft = total - this.dist / this.speed;
    const ease = Math.min(1, this.t / 3, Math.max(0.15, tLeft / 3));
    this.dist += this.speed * ease * dt;
    if (this.dist >= this.length - this.step) {
      this.dist = this.length - this.step;
      this.done = true;
    }
    this.progress = this.dist / this.length;

    const p = this.pointAt(this.dist, new THREE.Vector2());
    const want = this.wantAlt(this.dist);
    if (!this.started) {
      this.alt = want;
      this.started = true;
    }
    // Glide toward the cruising height, but never into anything right underneath.
    this.alt += (want - this.alt) * Math.min(1, dt * 1.2);
    const floor = this.topAt(Math.floor(this.dist / this.step)) + 1.2 * this.sc;
    this.alt = Math.max(this.alt, floor, this.world.groundHeight(p.x, p.y) + LOW * this.sc * 0.8);
    this.camera.position.set(p.x, this.alt, p.y);

    // Look ahead along the way, panning slowly to the sides, slightly down, never straight down.
    const lookD = 22 * this.sc;
    const q = this.pointAt(this.dist + lookD, new THREE.Vector2());
    const fwd = new THREE.Vector3(q.x - p.x, 0, q.y - p.y).normalize();
    const pan = Math.sin(this.t * 0.11) * 0.55 + Math.sin(this.t * 0.047 + 1) * 0.25;
    fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), pan);
    const above = this.alt - this.world.groundHeight(p.x, p.y);
    const drop = Math.min(above * 0.55, lookD * 0.3);
    const target = new THREE.Vector3(p.x + fwd.x * lookD, this.alt - drop, p.y + fwd.z * lookD);
    if (this.t < dt * 1.5) this.look.copy(target);
    this.look.lerp(target, Math.min(1, dt * 2));
    this.camera.lookAt(this.look);

    // Captions: the part of the course being flown over.
    const ts = this.trackS[Math.floor(this.dist / this.step) % this.trackS.length] ?? 0;
    let name = '';
    for (const st of this.entry.stops ?? []) if (ts >= st.s) name = st.name;
    this.caption = name;

    this.world.applyAtmosphere(this.world.atmosphereAt(ts, true));
    this.world.focusSun(
      this.camera.position.clone().add(fwd.clone().multiplyScalar(lookD * 0.6)),
      Math.max(60, 30 * this.sc),
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
