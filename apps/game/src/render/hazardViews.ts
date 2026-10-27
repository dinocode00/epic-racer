import * as THREE from 'three';
import type { HazardState, Track } from '@epic/sim';
import { balrog, gandalfCart, oliphaunt, rohirrim } from './characters.ts';
import type { Effects } from './effects.ts';
import { DETAIL, MAT, tube } from './modelKit.ts';
import { nazgul } from './nazgul.ts';
import { hayBale, sheep } from './props/shire.ts';
import * as tex from './textures.ts';
import { off } from './trackMesh.ts';

/**
 * Visuals for track hazards. Each kind gets a model that follows the live hazard state
 * (position, warning, strike). Strikers paint a pulsing ring on the road before they hit.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

interface Ctx {
  track: Track;
  fx: Effects;
  t: number;
  dt: number;
}

interface HazardView {
  root: THREE.Object3D;
  update(h: HazardState, c: Ctx): void;
}

// Scratch values for the per-frame updates (no garbage for the collector to clear up).
const sA = new THREE.Vector3();
const sB = new THREE.Vector3();
const sC = new THREE.Vector3();
const sM = new THREE.Matrix4();
const WORLD_UP = V(0, 1, 0);
const WHIP_SPARK = new THREE.Color(1.6, 0.6, 0.15);
const SPRAY = new THREE.Color(0.95, 0.97, 1);
const LAVA = new THREE.Color(1.6, 0.6, 0.1);
const TRAIL_SMOKE = new THREE.Color(0.3, 0.28, 0.26);
const RISE = V(0, 1, 0);
const DRIFT_UP = V(0, 0.4, 0);
const DOWN = V(0, -1, 0);

type RoadFrame = {
  pos: THREE.Vector3;
  tan: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
};
// A small ring of reusable frames: an update uses at most three at once, and none is kept
// past the frame it was made in.
const frames: RoadFrame[] = Array.from({ length: 16 }, () => ({
  pos: new THREE.Vector3(),
  tan: new THREE.Vector3(),
  up: new THREE.Vector3(),
  right: new THREE.Vector3(),
}));
let nextFrame = 0;

/** Road frame at a hazard: position on the surface plus basis vectors (valid this frame). */
function frameAt(track: Track, s: number, lat: number): RoadFrame {
  const f = track.frameAtS(s);
  const p = off(f, lat, 0);
  const r = frames[nextFrame]!;
  nextFrame = (nextFrame + 1) % frames.length;
  r.pos.set(p.x, p.y, p.z);
  r.tan.set(f.tan.x, f.tan.y, f.tan.z);
  r.up.set(f.up.x, f.up.y, f.up.z);
  r.right.set(f.right.x, f.right.y, f.right.z);
  return r;
}

/** Orient an object: local -Z along `dir`, local +Y along `up`. */
function face(o: THREE.Object3D, dir: THREE.Vector3, up: THREE.Vector3): void {
  const back = sA.copy(dir).negate().normalize();
  const right = sB.crossVectors(up, back).normalize();
  const u = sC.crossVectors(back, right);
  o.quaternion.setFromRotationMatrix(sM.makeBasis(right, u, back));
}

/**
 * A tapering tube through three moving points, rewritten in place each frame (building a
 * new geometry every frame churns memory and re-uploads buffers to the GPU).
 */
