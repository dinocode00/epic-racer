import * as THREE from 'three';
import type { ItemSystem, KartState, Track } from '@epic/sim';
import type { Effects } from './effects.ts';
import { tube } from './modelKit.ts';
import * as tex from './textures.ts';

/**
 * Everything items put into the world: glowing boxes, arrows, fireworks, the Mach 5's
 * robot bird, caltrops on the road, and the Balrog's whip coming down on the leader.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const tmp = new THREE.Vector3();

function boxTexture(): THREE.Texture {
  return tex.decal(
    (x, w, h) => {
      x.clearRect(0, 0, w, h);
      x.font = `bold ${h * 0.72}px Arial Black, sans-serif`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.lineWidth = h * 0.08;
      x.strokeStyle = '#5a3a00';
      x.strokeText('?', w / 2, h / 2 + h * 0.04);
      x.fillStyle = '#fff6c8';
      x.fillText('?', w / 2, h / 2 + h * 0.04);
    },
    128,
    128,
  );
}

function arrowVolley(): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.6 });
  const tip = new THREE.MeshStandardMaterial({
    color: 0xdfe9ff,
    emissive: 0x8fb4ff,
    emissiveIntensity: 1.2,
    metalness: 0.8,
    roughness: 0.2,
  });
  for (const [x, y] of [
    [-0.35, 0.9],
    [0.35, 0.95],
    [0, 1.3],
  ] as const) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 6), shaft);
    a.rotation.x = Math.PI / 2;
    a.position.set(x, y, 0);
    const h = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), tip);
    h.rotation.x = -Math.PI / 2;
    h.position.set(x, y, -0.9);
    const f = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xf5f0e6, side: THREE.DoubleSide }),
    );
    f.position.set(x, y, 0.7);
    g.add(a, h, f);
  }
  return g;
}

function firework(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 1.3, 10),
    new THREE.MeshStandardMaterial({ color: 0xc8231c, emissive: 0x5a0a06, roughness: 0.6 }),
  );
  body.rotation.x = Math.PI / 2;
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.24, 0.6, 10),
    new THREE.MeshStandardMaterial({ color: 0xf2c33a, emissive: 0x6a4a08 }),
  );
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -0.95;
  const glow = new THREE.PointLight(0xff8a3a, 30, 14, 1.6);
  glow.position.z = 0.8;
  g.add(body, nose, glow);
  g.position.y = 1.2;
  return g;
}

function robotBird(): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 0.4, roughness: 0.3 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), white);
  body.scale.set(0.8, 0.7, 1.5);
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.35, 8),
    new THREE.MeshStandardMaterial({ color: 0xf2a31a }),
  );
  beak.rotation.x = -Math.PI / 2;
  beak.position.z = -0.6;
  g.add(body, beak);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.4), white);
    wing.position.x = s * 0.6;
    wing.name = 'wing';
    wing.userData.side = s;
    g.add(wing);
  }
  const eye = new THREE.PointLight(0x7ac8ff, 18, 10, 1.6);
  g.add(eye);
  g.position.y = 2;
  return g;
}

function caltrops(): THREE.Group {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x2c2a28, metalness: 0.7, roughness: 0.45 });
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.TetrahedronGeometry(0.28, 0), iron);
    const a = (i / 6) * Math.PI * 2;
    c.position.set(Math.cos(a) * 0.55, 0.15, Math.sin(a) * 0.55);
    c.rotation.set(i, i * 2, i * 3);
    g.add(c);
  }
  // A faint red glint so they read on a small split screen.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.15, 24),
    new THREE.MeshBasicMaterial({
      color: 0xff4a2a,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  g.add(ring);
  return g;
}

/** A fiery whip arc that comes down from the sky onto the target. */
function whipArc(): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3([
    V(-14, 26, 6),
    V(-8, 20, 3),
    V(-3, 9, 1),
    V(0, 0.6, 0),
  ]);
  return new THREE.Mesh(
    tube(
      curve,
      [
        { t: 0, w: 0.9, h: 0.9 },
        { t: 1, w: 0.25, h: 0.25 },
      ],
      24,
      8,
      V(0, 0, 1),
    ),
    new THREE.MeshBasicMaterial({ color: 0xff6a14, transparent: true, opacity: 0.95 }),
  );
}

export class ItemViews {
  readonly group = new THREE.Group();
  private boxes: THREE.Group[] = [];
  private projectiles = new Map<number, THREE.Object3D>();
  private traps = new Map<number, THREE.Object3D>();
  private warnRings = new Map<number, THREE.Mesh>();
  private lashes: { mesh: THREE.Mesh; t: number }[] = [];
  private t = 0;

