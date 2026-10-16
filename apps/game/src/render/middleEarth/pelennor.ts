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
      const tower = new THREE.Mesh(new THREE.BoxGeometry(7, 24, 7).translate(0, 12, 0), wood);
      tower.position.set(p.x, terrain.height(p.x, p.z), p.z);
      tower.rotation.y = i;
      tower.castShadow = true;
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

  return (t, dt) => animated.forEach((a) => a(t, dt));
}