class LiveTube {
  readonly geometry = new THREE.BufferGeometry();
  readonly points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private curve = new THREE.CatmullRomCurve3(this.points);
  private pos: Float32Array;
  private nrm: Float32Array;
  private p = new THREE.Vector3();
  private t = new THREE.Vector3();
  private side = new THREE.Vector3();
  private nup = new THREE.Vector3();
  constructor(
    private segs: number,
    private around: number,
    private r0: number,
    private r1: number,
  ) {
    const n = (segs + 1) * (around + 1);
    this.pos = new Float32Array(n * 3);
    this.nrm = new Float32Array(n * 3);
    const idx: number[] = [];
    const uv = new Float32Array(n * 2);
    for (let i = 0; i <= segs; i++)
      for (let j = 0; j <= around; j++) {
        uv[(i * (around + 1) + j) * 2] = j / around;
        uv[(i * (around + 1) + j) * 2 + 1] = i / segs;
      }
    for (let i = 0; i < segs; i++)
      for (let j = 0; j < around; j++) {
        const a = i * (around + 1) + j,
          b = a + around + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    this.geometry.setIndex(idx);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    (this.geometry.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    (this.geometry.attributes.normal as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  }
  /** Rebuild from the current `points`. */
  update(): void {
    const { segs, around } = this;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      this.curve.getPoint(u, this.p);
      this.curve.getTangent(u, this.t);
      this.side.crossVectors(this.t, WORLD_UP);
      if (this.side.lengthSq() < 1e-6) this.side.set(1, 0, 0);
      this.side.normalize();
      this.nup.crossVectors(this.side, this.t).normalize();
      const r = this.r0 + (this.r1 - this.r0) * u;
      for (let j = 0; j <= around; j++) {
        const th = (j / around) * Math.PI * 2;
        const cs = Math.cos(th),
          sn = Math.sin(th);
        const o = (i * (around + 1) + j) * 3;
        const nx = this.side.x * cs + this.nup.x * sn,
          ny = this.side.y * cs + this.nup.y * sn,
          nz = this.side.z * cs + this.nup.z * sn;
        this.nrm[o] = nx;
        this.nrm[o + 1] = ny;
        this.nrm[o + 2] = nz;
        this.pos[o] = this.p.x + nx * r;
        this.pos[o + 1] = this.p.y + ny * r;
        this.pos[o + 2] = this.p.z + nz * r;
      }
    }
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.normal!.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }
}

// ---------------------------------------------------------------- telegraph ring

const ringMat = () =>
  new THREE.MeshBasicMaterial({
    color: 0xff8a20,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
function telegraph(r: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.75, r, 40), ringMat());
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}
function updateRing(
  ring: THREE.Mesh,
  h: HazardState,
  c: Ctx,
  base: ReturnType<typeof frameAt>,
): void {
  ring.visible = h.warning || h.active;
  if (!ring.visible) return;
  ring.position.copy(base.pos).addScaledVector(base.up, 0.08);
  face(ring, base.right, base.up);
  ring.rotateX(-Math.PI / 2);
  const m = ring.material as THREE.MeshBasicMaterial;
  m.color.setHex(h.active ? 0xff2a10 : 0xff9a20);
  m.opacity = h.active ? 0.9 : 0.4 + 0.4 * Math.abs(Math.sin(c.t * 12));
  const sc = h.active ? 1.15 : 1 + 0.1 * Math.sin(c.t * 12);
  ring.scale.setScalar(sc);
}

// ---------------------------------------------------------------- views

function simple(
  make: () => THREE.Object3D,
  opts: { lift?: number; spinAcross?: boolean } = {},
): (h: HazardState) => HazardView {
  return () => {
    const root = new THREE.Group();
    const model = make();
    root.add(model);
    let lastLat = 0;
    return {
      root,
      update(h, c) {
        const b = frameAt(c.track, h.s, h.lat);
        root.position.copy(b.pos).addScaledVector(b.up, opts.lift ?? 0);
        root.visible = h.present;
        const vel = (h.lat - lastLat) / Math.max(1e-3, c.dt);
        lastLat = h.lat;
        face(
          root,
          opts.spinAcross && Math.abs(vel) > 0.01 ? b.right.multiplyScalar(Math.sign(vel)) : b.tan,
          b.up,
        );
        if (opts.spinAcross && h.def.kind === 'barrel') model.rotation.x += vel * c.dt * 1.2;
      },
    };
  };
}

function barrel(): THREE.Object3D {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: tex.planks(), roughness: 0.8 });
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.3, 16).scale(1, 1, 1), wood);
  b.rotation.x = Math.PI / 2;
  b.rotation.z = Math.PI / 2;
  b.position.y = 0.62;
  g.add(b);
  for (const x of [-0.45, 0.45]) {
    const hoop = new THREE.Mesh(
      new THREE.TorusGeometry(0.64, 0.04, 6, 20),
      MAT.paint(0x3a3a3a, 0.5, 0.7),
    );
    hoop.rotation.y = Math.PI / 2;
    hoop.position.set(x, 0.62, 0);
    g.add(hoop);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** Things that move along the road (cart, Nazgûl): face their direction of travel. */
function rider(
  make: () => { group: THREE.Object3D; animate: (t: number, sp: number, dt: number) => void },
  axis: 's' | 'lat',
): (h: HazardState) => HazardView {
  return () => {
    const root = new THREE.Group();
    const m = make();
    root.add(m.group);
    let last = NaN;
    return {
      root,
      update(h, c) {
        const b = frameAt(c.track, h.s, h.lat);
        root.position.copy(b.pos);
        root.visible = h.present;
        const cur = axis === 's' ? h.s : h.lat;
        const vel = Number.isNaN(last) ? 0 : (cur - last) / Math.max(1e-3, c.dt);
        last = cur;
        const dir =
          axis === 's'
            ? b.tan.multiplyScalar(vel >= 0 ? 1 : -1)
            : b.right.multiplyScalar(vel >= 0 ? 1 : -1);
        face(root, dir, b.up);
        m.animate(c.t, Math.abs(vel) * 2.5, c.dt);
      },
    };
  };
}

function firework(): HazardView {
  const root = new THREE.Group();
  const ring = telegraph(2.2);
  const rocket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8),
    MAT.paint(0xd8292b, 0.5, 0),
  );
  root.add(rocket);
  let burst = false;
  return {
    root: new THREE.Group().add(root, ring),
    update(h, c) {
      const b = frameAt(c.track, h.s, h.lat);
      updateRing(ring, h, c, b);
      rocket.visible = h.warning;
      rocket.position
        .copy(b.pos)
        .addScaledVector(b.up, 0.5 + (h.warning ? 3 * Math.abs(Math.sin(c.t * 3)) : 0));
      if (h.active && !burst) {
        burst = true;
        const cols = [
          new THREE.Color(1.6, 0.4, 0.3),
          new THREE.Color(0.4, 0.8, 1.6),
          new THREE.Color(1.6, 1.4, 0.3),
          new THREE.Color(0.5, 1.6, 0.6),
        ];
        for (let i = 0; i < 70; i++) {
          const dir = V(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5)
            .normalize()
            .multiplyScalar(6 + Math.random() * 8);
          c.fx.sparks.emit(
            b.pos.clone().addScaledVector(b.up, 1.5),
            dir,
            cols[i % 4]!,
            1,
            0.3,
            0.9,
          );
        }
      }
      if (!h.active) burst = false;
    },
  };
}