  constructor(
    private track: Track,
    private items: ItemSystem,
  ) {
    const q = boxTexture();
    const shell = new THREE.MeshStandardMaterial({
      color: 0xffd46a,
      emissive: 0xffb13a,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.55,
      roughness: 0.15,
      metalness: 0.2,
    });
    const qMat = new THREE.SpriteMaterial({ map: q, depthWrite: false });
    for (const b of items.boxes) {
      const g = new THREE.Group();
      const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 0), shell);
      const mark = new THREE.Sprite(qMat);
      mark.scale.setScalar(1.1);
      g.add(gem, mark);
      const p = track.pointAt(b.s, b.lat, 1.3);
      g.position.set(p.x, p.y, p.z);
      g.userData.phase = b.s * 0.1 + b.lat;
      this.boxes.push(g);
      this.group.add(g);
    }
  }

  update(time: number, karts: KartState[], fx: Effects, dt: number): void {
    this.t += dt;
    // Boxes spin and bob; taken boxes shrink away and pop back.
    this.items.boxes.forEach((b, i) => {
      const g = this.boxes[i]!;
      const away = b.takenUntil - time;
      const scale = away > 0 ? Math.max(0, 1 - (3 - away) * 4) : Math.min(1, g.scale.x + dt * 4);
      g.scale.setScalar(Math.max(0.001, scale));
      g.children[0]!.rotation.set(this.t * 0.9, this.t * 1.3 + g.userData.phase, 0);
      g.position.y += Math.sin(this.t * 2.4 + g.userData.phase) * 0.004;
    });

    // Projectiles.
    const seen = new Set<number>();
    for (const p of this.items.projectiles) {
      seen.add(p.id);
      let o = this.projectiles.get(p.id);
      if (!o) {
        o = p.kind === 'shot' ? arrowVolley() : p.kind === 'homing' ? firework() : robotBird();
        this.projectiles.set(p.id, o);
        this.group.add(o);
      }
      const f = this.track.frameAtS(p.s);
      const pos = this.track.pointAt(p.s, p.lat, 0);
      const target = p.target !== null ? karts[p.target] : undefined;
      const dir =
        target && p.kind !== 'shot'
          ? Math.sign(
              ((target.s - p.s + this.track.length * 1.5) % this.track.length) -
                this.track.length / 2,
            ) || 1
          : p.dir;
      const look = tmp.set(pos.x - f.tan.x * dir, pos.y - f.tan.y * dir, pos.z - f.tan.z * dir);
      o.position.set(pos.x, pos.y, pos.z);
      o.up.set(f.up.x, f.up.y, f.up.z);
      o.lookAt(look); // +z faces backwards, so the nose (-z) leads
      const y = p.kind === 'robot' ? 2 + Math.sin(this.t * 6) * 0.3 : p.kind === 'homing' ? 1.2 : 0;
      o.translateY(y);
      if (p.kind === 'robot')
        o.children.forEach((c) => {
          if (c.name === 'wing') c.rotation.z = Math.sin(this.t * 22) * 0.6 * c.userData.side;
        });
      // Trails: fireworks spit sparks, the robot leaves a blue shimmer.
      const w = o.getWorldPosition(new THREE.Vector3());
      if (p.kind === 'homing')
        for (let i = 0; i < 3; i++)
          fx.sparks.emit(
            w,
            V((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3),
            new THREE.Color().setHSL(0.05 + Math.random() * 0.1, 1, 0.6),
            1,
            0.35,
            0.5,
          );
      else if (p.kind === 'robot')
        fx.sparks.emit(w, V(0, 0, 0), new THREE.Color(0.5, 0.8, 1.6), 0.8, 0.3, 0.4);
    }
    for (const [id, o] of this.projectiles)
      if (!seen.has(id)) {
        this.group.remove(o);
        this.projectiles.delete(id);
      }

    // Traps.
    const live = new Set<number>();
    for (const tr of this.items.traps) {
      live.add(tr.id);
      if (this.traps.has(tr.id)) continue;
      const o = caltrops();
      const p = this.track.pointAt(tr.s, tr.lat, 0.02);
      const f = this.track.frameAtS(tr.s);
      o.position.set(p.x, p.y, p.z);
      o.quaternion.setFromUnitVectors(V(0, 1, 0), V(f.up.x, f.up.y, f.up.z));
      this.traps.set(tr.id, o);
      this.group.add(o);
    }
    for (const [id, o] of this.traps)
      if (!live.has(id)) {
        this.group.remove(o);
        this.traps.delete(id);
      }

    // The whip: a pulsing red ring under the leader, then the lash.
    const striking = new Set<number>();
    for (const st of this.items.strikes) {
      striking.add(st.id);
      let ring = this.warnRings.get(st.id);
      if (!ring) {
        ring = new THREE.Mesh(
          new THREE.RingGeometry(2.2, 2.8, 32),
          new THREE.MeshBasicMaterial({ color: 0xff3a14, transparent: true, depthWrite: false }),
        );
        this.warnRings.set(st.id, ring);
        this.group.add(ring);
      }
      const k = karts[st.target]!;
      const f = this.track.frameAtS(k.s);
      const p = this.track.pointAt(k.s, k.lat, 0.1);
      ring.position.set(p.x, p.y, p.z);
      ring.quaternion.setFromUnitVectors(V(0, 0, 1), V(f.up.x, f.up.y, f.up.z));
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.5 * Math.sin(this.t * 18);
      ring.scale.setScalar(0.6 + st.time * 0.5);
    }
    for (const [id, r] of this.warnRings)
      if (!striking.has(id)) {
        this.group.remove(r);
        this.warnRings.delete(id);
      }
    for (const e of this.items.takeLog())
      if (e.kind === 'lash') {
        const k = karts[e.kart]!;
        const m = whipArc();
        m.position.set(k.pos.x, k.pos.y, k.pos.z);
        m.rotation.y = Math.random() * Math.PI * 2;
        this.group.add(m);
        this.lashes.push({ mesh: m, t: 0.45 });
        for (let i = 0; i < 40; i++)
          fx.sparks.emit(
            V(k.pos.x, k.pos.y + 0.5, k.pos.z),
            V((Math.random() - 0.5) * 14, Math.random() * 10, (Math.random() - 0.5) * 14),
            new THREE.Color(1.6, 0.6, 0.1),
            1,
            0.5,
            0.8,
          );
      }
    for (let i = this.lashes.length - 1; i >= 0; i--) {
      const l = this.lashes[i]!;
      l.t -= dt;
      (l.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, l.t / 0.45);
      if (l.t <= 0) {
        this.group.remove(l.mesh);
        this.lashes.splice(i, 1);
      }
    }
  }
}
