import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rohirrim } from '../characters.ts';
import { DETAIL, MAT } from '../modelKit.ts';
import * as tex from '../textures.ts';
import type { DressContext } from '../themes.ts';
import { off, tv } from '../trackMesh.ts';

/**
 * The Pelennor Fields and Minas Tirith: the white city's Great Gate and tiers,
 * houses stacked up the switchbacks, the rock prow and the White Tower, siege
 * towers and orc hosts on the burning fields, the Rohirrim charging.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

let treeBanner: THREE.Texture | null = null;
function whiteTree(): THREE.Texture {
  treeBanner ??= tex.decal(
    (x, w, h) => {
      x.fillStyle = '#121214';
      x.fillRect(0, 0, w, h);
      x.strokeStyle = '#f2efe6';
      x.fillStyle = '#f2efe6';
      x.lineWidth = 6;
      const cx = w / 2;
      x.beginPath();
      x.moveTo(cx, h * 0.85);
      x.lineTo(cx, h * 0.3);
      x.stroke();
      for (let k = 0; k < 4; k++) {
        const y = h * (0.35 + k * 0.1);
        for (const s of [-1, 1]) {
          x.beginPath();
          x.moveTo(cx, y);
          x.quadraticCurveTo(cx + s * 30, y - 20, cx + s * (50 - k * 8), y - 40);
          x.stroke();
        }
      }
      for (let k = 0; k < 7; k++) {
        const a = Math.PI + ((k + 0.5) / 7) * Math.PI;
        x.beginPath();
        x.arc(cx + Math.cos(a) * 70, h * 0.25 + Math.sin(a) * 40, 6, 0, Math.PI * 2);
        x.fill();
      }
    },
    256,
    512,
  );
  return treeBanner;
}

function banner(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 6),
    new THREE.MeshStandardMaterial({ map: whiteTree(), side: THREE.DoubleSide, roughness: 0.9 }),
  );
  m.castShadow = true;
  return m;
}

export function dressPelennor(ctx: DressContext): (t: number, dt: number) => void {
  const { scene, track, terrain } = ctx;
  const marks = track.def.marks ?? {};
  const animated: ((t: number, dt: number) => void)[] = [];
  const white = new THREE.MeshStandardMaterial({ map: tex.paving('#ece8de'), roughness: 0.8 });
  const gate0 = marks.greatGate ?? 3269,
    prow = marks.prow ?? 3511;

  // ---------------- The Great Gate and the first wall, curving away on both sides.
  {
    const f = track.frameAtS(gate0);
    const along = V(f.tan.x, 0, f.tan.z).normalize();
    const right = new THREE.Vector3().crossVectors(along, V(0, 1, 0));
    const wallH = 26;
    for (const side of [-1, 1]) {
      // Wall segments sweeping back in an arc from the gate.
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * 1.2 * side;
        const R = 220;
        const centre = tv(f.pos).addScaledVector(along, R);
        const dir = along
          .clone()
          .negate()
          .applyAxisAngle(V(0, 1, 0), a + side * 0.07);
        const p = centre.clone().addScaledVector(dir, R);
        const seg = new THREE.Mesh(new THREE.BoxGeometry(32, wallH, 8), white);
        seg.position.set(p.x, f.pos.y + wallH / 2 - 2, p.z);
        seg.lookAt(centre.x, seg.position.y, centre.z);
        seg.castShadow = seg.receiveShadow = true;
        if (k === 0) seg.position.addScaledVector(right, side * 4);
        scene.add(seg);
      }
    }
    // Gatehouse towers and lintel over the road.
    for (const side of [-1, 1]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(12, 36, 12), white);
      tower.position.copy(tv(off(f, side * 16, 18)));
      tower.castShadow = true;
      scene.add(tower);
      const b = banner();
      b.position.copy(tv(off(f, side * 16, 26))).addScaledVector(along, -6.2);
      b.lookAt(b.position.clone().addScaledVector(along, -1));
      scene.add(b);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(22, 8, 12), white);
    lintel.position.copy(tv(off(f, 0, 30)));
    lintel.lookAt(lintel.position.clone().add(along));
    scene.add(lintel);
    // The broken gate doors lying on the ground (Grond came through).
    const iron = DETAIL.steel(0x2a2a2c);
    for (const side of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 18), iron);
      door.position.copy(tv(off(f, side * 13, 0.2))).addScaledVector(along, 10);
      door.rotation.y = Math.atan2(along.x, along.z) + side * 0.4;
      door.rotation.z = side * 0.08;
      scene.add(door);
    }
  }

  // ---------------- White houses stacked around the switchbacks.
  {
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const houses: THREE.Matrix4[] = [];
    const roofs: THREE.Matrix4[] = [];
    for (let s = gate0 + 10; s < prow; s += 7) {
      const f = track.frameAtS(s);
      for (const side of [-1, 1]) {
        for (const lat of [13, 22, 31]) {
          const p = off(f, side * lat, 0);
          const gy = terrain.height(p.x, p.z);
          const w = 6 + ((s * 13 + lat) % 5),
            h = 7 + ((s * 7 + lat * 3) % 9),
            d = 6 + ((s + lat) % 4);
          const m = new THREE.Matrix4().compose(
            V(p.x, Math.min(gy, f.pos.y) - 1, p.z),
            new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(f.tan.x, f.tan.z)),
            V(w, h + Math.max(0, f.pos.y - gy), d),
          );
          houses.push(m);
          roofs.push(
            new THREE.Matrix4().compose(
              V(p.x, Math.min(gy, f.pos.y) - 1 + h + Math.max(0, f.pos.y - gy), p.z),
              new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(f.tan.x, f.tan.z)),
              V(w + 0.6, 0.6, d + 0.6),
            ),
          );
        }
      }
    }
    const hm = new THREE.InstancedMesh(box, white, houses.length);
    houses.forEach((m, i) => hm.setMatrixAt(i, m));
    hm.castShadow = hm.receiveShadow = true;
    scene.add(hm);
    const rm = new THREE.InstancedMesh(box, MAT.paint(0xb8b0a0, 0.8, 0), roofs.length);
    roofs.forEach((m, i) => rm.setMatrixAt(i, m));
    scene.add(rm);
  }

  // ---------------- The prow under the jump lip, and the White Tower above.
  {
    const f = track.frameAtS(prow + 24);
    const along = V(f.tan.x, 0, f.tan.z).normalize();
    const right = new THREE.Vector3().crossVectors(along, V(0, 1, 0));
    const shape = new THREE.Shape([
      new THREE.Vector2(0, 0),
      new THREE.Vector2(-60, 0),
      new THREE.Vector2(-60, -80),
      new THREE.Vector2(-8, -80),
    ]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 24, bevelEnabled: false });
    geo.translate(0, 0, -12);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 8, uv.getY(i) / 8);
    const rock = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ map: tex.paving('#dcd8cc'), roughness: 0.9 }),
    );
    rock.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(along, V(0, 1, 0), right.clone().negate()),
    );
    rock.position.copy(tv(f.pos)).add(V(0, -0.9, 0));
    rock.castShadow = rock.receiveShadow = true;
    scene.add(rock);
    const tower = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(5, 6.5, 80, 16), white);
    shaft.position.y = 40;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 5, 6, 16), white);
    top.position.y = 83;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(2, 14, 12), white);
    spire.position.y = 93;
    tower.add(shaft, top, spire);
    const b = banner();
    b.position.set(0, 70, 6.6);
    tower.add(b);
    tower.position.copy(tv(off(track.frameAtS(prow - 20), 60, 10)));
    tower.traverse((o) => (o.castShadow = true));
    scene.add(tower);
  }

  // ---------------- The fields: siege towers, orc hosts, the Rohirrim charge.
  {
    const s0 = marks.oliphaunts ?? 3119;
    const wood = new THREE.MeshStandardMaterial({ map: tex.planks(), roughness: 0.85 });
    for (let i = 0; i < 4; i++) {
      const f = track.frameAtS(s0 + 20 + i * 45);
      const p = off(f, -50 - (i % 2) * 25, 0);
      const tower = siegeTower(wood);
      tower.position.set(p.x, terrain.height(p.x, p.z), p.z);
      // Rolling toward the city walls, broadly the way the racers are going.
      tower.rotation.y = Math.atan2(f.tan.x, f.tan.z) + (i - 1.5) * 0.25;
      scene.add(tower);
    }
    // Orc host: a dark mass of instanced figures in blocks.
    const orcGeo = mergeGeometries([
      new THREE.CapsuleGeometry(0.35, 0.8, 3, 6).translate(0, 0.75, 0).toNonIndexed(),
      new THREE.SphereGeometry(0.25, 6, 5).translate(0, 1.55, 0).toNonIndexed(),
      new THREE.ConeGeometry(0.06, 2.4, 4).translate(0.3, 1.6, 0).toNonIndexed(),
    ])!;
    const orcs: THREE.Matrix4[] = [];
    for (let b = 0; b < 5; b++) {
      const f = track.frameAtS(s0 + b * 40);
      for (let i = 0; i < 12; i++)
        for (let j = 0; j < 10; j++) {
          const p = off(f, -70 - j * 2.2 - (b % 2) * 30, (i - 6) * 2.2);
          const q = off(
            track.frameAtS(s0 + b * 40 + (i - 6) * 2.2),
            -70 - j * 2.2 - (b % 2) * 30,
            0,
          );
          orcs.push(new THREE.Matrix4().makeTranslation(q.x, terrain.height(q.x, q.z), q.z));
          void p;
        }
    }
    const om = new THREE.InstancedMesh(orcGeo, MAT.paint(0x2a2622, 0.9, 0.1), orcs.length);
    orcs.forEach((m, i) => om.setMatrixAt(i, m));
    scene.add(om);
    // The Rohirrim charge: a line of riders galloping over the fields beside the road.
    const riders: {
      g: THREE.Group;
      anim: (t: number, sp: number, dt: number) => void;
      lat: number;
    }[] = [];
    for (let i = 0; i < 6; i++) {
      const r = rohirrim();
      scene.add(r.group);
      riders.push({ g: r.group, anim: r.animate, lat: 38 + (i % 3) * 5 });
    }
    let run = 0;
    animated.push((t, dt) => {
      run = (run + dt * 22) % 260;
      riders.forEach((r, i) => {
        const s = s0 - 40 + run + (i % 3) * 6 - Math.floor(i / 3) * 10;
        const f = track.frameAtS(s);
        const p = off(f, r.lat, 0);
        r.g.position.set(p.x, terrain.height(p.x, p.z), p.z);
        r.g.rotation.y = Math.atan2(-f.tan.x, -f.tan.z);
        r.anim(t, 22, dt);
      });
    });
  }

  // ---------------- Osgiliath: the ruined city where the prow jump lands, on the way to Mordor.
  scene.add(osgiliath(ctx, prow + 90, (marks.blackGate ?? 3882) - 35));

  return (t, dt) => animated.forEach((a) => a(t, dt));
}

/** Ruined halls, colonnades and broken arches either side of the road, all ash-stained. */
function osgiliath(ctx: DressContext, s0: number, s1: number): THREE.Mesh {
  const { track, terrain } = ctx;
  const parts: THREE.BufferGeometry[] = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ground = (x: number, z: number) => terrain.height(x, z);
  const put = (geo: THREE.BufferGeometry, x: number, y: number, z: number, yaw: number) =>
    parts.push(geo.rotateY(yaw).translate(x, y, z));
  for (let s = s0; s < s1; s += 26) {
    const f = track.frameAtS(s);
    const yaw = Math.atan2(f.tan.x, f.tan.z);
    for (const side of [-1, 1]) {
      const lat = side * (17 + rnd() * 16);
      const p = off(f, lat, 0);
      const y = ground(p.x, p.z) - 0.5;
      const kind = Math.floor(rnd() * 3);
      if (kind === 0) {
        // A roofless hall: four walls of broken, gap-toothed masonry.
        const w = 10 + rnd() * 8,
          d = 8 + rnd() * 6;
        for (const [wx, wz, len, along] of [
          [0, -d / 2, w, true],
          [0, d / 2, w, true],
          [-w / 2, 0, d, false],
          [w / 2, 0, d, false],
        ] as [number, number, number, boolean][]) {
          const n = 4;
          for (let k = 0; k < n; k++) {
            if (rnd() < 0.22) continue; // collapsed
            const h = 2 + rnd() * 9;
            const t = (k + 0.5) / n - 0.5;
            const lx = wx + (along ? t * len : 0),
              lz = wz + (along ? 0 : t * len);
            const seg = new THREE.BoxGeometry(along ? len / n : 1, h, along ? 1 : len / n);
            const c = Math.cos(yaw),
              sn = Math.sin(yaw);
            put(seg.translate(0, h / 2, 0), p.x + lx * c + lz * sn, y, p.z - lx * sn + lz * c, yaw);
          }
        }
      } else if (kind === 1) {
        // A colonnade: a row of columns, a few still carrying their beam.
        const n = 5;
        const hs = Array.from({ length: n }, () => (rnd() < 0.55 ? 8 : 2 + rnd() * 5));
        for (let k = 0; k < n; k++) {
          const q = off(track.frameAtS(s + (k - 2) * 4), lat, 0);
          put(
            new THREE.CylinderGeometry(0.55, 0.65, hs[k]!, 10).translate(0, hs[k]! / 2, 0),
            q.x,
            y,
            q.z,
            0,
          );
          if (k > 0 && hs[k] === 8 && hs[k - 1] === 8) {
            const m = off(track.frameAtS(s + (k - 2.5) * 4), lat, 0);
            put(new THREE.BoxGeometry(1.2, 0.8, 4.6).translate(0, 8.4, 0), m.x, y, m.z, yaw);
          }
        }
      } else {
        // A broken arch on two piers, and a shattered dome beside it.
        put(
          new THREE.BoxGeometry(1.8, 9, 1.8).translate(-4, 4.5, 0),
          p.x,
          y,
          p.z,
          yaw + Math.PI / 2,
        );
        put(new THREE.BoxGeometry(1.8, 6, 1.8).translate(4, 3, 0), p.x, y, p.z, yaw + Math.PI / 2);
        put(
          new THREE.TorusGeometry(4, 0.8, 6, 12, Math.PI * 0.62)
            .scale(1, 1, 1.8)
            .translate(0, 9, 0),
          p.x,
          y,
          p.z,
          yaw + Math.PI / 2,
        );
        const q = off(f, lat + side * 10, 0);
        put(
          new THREE.SphereGeometry(6, 14, 8, 0, Math.PI * 1.3, 0, Math.PI / 2).translate(0, 3, 0),
          q.x,
          ground(q.x, q.z) - 0.5,
          q.z,
          rnd() * 6,
        );
        put(
          new THREE.CylinderGeometry(6.2, 6.2, 3.2, 16, 1, true).translate(0, 1.6, 0),
          q.x,
          ground(q.x, q.z) - 0.5,
          q.z,
          0,
        );
      }
      // Rubble.
      for (let k = 0; k < 5; k++) {
        const q = off(track.frameAtS(s + (rnd() - 0.5) * 20), lat + (rnd() - 0.5) * 14, 0);
        put(
          new THREE.BoxGeometry(0.8 + rnd() * 1.6, 0.5 + rnd(), 0.8 + rnd() * 1.4).rotateZ(
            (rnd() - 0.5) * 0.8,
          ),
          q.x,
          ground(q.x, q.z),
          q.z,
          rnd() * 3,
        );
      }
    }
  }
  const stone = new THREE.MeshStandardMaterial({
    map: tex.rock('#a49c8c'),
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(
    mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!,
    stone,
  );
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** An orc siege tower: tapering timber frame, hide-hung sides, wheels and a raised drawbridge. */
function siegeTower(wood: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const hide = MAT.paint(0x3a2c22, 0.95, 0);
  const iron = MAT.paint(0x2a2826, 0.6, 0.6);
  const H = 26;
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m = wood) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.castShadow = true;
    g.add(b);
    return b;
  };
  // Corner posts leaning in toward the top.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const post = box(0.7, H, 0.7, sx * 3.4, H / 2, sz * 3.4);
      post.rotation.set(sz * 0.05, 0, -sx * 0.05);
    }
  // Floors and cross-bracing every few metres.
  for (let k = 1; k <= 4; k++) {
    const y = k * (H / 4.4);
    const w = 7.4 - k * 0.45;
    box(w, 0.4, w, 0, y, 0);
    const brace = box(0.3, 7, 0.3, 0, y - 2.6, -w / 2);
    brace.rotation.z = 0.9;
  }
  // Hide hung on the back and sides; the front stays open behind the bridge.
  box(6.6, H * 0.85, 0.2, 0, H * 0.48, -3.3, hide);
  for (const sx of [-1, 1]) box(0.2, H * 0.85, 6.6, sx * 3.3, H * 0.48, 0, hide);
  // Drawbridge raised at the top, chains to the frame.
  const bridge = box(4.6, 6.5, 0.4, 0, H - 2.4, 3.6);
  bridge.rotation.x = -0.25;
  for (const sx of [-1, 1]) {
    const chain = box(0.12, 4.5, 0.12, sx * 2, H + 0.4, 2.2, iron);
    chain.rotation.x = 0.9;
  }
  // Iron spikes on top.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) box(0.25, 2.5, 0.25, sx * 2.6, H + 1.2, sz * 2.6, iron);
  // Huge solid wheels.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.6, 14), wood);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx * 3.9, 1.5, sz * 2.6);
      g.add(w);
    }
  return g;
}