function pillar(): THREE.Object3D {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({
    map: tex.dwarvenTiles(),
    roughness: 0.85,
    color: 0x9a9690,
  });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 34, 8), stone);
  shaft.position.y = 17;
  const base = new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 4), stone);
  base.position.y = 0.8;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 1.6, 4, 8), stone);
  cap.position.y = 32;
  g.add(shaft, base, cap);
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return g;
}

function mallorn(): THREE.Object3D {
  const g = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({
    color: 0xd2d4d8,
    roughness: 0.7,
    bumpMap: tex.coatBump(),
    bumpScale: 2,
  });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.0, 30, 14), bark);
  trunk.position.y = 15;
  g.add(trunk);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(
      new THREE.Mesh(
        tube(
          new THREE.CatmullRomCurve3([
            V(0, 2, 0),
            V(Math.cos(a) * 2, 0.6, Math.sin(a) * 2),
            V(Math.cos(a) * 3.4, 0, Math.sin(a) * 3.4),
          ]),
          [
            { t: 0, w: 0.6, h: 0.6 },
            { t: 1, w: 0.1, h: 0.1 },
          ],
          10,
          8,
        ),
        bark,
      ),
    );
  }
  const gold = new THREE.MeshStandardMaterial({
    color: 0xe2c04a,
    roughness: 0.8,
    flatShading: true,
    emissive: 0x403000,
    emissiveIntensity: 0.3,
  });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(5, 1).scale(1, 0.5, 1), gold);
    leaf.position.set(Math.cos(a) * 5, 30 + (i % 2) * 3, Math.sin(a) * 5);
    g.add(leaf);
  }
  // A glowing elven lantern on the trunk.
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), MAT.glow(0xdfefff, 3));
  lamp.position.set(0, 3, -2);
  g.add(lamp);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

