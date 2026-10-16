import * as THREE from 'three';
import { DETAIL, MAT, foldedLathe } from '../modelKit.ts';
import { bunting, hobbitHole, partyTree, tent, watermill } from '../props/shire.ts';
import * as tex from '../textures.ts';
import type { DressContext } from '../themes.ts';
import { off, tv } from '../trackMesh.ts';

/**
 * Hobbiton: Bag End and its sign, the Party Tree and Bilbo's birthday party, hobbit
 * holes along the lanes, the Green Dragon inn and the old mill by the pond.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function sign(text: string[], w = 2.4, h = 1.2, bg = '#6b4a2e', fg = '#f5e2b0'): THREE.Group {
  const g = new THREE.Group();
  const t = tex.decal(
    (x, cw, ch) => {
      x.fillStyle = bg;
      x.fillRect(0, 0, cw, ch);
      x.strokeStyle = '#3a2614';
      x.lineWidth = 10;
      x.strokeRect(5, 5, cw - 10, ch - 10);
      x.fillStyle = fg;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      const size = Math.floor(ch / (text.length + 1.2));
      x.font = `bold ${size}px Georgia, serif`;
      text.forEach((line, i) => x.fillText(line, cw / 2, (ch * (i + 1)) / (text.length + 1)));
    },
    512,
    Math.round((512 * h) / w),
  );
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), [
    MAT.paint(0x5a3a22, 0.9, 0),
    MAT.paint(0x5a3a22, 0.9, 0),
    MAT.paint(0x5a3a22, 0.9, 0),
    MAT.paint(0x5a3a22, 0.9, 0),
    new THREE.MeshStandardMaterial({ map: t }),
    new THREE.MeshStandardMaterial({ map: t }),
  ]);
  board.position.y = 1.4 + h / 2;
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.08, 1.6 + h, 6),
    MAT.paint(0x5a3a22, 0.9, 0),
  );
  post.position.y = (1.6 + h) / 2 - 0.1;
  g.add(post, board);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** A hobbit: small, curly-haired, waistcoat, bare hairy feet. ~1.1 m. */
export function hobbit(seed: number): THREE.Group {
  const g = new THREE.Group();
  const shirts = [0xe8dcc0, 0xd8c8a0, 0xf0e8d8];
  const vests = [0x5a7a3a, 0x8a3a2a, 0x3a5a7a, 0xb8862a, 0x6a4a8a];
  const shirt = DETAIL.fabric(shirts[seed % 3]!);
  shirt.side = THREE.FrontSide;
  const vest = DETAIL.fabric(vests[seed % 5]!);
  vest.side = THREE.FrontSide;
  const breeches = DETAIL.fabric([0x6a5238, 0x4a4030, 0x7a6a48][seed % 3]!);
  breeches.side = THREE.FrontSide;
  const skin = MAT.skin();
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.4, 8), breeches);
    leg.position.set(s * 0.09, 0.28, 0);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), MAT.paint(0x8a6a4a, 0.9, 0));
    foot.scale.set(0.9, 0.5, 1.6);
    foot.position.set(s * 0.1, 0.04, -0.05);
    g.add(leg, foot);
  }
  g.add(
    new THREE.Mesh(
      foldedLathe(
        [
          [0.17, 0.46],
          [0.19, 0.62],
          [0.16, 0.82],
          [0.08, 0.88],
        ],
        8,
        0.04,
        20,
      ),
      shirt,
    ),
  );
  const v = new THREE.Mesh(
    foldedLathe(
      [
        [0.18, 0.5],
        [0.2, 0.62],
        [0.17, 0.8],
      ],
      6,
      0.02,
      20,
      Math.PI * 0.75,
      Math.PI * 1.5,
    ),
    vest,
  );
  g.add(v);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), skin);
  head.position.y = 1.0;
  g.add(head);
  const hair = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.15, 1),
    MAT.paint([0x5a3a1e, 0x8a5a2a, 0x3a2614][seed % 3]!, 1, 0),
  );
  hair.position.set(0, 1.06, 0.03);
  hair.scale.set(1.05, 0.9, 1.05);
  g.add(hair);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.36, 8), shirt);
    arm.position.set(s * 0.21, 0.72, 0);
    arm.rotation.z = s * (0.3 + (seed % 2) * 1.6);
    arm.userData.base = arm.rotation.z;
    arm.name = 'arm';
    g.add(arm);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