function tentacle(): HazardView {
  const root = new THREE.Group();
  const ring = telegraph(2.6);
  const skin = new THREE.MeshStandardMaterial({
    color: 0x3a4a3a,
    roughness: 0.4,
    metalness: 0.1,
    bumpMap: tex.coatBump(),
    bumpScale: 2,
  });
  const arm = new LiveTube(20, 10, 0.9, 0.15);
  const mesh = new THREE.Mesh(arm.geometry, skin);
  mesh.castShadow = true;
  return {
    root: root.add(ring, mesh),
    update(h, c) {
      const b = frameAt(c.track, h.s, h.lat);
      updateRing(ring, h, c, b);
      // From the dark lake on the left, arching over to the target.
      const [lake, mid, tip] = arm.points as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
      lake.copy(frameAt(c.track, h.s, -18).pos).addScaledVector(b.up, -2);
      const raise = h.active ? 0 : h.warning ? 9 : 6 + Math.sin(c.t * 1.5 + h.index) * 1.5;
      const tipSide = h.active || h.warning ? h.lat : -12 + Math.sin(c.t + h.index) * 2;
      tip.copy(frameAt(c.track, h.s, tipSide).pos).addScaledVector(b.up, raise + 0.4);
      mid
        .copy(lake)
        .lerp(tip, 0.5)
        .addScaledVector(b.up, 8 + raise * 0.4);
      arm.update();
    },
  };
}

function fallingRock(): HazardView {
  const root = new THREE.Group();
  const ring = telegraph(2.2);
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.6, 0),
    new THREE.MeshStandardMaterial({ map: tex.caveRock(), roughness: 1 }),
  );
  rock.castShadow = true;
  let landed = false;
  return {
    root: root.add(ring, rock),
    update(h, c) {
      const b = frameAt(c.track, h.s, h.lat);
      updateRing(ring, h, c, b);
      // Falls during the warning, sits on the road while striking.
      const strikeStart = h.def.strike!.period - h.def.strike!.active;
      const warnStart = strikeStart - h.def.strike!.warn;
      const ph = h.cycle * h.def.strike!.period;
      const fall = h.warning
        ? Math.min(1, (ph - warnStart) / h.def.strike!.warn)
        : h.active
          ? 1
          : 0;
      rock.visible = h.warning || h.active;
      rock.position.copy(b.pos).addScaledVector(b.up, 1.4 + 26 * (1 - fall * fall));
      rock.rotation.x += c.dt * 2;
      if (h.active && !landed) {
        landed = true;
        for (let i = 0; i < 25; i++)
          c.fx.smoke.emit(
            b.pos.clone().addScaledVector(b.up, 0.5),
            V((Math.random() - 0.5) * 6, 2 + Math.random() * 3, (Math.random() - 0.5) * 6),
            new THREE.Color(0.5, 0.48, 0.45),
            0.6,
            1.4,
            1.2,
            2,
          );
      }
      if (!h.active) landed = false;
    },
  };
}

function balrogWhip(): HazardView {
  const root = new THREE.Group();
  const ring = telegraph(2.4);
  const B = balrog();
  B.group.scale.setScalar(1.7);
  root.add(B.group, ring);
  const whipMat = new THREE.MeshBasicMaterial({
    color: 0xffa040,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lash = new LiveTube(24, 6, 0.12, 0.12);
  root.add(new THREE.Mesh(lash.geometry, whipMat));
  return {
    root,
    update(h, c) {
      const b = frameAt(c.track, h.s, h.lat);
      updateRing(ring, h, c, b);
      // The Balrog stands in the chasm beside the bridge, facing it.
      const stand = frameAt(c.track, h.s + 10, 17);
      B.group.position.copy(stand.pos).addScaledVector(stand.up, -12);
      face(B.group, stand.right.negate(), WORLD_UP);
      B.animate(c.t);
      B.group.updateMatrixWorld();
      const [hand, mid, target] = lash.points as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
      B.whipHand.getWorldPosition(hand);
      if (h.active) target.copy(b.pos).addScaledVector(b.up, 0.3);
      else
        target
          .copy(hand)
          .setY(hand.y + 10)
          .addScaledVector(b.tan, -4);
      mid.copy(hand).lerp(target, 0.5);
      mid.y += h.active ? 3 : 6;
      lash.update();
      if (h.active)
        for (let i = 0; i < 4; i++)
          c.fx.sparks.emit(
            target,
            sA.set((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8),
            WHIP_SPARK,
            1,
            0.25,
            0.5,
          );
    },
  };
}

function boulder(): HazardView {
  const root = new THREE.Group();
  const ring = telegraph(3);
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.8, 0),
    new THREE.MeshStandardMaterial({
      map: tex.rock(),
      roughness: 1,
      emissive: 0xff5010,
      emissiveIntensity: 0.6,
    }),
  );
  let landed = false;
  return {
    root: root.add(ring, rock),
    update(h, c) {
      const b = frameAt(c.track, h.s, h.lat);
      updateRing(ring, h, c, b);
      const S = h.def.strike!;
      const ph = h.cycle * S.period;
      const flightStart = S.period - S.active - S.warn;
      const k = h.warning ? (ph - flightStart) / S.warn : h.active ? 1 : 0;
      rock.visible = h.warning;
      // Lobbed from far across the fields (from the east, behind the road's left side).
      const p = sA.copy(b.pos).addScaledVector(b.right, -260);
      p.y += 40;
      p.lerp(b.pos, k);
      p.y += Math.sin(Math.PI * k) * 70;
      rock.position.copy(p);
      rock.rotation.x += c.dt * 3;
      if (h.warning) c.fx.smoke.emit(p, RISE, TRAIL_SMOKE, 0.5, 2.5, 1.2, 2);
      if (h.active && !landed) {
        landed = true;
        for (let i = 0; i < 50; i++)
          c.fx.sparks.emit(
            b.pos.clone().addScaledVector(b.up, 1),
            V((Math.random() - 0.5) * 14, Math.random() * 10, (Math.random() - 0.5) * 14),
            new THREE.Color(1.6, 0.8, 0.2),
            1,
            0.35,
            0.8,
          );
        for (let i = 0; i < 20; i++)
          c.fx.smoke.emit(
            b.pos.clone().addScaledVector(b.up, 1),
            V((Math.random() - 0.5) * 6, 3, (Math.random() - 0.5) * 6),
            new THREE.Color(0.35, 0.3, 0.28),
            0.7,
            2.5,
            1.6,
            3,
          );
      }
      if (!h.active) landed = false;
    },
  };
}

function lavaBurst(): HazardView {
  const root = new THREE.Group();
  const ring = telegraph(2.4);
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xff6a10 }),
  );
  pool.rotation.x = -Math.PI / 2;
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 1.4, 8, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xff7a20,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  return {
    root: root.add(ring, pool, column),
    update(h, c) {
      const b = frameAt(c.track, h.s, h.lat);
      updateRing(ring, h, c, b);
      pool.position.copy(b.pos).addScaledVector(b.up, 0.05);
      pool.visible = h.warning || h.active;
      column.visible = h.active;
      column.position.copy(b.pos).addScaledVector(b.up, 4);
      if (h.active)
        for (let i = 0; i < 6; i++)
          c.fx.sparks.emit(
            sA.copy(b.pos).addScaledVector(b.up, 1),
            sB.set((Math.random() - 0.5) * 6, 8 + Math.random() * 8, (Math.random() - 0.5) * 6),
            LAVA,
            1,
            0.4,
            1.0,
          );
    },
  };
}