export function dressHobbiton(ctx: DressContext): (t: number, dt: number) => void {
  const { scene, track, terrain } = ctx;
  const marks = track.def.marks ?? {};
  const animated: ((t: number) => void)[] = [];
  const ground = (x: number, z: number) => terrain.height(x, z);
  const place = (o: THREE.Object3D, s: number, lat: number, faceRoad = true) => {
    const f = track.frameAtS(s);
    const p = off(f, lat, 0);
    o.position.set(p.x, ground(p.x, p.z) - 0.1, p.z);
    if (faceRoad) {
      const to = V(-f.right.x, 0, -f.right.z).multiplyScalar(Math.sign(lat) || 1);
      o.rotation.y = Math.atan2(to.x, to.z);
    }
    scene.add(o);
    return o;
  };

  // ---------------- The party field (start).
  const tree = partyTree();
  place(tree, 40, 34, false);
  const pav = tent(0xf2efe6);
  pav.scale.set(2.2, 1.4, 2.2);
  place(pav, 75, 30, false);
  [0xe8433a, 0x2f7de1, 0x3fbf5f].forEach((c, i) =>
    place(tent(c), 20 + i * 30, -24 - (i % 2) * 7, false),
  );
  // "Happy Birthday Bilbo Baggins" banner across the green.
  {
    const f0 = track.frameAtS(30),
      f1 = track.frameAtS(62);
    const a = tv(off(f0, 22, 7)),
      b = tv(off(f1, 46, 7));
    const banner = tex.decal(
      (x, w, h) => {
        x.fillStyle = '#f2efe6';
        x.fillRect(0, 0, w, h);
        x.fillStyle = '#b8241c';
        x.font = 'bold 54px Georgia, serif';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText('Happy Birthday Bilbo Baggins', w / 2, h / 2 + 4);
      },
      1024,
      110,
    );
    const len = a.distanceTo(b);
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(len, len * 0.107),
      new THREE.MeshStandardMaterial({ map: banner, side: THREE.DoubleSide }),
    );
    cloth.position.copy(a).lerp(b, 0.5);
    cloth.lookAt(
      cloth.position.clone().add(new THREE.Vector3().subVectors(b, a).cross(V(0, 1, 0))),
    );
    scene.add(cloth);
    for (const p of [a, b]) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.12, 8, 6),
        MAT.paint(0x6b4a2e, 0.9, 0),
      );
      pole.position.copy(p).add(V(0, -3.6, 0));
      scene.add(pole);
    }
  }
  // Hobbits at the party, dancing.
  for (let i = 0; i < 18; i++) {
    const h = hobbit(i);
    h.scale.setScalar(1.15);
    place(h, 15 + i * 5, 14 + (i % 4) * 4 + (i % 3), false);
    h.rotation.y = i * 1.3;
    animated.push((t) => {
      h.position.y +=
        Math.max(0, Math.sin(t * 6 + i)) * 0.02 - Math.max(0, Math.sin(t * 6 + i - 0.1)) * 0.02;
      h.children.forEach(
        (c) => c.name === 'arm' && (c.rotation.z = c.userData.base + Math.sin(t * 5 + i) * 0.4),
      );
    });
  }
  // Bunting along the start straight.
  for (let s = -40; s < 120; s += 16) {
    for (const side of [-1, 1]) {
      const a = tv(off(track.frameAtS(s), side * 9.6, 4.2));
      const b = tv(off(track.frameAtS(s + 16), side * 9.6, 4.2));
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.1, 4.6, 6),
        MAT.paint(0x6b4a2e, 0.9, 0),
      );
      pole.position.copy(a).add(V(0, -2.2, 0));
      scene.add(pole, bunting(a, b, 0.5));
    }
  }

  // ---------------- Bag End: under the jump, round green door, the party sign.
  {
    const s = marks.bagEnd ?? 130;
    const bag = hobbitHole(0); // green door
    bag.scale.setScalar(2.1);
    place(bag, s + 18, 15.5);
    const gate = sign(['No admittance', 'except on', 'party business'], 1.8, 1.1);
    place(gate, s + 8, 11);
    const oak = partyTree();
    oak.scale.setScalar(0.4);
    place(oak, s + 20, 36, false);
  }

  // ---------------- Hobbit holes along Gandalf's lane, with gardens.
  {
    const s0 = marks.gandalfLane ?? 296;
    for (let i = 0; i < 6; i++) {
      const hole = hobbitHole(i + 1);
      hole.scale.setScalar(1.2);
      place(hole, s0 + 10 + i * 22, (i % 2 ? 1 : -1) * 14);
      const hb = hobbit(i + 20);
      place(hb, s0 + 14 + i * 22, (i % 2 ? 1 : -1) * 10.5, false);
      hb.rotation.y = Math.atan2(-track.frameAtS(s0).tan.x, -track.frameAtS(s0).tan.z);
    }
  }

  // ---------------- The Green Dragon and the old mill by the pond.
  {
    const s = marks.millBridge ?? 468;
    const inn = greenDragon();
    place(inn, s + 25, -28);
    const mill = watermill();
    place(mill.group, s + 60, -30);
    animated.push(() => (mill.wheel.rotation.x -= 0.013));
    const f = track.frameAtS(s + 40);
    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(16, 32),
      new THREE.MeshStandardMaterial({
        color: 0x5f93a8,
        roughness: 0.08,
        metalness: 0.3,
        transparent: true,
        opacity: 0.9,
      }),
    );
    pond.rotation.x = -Math.PI / 2;
    const p = off(f, -48, 0);
    pond.position.set(p.x, ground(p.x, p.z) + 0.15, p.z);
    scene.add(pond);
    const sg = sign(['The Green', 'Dragon'], 1.6, 1.0, '#2f5a2a');
    place(sg, s + 10, -11);
  }

  return (t) => animated.forEach((a) => a(t));
}