/** The Black Gate: two vast towers and iron doors that slam shut across the road. */
function blackGate(): HazardView {
  const root = new THREE.Group();
  const ring = telegraph(7);
  const iron = DETAIL.steel(0x1c1a1a);
  const rockMat = new THREE.MeshStandardMaterial({ map: tex.rock('#2a2624'), roughness: 1 });
  const towers: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(9, 12, 70, 6), rockMat);
    towers.push(t);
    root.add(t);
  }
  const wall = new THREE.Mesh(new THREE.BoxGeometry(80, 30, 6), rockMat);
  root.add(wall);
  const doors: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(9.5, 26, 1.2).translate((-s * 9.5) / 2, 13, 0),
      iron,
    );
    for (let k = 0; k < 6; k++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2, 6).rotateX(Math.PI / 2), iron);
      spike.position.set((-s * (k + 0.5) * 9.5) / 6, 8 + (k % 2) * 8, -1.2);
      door.add(spike);
    }
    hinge.add(door);
    doors.push(hinge);
    root.add(hinge);
  }
  root.add(ring);
  root.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  let open = 1;
  return {
    root,
    update(h, c) {
      const b = frameAt(c.track, h.s, 0);
      const across = b.right;
      const fwd = V(b.tan.x, 0, b.tan.z).normalize();
      towers.forEach((t, i) => {
        t.position
          .copy(b.pos)
          .addScaledVector(across, (i ? 1 : -1) * 22)
          .add(V(0, 30, 0));
      });
      wall.position
        .copy(b.pos)
        .add(V(0, 30, 0))
        .addScaledVector(fwd, 0);
      face(wall, fwd, V(0, 1, 0));
      wall.scale.set(1, 1, 1);
      // Hide the wall's middle above the doorway: two side wall pieces.
      wall.position.y = b.pos.y + 41;
      // Doors swing shut while the hazard is active.
      const want = h.active ? 0 : h.warning ? 0.35 : 1;
      open += (want - open) * Math.min(1, c.dt * (h.warning || h.active ? 6 : 2));
      doors.forEach((d, i) => {
        const s = i ? 1 : -1;
        d.position.copy(b.pos).addScaledVector(across, s * 9.5);
        face(d, fwd, V(0, 1, 0));
        d.rotateY(s * open * 1.4);
      });
      updateRing(ring, h, c, b);
    },
  };
}

/** Barad-dûr and the Eye of Sauron, whose searchlight beam sweeps the road. */
function eyeBeam(): HazardView {
  const root = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x141010,
    roughness: 0.9,
    metalness: 0.3,
    bumpMap: tex.steelBump(),
    bumpScale: 4,
  });
  const tower = new THREE.Group();
  const levels = [
    [26, 34, 60],
    [20, 26, 70],
    [14, 20, 60],
    [9, 14, 50],
  ];
  let y = 0;
  for (const [r0, r1, hgt] of levels) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r0!, r1!, hgt!, 8), rockMat);
    m.position.y = y + hgt! / 2;
    tower.add(m);
    for (let k = 0; k < 8; k++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(2, 18, 5), rockMat);
      const a = (k / 8) * Math.PI * 2;
      spike.position.set(Math.cos(a) * r0!, y + hgt! + 6, Math.sin(a) * r0!);
      spike.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
      tower.add(spike);
    }
    y += hgt!;
  }
  // The two horns that cradle the Eye.
  for (const s of [-1, 1]) {
    tower.add(
      new THREE.Mesh(
        tube(
          new THREE.CatmullRomCurve3([V(s * 6, y, 0), V(s * 9, y + 20, 0), V(s * 6, y + 40, 0)]),
          [
            { t: 0, w: 3, h: 3 },
            { t: 1, w: 0.4, h: 0.4 },
          ],
          16,
          8,
        ),
        rockMat,
      ),
    );
  }
  const eye = new THREE.Group();
  eye.position.set(0, y + 24, 0);
  const fire = new THREE.Mesh(
    new THREE.SphereGeometry(7, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xff7a1a }),
  );
  fire.scale.set(1.5, 1, 0.5);
  const pupil = new THREE.Mesh(
    new THREE.SphereGeometry(7.2, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000 }),
  );
  pupil.scale.set(0.12, 0.85, 0.55);
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(9, 14, 32),
    new THREE.MeshBasicMaterial({
      color: 0xff5010,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  eye.add(fire, pupil, halo);
  tower.add(eye);
  const light = new THREE.PointLight(0xff6020, 200, 400, 1.2);
  light.position.copy(eye.position);
  tower.add(light);
  root.add(tower);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffa040,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 24, 1, true), beamMat);
  root.add(beam);
  const spot = new THREE.Mesh(
    new THREE.CircleGeometry(4.5, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffb060,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  root.add(spot);
  return {
    root,
    update(h, c) {
      const base = frameAt(c.track, h.def.s, -230);
      tower.position.copy(base.pos);
      tower.position.y -= 6;
      const target = frameAt(c.track, h.s, h.lat);
      const eyeWorld = eye.getWorldPosition(sA);
      eye.lookAt(target.pos);
      eye.rotateY(Math.PI / 2);
      // Beam: a long cone from the Eye to the spot on the road.
      const dir = sB.copy(target.pos).sub(eyeWorld);
      const len = dir.length();
      beam.position.copy(eyeWorld).addScaledVector(dir, 0.5);
      beam.scale.set(4.5, len, 4.5);
      beam.quaternion.setFromUnitVectors(DOWN, dir.normalize());
      spot.position.copy(target.pos).addScaledVector(target.up, 0.1);
      face(spot, target.tan, target.up);
      spot.rotateX(-Math.PI / 2);
      (fire.material as THREE.MeshBasicMaterial).color.setHSL(
        0.06,
        1,
        0.5 + 0.08 * Math.sin(c.t * 7),
      );
      halo.rotation.z += c.dt * 0.5;
    },
  };
}

function mud(): THREE.Object3D {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(3, 20),
    new THREE.MeshStandardMaterial({
      map: tex.mud(),
      roughness: 0.3,
      color: 0x6a604a,
      transparent: true,
      opacity: 0.95,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  m.scale.set(1.2, 0.8, 1);
  m.receiveShadow = true;
  return new THREE.Group().add(m);
}

function spray(): HazardView {
  const root = new THREE.Group();
  return {
    root,
    update(h, c) {
      const b = frameAt(c.track, h.s, h.lat);
      if (Math.random() < 0.5)
        c.fx.smoke.emit(
          sA
            .copy(b.pos)
            .add(
              sB.set((Math.random() - 0.5) * 6, 1 + Math.random() * 3, (Math.random() - 0.5) * 6),
            ),
          DRIFT_UP,
          SPRAY,
          0.35,
          2.5,
          1.5,
          2,
        );
    },
  };
}

function generic(h: HazardState): HazardView {
  const root = new THREE.Group();
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(h.def.r, h.def.r, 1.5, 16),
    MAT.paint(0xff3366, 0.6, 0),
  );
  post.position.y = 0.75;
  const ring = telegraph(h.def.r);
  root.add(post);
  return {
    root: new THREE.Group().add(root, ring),
    update(st, c) {
      const b = frameAt(c.track, st.s, st.lat);
      root.position.copy(b.pos);
      updateRing(ring, st, c, b);
    },
  };
}

const REGISTRY: Record<string, (h: HazardState) => HazardView> = {
  hayBale: simple(hayBale),
  sheep: simple(sheep, { spinAcross: true }),
  barrel: simple(barrel, { spinAcross: true }),
  gandalfCart: rider(gandalfCart, 's'),
  firework,
  nazgulRider: rider(() => {
    const m = nazgul(0x000000);
    return { group: m, animate: (t, sp, dt) => m.userData.animate?.(t, sp, dt) };
  }, 's'),
  spray,
  tentacle,
  pillar: simple(pillar),
  fallingRock,
  balrogWhip,
  mallorn: simple(mallorn),
  rohirrim: rider(rohirrim, 'lat'),
  oliphaunt: rider(() => {
    const o = oliphaunt();
    return {
      group: o.group,
      animate: (t: number, sp: number) => o.animate(t, Math.min(1, sp / 3)),
    };
  }, 'lat'),
  boulder,
  gateLeft: blackGate,
  gateRight: () => ({ root: new THREE.Group(), update() {} }),
  lavaBurst,
  eyeBeam,
  mud: simple(mud),
};

/** All hazard visuals for a race. */
export class HazardViews {
  readonly group = new THREE.Group();
  private views: HazardView[];
  private t = 0;

  constructor(
    private track: Track,
    hazards: HazardState[],
  ) {
    this.views = hazards.map((h) => {
      const v = (REGISTRY[h.def.kind] ?? generic)(h);
      this.group.add(v.root);
      return v;
    });
  }

  update(hazards: HazardState[], fx: Effects, dt: number): void {
    this.t += dt;
    const c: Ctx = { track: this.track, fx, t: this.t, dt };
    hazards.forEach((h, i) => this.views[i]!.update(h, c));
  }
}