function greenDragon(): THREE.Group {
  const g = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ map: tex.stoneBlocks(), roughness: 0.9 });
  const plaster = MAT.paint(0xeee4cc, 0.95, 0);
  const thatch = new THREE.MeshStandardMaterial({ map: tex.thatch(), roughness: 1 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 9), wall);
  base.position.y = 2;
  const upper = new THREE.Mesh(new THREE.BoxGeometry(14, 3.4, 9), plaster);
  upper.position.y = 5.7;
  const roofGeo = new THREE.CylinderGeometry(0.01, 8.5, 5, 4, 1).rotateY(Math.PI / 4);
  roofGeo.scale(1.25, 1, 0.8);
  const roof = new THREE.Mesh(roofGeo, thatch);
  roof.position.y = 9.9;
  g.add(base, upper, roof);
  // Round windows and door facing the road (+z).
  for (const x of [-4.5, 4.5]) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), MAT.glow(0xffb84a, 0.8));
    w.position.set(x, 2.4, 4.52);
    g.add(w);
  }
  const door = new THREE.Mesh(
    new THREE.CircleGeometry(1.3, 24, 0, Math.PI),
    MAT.paint(0x2f5a2a, 0.6, 0),
  );
  door.position.set(0, 1.0, 4.52);
  g.add(door);
  // Hanging sign with the dragon.
  const dragon = tex.decal((x, w, h) => {
    x.fillStyle = '#efe4c4';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#2f7a3a';
    x.beginPath();
    x.moveTo(20, 90);
    x.quadraticCurveTo(40, 30, 70, 50);
    x.quadraticCurveTo(90, 20, 110, 40);
    x.lineTo(100, 60);
    x.quadraticCurveTo(80, 70, 70, 100);
    x.closePath();
    x.fill();
  });
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.8),
    new THREE.MeshStandardMaterial({ map: dragon, side: THREE.DoubleSide }),
  );
  board.position.set(6.2, 5, 5.2);
  g.add(board);
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return g;
}
