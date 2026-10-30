import * as THREE from 'three';
import { tube } from '../render/modelKit.ts';

/**
 * Grandpa: the farm's NPC, built from the owner's photo and description. 70 years old,
 * 6 ft 1 in (1.85 m) and thin, in his ball cap, a red-navy-white plaid flannel shirt, blue
 * work jeans worn very low on the hips with a belt, brown cowboy boots and tan leather work
 * gloves. He walks slowly and easily, feet barely lifting so his heels drag along the ground.
 *
 * Real metres, standing on y = 0, facing -Z like the game's other characters. The rig is a
 * plain bone hierarchy of groups, posed procedurally: `animate(t, speed)` with speed in m/s
 * (0 stands, ~0.9 is his stroll).
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// Key heights (m) for a 1.85 m man.
const HIP = 0.955; // hip joints
const THIGH = 0.44;
const SHIN = 0.41;
const ANKLE = 0.107; // ankle above the ground, standing in his heeled boots
const SHOULDER = 1.445;
const UPPER_ARM = 0.31;
const FOREARM = 0.27;

// ---------------------------------------------------------------- materials

function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Red, navy and white flannel plaid with a soft brushed weave. */
function plaid(): THREE.CanvasTexture {
  return canvasTex(128, 128, (x) => {
    x.fillStyle = '#9b2a2c';
    x.fillRect(0, 0, 128, 128);
    const band = (pos: number, w: number, col: string, alpha: number) => {
      x.globalAlpha = alpha;
      x.fillStyle = col;
      x.fillRect(pos, 0, w, 128);
      x.fillRect(0, pos, 128, w);
    };
    band(0, 40, '#25304e', 0.85);
    band(56, 10, '#25304e', 0.6);
    band(84, 4, '#eeeae0', 0.75);
    band(100, 2, '#eeeae0', 0.6);
    band(20, 3, '#c8a24a', 0.35);
    x.globalAlpha = 1;
    // Brushed flannel fuzz.
    for (let i = 0; i < 3500; i++) {
      x.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
      x.fillRect(Math.random() * 128, Math.random() * 128, 1, 1 + Math.random() * 2);
    }
  });
}

/** Blue work denim: diagonal twill, worn lighter in places. */
function denim(): THREE.CanvasTexture {
  return canvasTex(128, 128, (x) => {
    x.fillStyle = '#3b5682';
    x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(20,30,55,0.35)';
    x.lineWidth = 1;
    for (let i = -128; i < 128; i += 3) {
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i + 128, 128);
      x.stroke();
    }
    for (let i = 0; i < 2500; i++) {
      x.fillStyle = Math.random() < 0.6 ? 'rgba(200,215,235,0.10)' : 'rgba(10,20,40,0.12)';
      x.fillRect(Math.random() * 128, Math.random() * 128, 1, 2);
    }
  });
}

function mats() {
  const shirtMap = plaid();
  const sleeveMap = shirtMap.clone();
  shirtMap.repeat.set(5, 3.5);
  sleeveMap.repeat.set(2, 2.5);
  const pocketMap = shirtMap.clone();
  pocketMap.repeat.set(0.6, 0.6);
  const jeanMap = denim();
  jeanMap.repeat.set(3, 3);
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  return {
    skin: std({ color: 0xe2ad8e, roughness: 0.72 }),
    lip: std({ color: 0xb07468, roughness: 0.7 }),
    eye: std({ color: 0x3b4a58, roughness: 0.3 }),
    eyeWhite: std({ color: 0xe9e2d6, roughness: 0.4 }),
    hair: std({ color: 0xa29d94, roughness: 1 }),
    brow: std({ color: 0x9a958c, roughness: 1 }),
    cap: std({ color: 0x1e2433, roughness: 0.9 }),
    shirt: std({ map: shirtMap, roughness: 0.95 }),
    sleeve: std({ map: sleeveMap, roughness: 0.95 }),
    pocket: std({ map: pocketMap, roughness: 0.95 }),
    button: std({ color: 0xe9e4d6, roughness: 0.4 }),
    jeans: std({ map: jeanMap, roughness: 0.95 }),
    belt: std({ color: 0x4a2f1c, roughness: 0.6 }),
    buckle: std({ color: 0xb8a679, metalness: 0.9, roughness: 0.35 }),
    boot: std({ color: 0x6b4428, roughness: 0.55 }),
    sole: std({ color: 0x2b1d14, roughness: 0.8 }),
    glove: std({ color: 0xc19863, roughness: 0.85 }),
    gloveDark: std({ color: 0xa47d4c, roughness: 0.85 }),
  };
}
type Mats = ReturnType<typeof mats>;

// ---------------------------------------------------------------- helpers

const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => new THREE.Mesh(g, m);

/** A vertical tube from y0 to y1 (local), rings given by absolute local y. */
function vTube(
  y0: number,
  y1: number,
  rings: [y: number, w: number, d: number, dz?: number][],
  around = 20,
): THREE.BufferGeometry {
  const curve = new THREE.LineCurve3(V(0, y0, 0), V(0, y1, 0));
  const span = y1 - y0;
  return tube(
    curve,
    rings.map(([y, w, d, dz]) => ({ t: (y - y0) / span, w, h: d, dy: dz ?? 0, ex: 0.9 })),
    Math.max(8, Math.round(Math.abs(span) * 40)),
    around,
    V(0, 0, 1),
  );
}

const ball = (r: number, m: THREE.Material, sx = 1, sy = 1, sz = 1, seg = 16) => {
  const o = mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), m);
  o.scale.set(sx, sy, sz);
  return o;
};

// ---------------------------------------------------------------- parts

/** A long, lean, weathered face under the cap, grey hair at the sides and back. */
function head(m: Mats): THREE.Group {
  const g = new THREE.Group();
  // One sculpted surface: a tall, narrow head with the features pushed in and out of it
  // (a long straight nose, deep-set eyes under a brow ridge, cheekbones over hollow cheeks,
  // a long chin, the mouth a shallow line), so it reads as a face rather than parts.
  const geo = new THREE.SphereGeometry(0.1, 64, 48);
  const p = geo.attributes.position!;
  const bump = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) =>
    Math.exp(-(((x - cx) / sx) ** 2) - ((y - cy) / sy) ** 2);
  const n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    n.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    let x = n.x * 0.084,
      y = n.y * 0.122,
      z = n.z * 0.1;
    const lower = Math.max(0, -y / 0.122); // 0 at the eyes, 1 at the chin
    x *= 1 - 0.3 * lower * lower;
    z *= 1 - 0.1 * lower * lower;
    if (z > 0) {
      const ax = Math.abs(x);
      let d = 0;
      // Nose: bridge high between the eyes, running down to the tip.
      const along = THREE.MathUtils.clamp((0.022 - y) / 0.062, 0, 1);
      d +=
        bump(x, 0, 0, 0, 0.011 + along * 0.004, 1) *
        (y < 0.026 && y > -0.045 ? 1 : 0) *
        (0.006 + along * 0.022) *
        Math.min(1, (y + 0.05) / 0.012);
      d += bump(x, y, 0, -0.04, 0.014, 0.008) * 0.006; // nostrils
      d += bump(x, y, 0, -0.033, 0.009, 0.008) * 0.005; // a rounded tip
      d += bump(ax, y, 0.03, 0.033, 0.03, 0.007) * 0.007; // brow ridge
      d -= bump(ax, y, 0.033, 0.014, 0.017, 0.011) * 0.009; // eye sockets
      d += bump(ax, y, 0.05, -0.012, 0.016, 0.012) * 0.005; // cheekbones
      d -= bump(ax, y, 0.045, -0.055, 0.016, 0.02) * 0.005; // hollow cheeks
      d -= bump(x, y, 0, -0.06, 0.022, 0.0035) * 0.003; // mouth line
      d += bump(x, y, 0, -0.068, 0.02, 0.006) * 0.003; // lower lip
      d += bump(x, y, 0, -0.103, 0.022, 0.012) * 0.006; // chin
      z += d;
    }
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  g.add(mesh(geo, m.skin));
  for (const s of [-1, 1]) {
    // Eyes set in the sockets, lids half over them (he squints into the sun).
    const white = ball(0.0105, m.eyeWhite, 1.2, 0.7, 0.75);
    white.position.set(s * 0.033, 0.014, 0.082);
    g.add(white);
    const iris = ball(0.0055, m.eye);
    iris.position.set(s * 0.032, 0.014, 0.089);
    g.add(iris);
    const lid = ball(0.012, m.skin, 1.25, 0.5, 0.8);
    lid.position.set(s * 0.033, 0.021, 0.083);
    g.add(lid);
    const brow = mesh(new THREE.BoxGeometry(0.03, 0.005, 0.008), m.brow);
    brow.position.set(s * 0.032, 0.031, 0.093);
    brow.rotation.set(-0.2, s * -0.25, s * -0.1);
    g.add(brow);
    // Big ears.
    const ear = ball(0.024, m.skin, 0.42, 1.25, 0.9);
    ear.position.set(s * 0.083, 0.002, -0.008);
    ear.rotation.y = s * -0.35;
    g.add(ear);
  }
  // A slight, easy smile.
  const mouth = mesh(new THREE.TorusGeometry(0.02, 0.0018, 6, 20, Math.PI * 0.7), m.lip);
  mouth.rotation.z = Math.PI + Math.PI * 0.15;
  mouth.scale.set(1, 0.45, 1);
  mouth.position.set(0, -0.057, 0.093);
  g.add(mouth);
  // Short grey hair round the sides and back, below the cap.
  const hairGeo = new THREE.SphereGeometry(
    0.1,
    32,
    16,
    0,
    Math.PI * 2,
    Math.PI * 0.3,
    Math.PI * 0.26,
  );
  const hp = hairGeo.attributes.position!;
  for (let i = 0; i < hp.count; i++) {
    n.set(hp.getX(i), hp.getY(i), hp.getZ(i)).normalize();
    // Short grey hair at the sides and back only, trimmed above the ears and clear of the face.
    const front = Math.max(0, n.z);
    const k = 1.03 - front * 0.1;
    hp.setXYZ(i, n.x * 0.084 * k, n.y * 0.122 * k - front * 0.02, n.z * 0.1 * k - front * 0.012);
  }
  hairGeo.computeVertexNormals();
  g.add(mesh(hairGeo, m.hair));
  // The ball cap: a rounded crown, a curved brim, the button on top.
  const cap = new THREE.Group();
  const crown = mesh(
    new THREE.SphereGeometry(0.104, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
    m.cap,
  );
  crown.scale.set(0.95, 0.68, 1.04);
  cap.add(crown);
  const band = mesh(new THREE.CylinderGeometry(0.098, 0.099, 0.03, 24, 1, true), m.cap);
  band.scale.set(0.95, 1, 1.04);
  band.position.y = -0.01;
  cap.add(band);
  // Brim: a half disc bent down at the sides.
  const brimGeo = new THREE.CircleGeometry(0.085, 24, -Math.PI / 2, Math.PI);
  brimGeo.rotateX(-Math.PI / 2);
  brimGeo.rotateY(-Math.PI / 2);
  const bp = brimGeo.attributes.position!;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i),
      z = bp.getZ(i);
    bp.setY(i, -Math.abs(x) * Math.abs(x) * 2.2 - z * 0.12);
  }
  brimGeo.computeVertexNormals();
  const brim = mesh(brimGeo, m.cap);
  (brim.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  brim.scale.set(1, 1, 0.95);
  brim.position.set(0, -0.022, 0.088);
  cap.add(brim);
  const button = ball(0.008, m.cap);
  button.position.y = 0.071;
  cap.add(button);
  cap.position.y = 0.066;
  cap.rotation.x = -0.08;
  g.add(cap);
  return g;
}

/** Torso in the flannel shirt, tucked into the low jeans with a little blousing over the belt. */
function torso(m: Mats): THREE.Group {
  const g = new THREE.Group();
  const r = (y: number) => y - HIP;
  const body = mesh(
    vTube(r(0.86), r(1.565), [
      [r(0.86), 0.14, 0.094],
      [r(0.94), 0.146, 0.098],
      [r(0.975), 0.156, 0.106],
      [r(1.02), 0.152, 0.104],
      [r(1.12), 0.148, 0.1, 0.004],
      [r(1.27), 0.168, 0.112, 0.008],
      [r(1.4), 0.185, 0.1, 0.0],
      [r(1.46), 0.17, 0.088],
      [r(1.49), 0.15, 0.078],
      [r(1.515), 0.1, 0.068],
      [r(1.53), 0.07, 0.062],
      [r(1.565), 0.058, 0.056],
    ]),
    m.shirt,
  );
  g.add(body);
  // Collar points, button placket, two flap pockets.
  for (const s of [-1, 1]) {
    const collar = mesh(new THREE.BoxGeometry(0.065, 0.012, 0.08), m.shirt);
    collar.position.set(s * 0.038, r(1.535), 0.06);
    collar.rotation.set(0.9, s * 0.5, s * 0.45);
    g.add(collar);
    const pocket = mesh(new THREE.BoxGeometry(0.11, 0.12, 0.012), m.pocket);
    pocket.position.set(s * 0.085, r(1.29), 0.11);
    pocket.rotation.y = s * 0.18;
    g.add(pocket);
    const flap = mesh(new THREE.BoxGeometry(0.115, 0.035, 0.016), m.pocket);
    flap.position.set(s * 0.085, r(1.345), 0.113);
    flap.rotation.y = s * 0.18;
    g.add(flap);
    const pb = ball(0.0055, m.button);
    pb.position.set(s * 0.085, r(1.338), 0.123);
    g.add(pb);
  }
  for (let i = 0; i < 6; i++) {
    const b = ball(0.0055, m.button);
    const y = r(1.45 - i * 0.095);
    b.position.set(0, y, i < 2 ? 0.098 : i < 4 ? 0.112 : 0.102);
    g.add(b);
  }
  // Neck.
  const neck = mesh(
    vTube(
      r(1.5),
      r(1.64),
      [
        [r(1.5), 0.052, 0.05],
        [r(1.64), 0.045, 0.047],
      ],
      14,
    ),
    m.skin,
  );
  neck.position.z = 0.005;
  g.add(neck);
  return g;
}

/** Jeans seat and waist, worn very low on the hips, with the belt and buckle. */
function pelvis(m: Mats): THREE.Group {
  const g = new THREE.Group();
  const r = (y: number) => y - HIP;
  g.add(
    mesh(
      vTube(r(0.8), r(0.94), [
        [r(0.8), 0.11, 0.075, -0.01],
        [r(0.84), 0.15, 0.1, -0.008],
        [r(0.88), 0.165, 0.114, -0.006],
        [r(0.94), 0.158, 0.108],
      ]),
      m.jeans,
    ),
  );
  const belt = mesh(
    vTube(r(0.9), r(0.936), [
      [r(0.9), 0.171, 0.12],
      [r(0.936), 0.165, 0.115],
    ]),
    m.belt,
  );
  g.add(belt);
  const buckle = mesh(new THREE.BoxGeometry(0.05, 0.034, 0.01), m.buckle);
  buckle.position.set(0, r(0.918), 0.121);
  g.add(buckle);
  return g;
}

/** One leg in the jeans, from the hip joint: thigh -> knee -> ankle -> boot. */
function leg(m: Mats) {
  const hip = new THREE.Group();
  hip.add(
    mesh(
      vTube(-THIGH, -0.03, [
        [-0.03, 0.086, 0.094],
        [-0.15, 0.08, 0.085],
        [-THIGH, 0.066, 0.07],
      ]),
      m.jeans,
    ),
  );
  const knee = new THREE.Group();
  knee.position.y = -THIGH;
  hip.add(knee);
  knee.add(ball(0.066, m.jeans, 1, 1, 1.05)); // fills the bend so the denim stays whole
  // Straight work-jean legs, a bit loose, breaking over the boot.
  knee.add(
    mesh(
      vTube(-SHIN - 0.035, 0.02, [
        [0.02, 0.066, 0.07],
        [-0.2, 0.062, 0.064],
        [-SHIN + 0.04, 0.068, 0.072],
        [-SHIN - 0.035, 0.076, 0.084, 0.01],
      ]),
      m.jeans,
    ),
  );
  const ankle = new THREE.Group();
  ankle.position.y = -SHIN;
  knee.add(ankle);
  ankle.add(boot(m));
  return { hip, knee, ankle };
}

/** Brown cowboy boot: pointed toe, riding heel, stitched shaft under the jeans. */
function boot(m: Mats): THREE.Group {
  const outer = new THREE.Group();
  const g = new THREE.Group();
  // Pitched toe-down on the riding heel so heel and toe both meet the ground.
  g.rotation.x = 0.143;
  outer.add(g);
  g.add(
    mesh(
      vTube(
        -0.02,
        0.13,
        [
          [-0.02, 0.048, 0.055],
          [0.13, 0.05, 0.056],
        ],
        14,
      ),
      m.boot,
    ),
  );
  const foot = new THREE.CatmullRomCurve3([
    V(0, -0.02, -0.07),
    V(0, -0.03, 0.0),
    V(0, -0.045, 0.1),
    V(0, -0.052, 0.17),
    V(0, -0.05, 0.215),
  ]);
  g.add(
    mesh(
      tube(
        foot,
        [
          { t: 0, w: 0.04, h: 0.05 },
          { t: 0.28, w: 0.045, h: 0.045 },
          { t: 0.55, w: 0.043, h: 0.03 },
          { t: 0.8, w: 0.025, h: 0.018 },
          { t: 0.95, w: 0.008, h: 0.01 },
          { t: 1, w: 0.002, h: 0.004 },
        ],
        28,
        16,
      ),
      m.boot,
    ),
  );
  // Sole tapering to the toe, and the stacked riding heel, angled under.
  const soleShape = new THREE.Shape();
  soleShape.moveTo(-0.04, -0.085);
  soleShape.lineTo(0.04, -0.085);
  soleShape.quadraticCurveTo(0.05, 0.08, 0.004, 0.225);
  soleShape.lineTo(-0.004, 0.225);
  soleShape.quadraticCurveTo(-0.05, 0.08, -0.04, -0.085);
  const soleGeo = new THREE.ExtrudeGeometry(soleShape, { depth: 0.01, bevelEnabled: false });
  soleGeo.rotateX(Math.PI / 2);
  const sole = mesh(soleGeo, m.sole);
  sole.position.y = -0.066;
  g.add(sole);
  const heel = mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.045, 12), m.sole);
  heel.scale.set(1.15, 1, 1.1);
  heel.position.set(0, -0.092, -0.05);
  heel.rotation.x = 0.12;
  g.add(heel);
  // Decorative stitching up the shaft, showing just under the jeans.
  const stitch = mesh(new THREE.TorusGeometry(0.03, 0.0018, 4, 16, Math.PI), m.sole);
  stitch.rotation.y = Math.PI / 2;
  stitch.position.set(0.046, 0.03, 0.0);
  g.add(stitch);
  return outer;
}

/** Tan leather work glove: cuff, palm and loosely curled fingers, thumb tucked in. */
function glove(m: Mats): THREE.Group {
  const g = new THREE.Group();
  g.add(
    mesh(
      vTube(
        -0.03,
        0.035,
        [
          [0.035, 0.044, 0.04],
          [-0.03, 0.04, 0.03],
        ],
        14,
      ),
      m.gloveDark,
    ),
  );
  const palm = mesh(
    vTube(
      -0.12,
      -0.02,
      [
        [-0.02, 0.042, 0.022],
        [-0.07, 0.046, 0.022],
        [-0.12, 0.042, 0.02],
      ],
      14,
    ),
    m.glove,
  );
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const x = -0.03 + i * 0.02;
    const f = new THREE.CatmullRomCurve3([V(x, -0.115, 0), V(x, -0.165, 0.008), V(x, -0.19, 0.03)]);
    g.add(
      mesh(
        tube(
          f,
          [
            { t: 0, w: 0.0105, h: 0.011 },
            { t: 1, w: 0.009, h: 0.009 },
          ],
          8,
          8,
          V(0, 0, 1),
        ),
        m.glove,
      ),
    );
  }
  const thumb = new THREE.CatmullRomCurve3([
    V(0.0, -0.05, 0.02),
    V(-0.01, -0.09, 0.04),
    V(-0.005, -0.12, 0.045),
  ]);
  g.add(
    mesh(
      tube(
        thumb,
        [
          { t: 0, w: 0.013, h: 0.012 },
          { t: 1, w: 0.01, h: 0.01 },
        ],
        8,
        8,
        V(0, 0, 1),
      ),
      m.glove,
    ),
  );
  return g;
}

/** One arm in the flannel sleeve, from the shoulder: upper arm -> elbow -> wrist -> glove. */
function arm(m: Mats, side: number) {
  const shoulder = new THREE.Group();
  shoulder.add(
    mesh(
      vTube(-UPPER_ARM, 0.0, [
        [0.0, 0.048, 0.05],
        [-0.12, 0.046, 0.047],
        [-UPPER_ARM, 0.043, 0.044],
      ]),
      m.sleeve,
    ),
  );
  // A rounded shoulder where the sleeve is set in.
  shoulder.add(ball(0.049, m.sleeve, 1, 0.85, 1.02));
  const elbow = new THREE.Group();
  elbow.position.y = -UPPER_ARM;
  shoulder.add(elbow);
  elbow.add(ball(0.043, m.sleeve));
  elbow.add(
    mesh(
      vTube(-FOREARM, 0.02, [
        [0.02, 0.043, 0.044],
        [-FOREARM + 0.05, 0.038, 0.038],
        [-FOREARM + 0.01, 0.042, 0.042],
        [-FOREARM, 0.041, 0.04],
      ]),
      m.sleeve,
    ),
  );
  const wrist = new THREE.Group();
  wrist.position.y = -FOREARM;
  elbow.add(wrist);
  const hand = glove(m);
  hand.rotation.y = (side * -Math.PI) / 2; // palms facing in toward the legs
  wrist.add(hand);
  return { shoulder, elbow, wrist };
}

// ---------------------------------------------------------------- the rig

export interface Grandpa {
  group: THREE.Group;
  /** Pose for time t (s) at a walking speed (m/s): 0 stands easy, ~0.9 is his stroll. */
  animate(t: number, speed: number): void;
  /** Distance travelled per second at a given speed is just `speed`; this is his stroll. */
  strollSpeed: number;
}

export function buildGrandpa(): Grandpa {
  const m = mats();
  const group = new THREE.Group();
  group.name = 'grandpa';
  // Internally he faces +Z; the outer group turns him to face -Z like the other characters.
  const body = new THREE.Group();
  body.rotation.y = Math.PI;
  group.add(body);

  const hips = new THREE.Group();
  hips.position.y = HIP;
  body.add(hips);
  hips.add(pelvis(m));
  const spine = new THREE.Group();
  hips.add(spine);
  spine.add(torso(m));
  const chest = new THREE.Group();
  chest.position.y = 1.3 - HIP;
  spine.add(chest);
  const neck = new THREE.Group();
  neck.position.set(0, 1.6 - 1.3, 0.01);
  chest.add(neck);
  const headG = head(m);
  headG.position.y = 0.108;
  neck.add(headG);
  const arms = [-1, 1].map((s) => {
    const a = arm(m, s);
    a.shoulder.position.set(s * 0.18, SHOULDER - 1.3, -0.005);
    chest.add(a.shoulder);
    return a;
  });
  const legs = [-1, 1].map((s) => {
    const l = leg(m);
    l.hip.position.set(s * 0.094, 0, 0);
    hips.add(l.hip);
    return l;
  });
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });

  // Two-bone leg IK in the walking plane: ankle target (forward z, down y) from the hip.
  const solveLeg = (l: (typeof legs)[number], fz: number, down: number, footPitch: number) => {
    const d = Math.min(Math.hypot(fz, down), THIGH + SHIN - 0.001);
    const kneeIn = Math.acos(
      THREE.MathUtils.clamp((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN), -1, 1),
    );
    const flex = Math.PI - kneeIn;
    const toTarget = Math.atan2(fz, down);
    const offset = Math.acos(
      THREE.MathUtils.clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1),
    );
    const thigh = toTarget + offset; // forward swing of the thigh from straight down
    l.hip.rotation.x = -thigh;
    l.knee.rotation.x = flex;
    // Foot: level, then pitched toe-up by footPitch.
    l.ankle.rotation.x = thigh - flex - footPitch;
  };

  const strollSpeed = 0.85;
  let phase = 0,
    lastT = 0,
    gait = 0;
  const animate = (t: number, speed: number) => {
    const dt = Math.min(0.1, Math.max(0, t - lastT));
    lastT = t;
    // Ease between standing and walking so he doesn't snap.
    gait += (Math.min(1, speed / strollSpeed) - gait) * Math.min(1, dt * 3);
    const stride = 0.56; // a step, short and unhurried
    const cadence = speed / (2 * stride); // full cycles per second
    phase += dt * cadence * Math.PI * 2;
    const w = gait;
    const breathe = Math.sin(t * 1.6) * 0.004;

    // Body: a little stooped forward, gentle bob and sway, hips and shoulders counter-turning.
    const bob = Math.abs(Math.sin(phase)) * 0.012 * w;
    hips.position.y = HIP - 0.012 * w - bob + 0.006;
    hips.position.x = Math.sin(phase) * 0.012 * w;
    hips.rotation.y = Math.sin(phase) * 0.06 * w;
    spine.rotation.x = 0.07 + 0.03 * w + breathe;
    spine.rotation.y = -Math.sin(phase) * 0.08 * w;
    chest.rotation.z = Math.sin(phase) * 0.015 * w;
    neck.rotation.x = -0.04 - 0.03 * w;
    neck.rotation.y = (1 - w) * (Math.sin(t * 0.23) * 0.45 + Math.sin(t * 0.71) * 0.06);
    headG.rotation.x = 0.02 * Math.sin(phase * 2) * w;

    // Legs: stance foot planted and sliding back under him, swing foot brought through low
    // with the toe up so the heel scuffs along the ground.
    legs.forEach((l, i) => {
      const ph = phase + (i ? Math.PI : 0);
      const c = (((ph / (Math.PI * 2)) % 1) + 1) % 1; // 0..1 through this leg's cycle
      const stanceFrac = 0.62;
      let fz: number, lift: number, pitch: number;
      if (c < stanceFrac) {
        const s = c / stanceFrac;
        fz = stride * (0.5 - s);
        lift = 0;
        // Heel strike toe-up, flat through mid-stance, heel peeling at push-off.
        pitch = s < 0.15 ? (0.15 - s) * 1.2 : s > 0.8 ? -(s - 0.8) * 1.0 : 0;
      } else {
        const s = (c - stanceFrac) / (1 - stanceFrac);
        fz = stride * (-0.5 + s);
        lift = Math.sin(s * Math.PI) * 0.012; // barely off the ground: the heels drag
        pitch = 0.05 + Math.sin(s * Math.PI) * 0.12;
      }
      const standFz = 0;
      const down = hips.position.y - ANKLE - lift;
      solveLeg(l, THREE.MathUtils.lerp(standFz, fz, w), down, pitch * w);
    });

    // Arms hang loose, swinging opposite the legs, elbows soft.
    arms.forEach((a, i) => {
      // Back when the same-side leg is forward.
      const sw = Math.cos(phase + (i ? Math.PI : 0));
      a.shoulder.rotation.x = sw * 0.2 * w + 0.03;
      a.shoulder.rotation.z = (i ? 1 : -1) * 0.06;
      a.elbow.rotation.x = -(0.18 + 0.12 * Math.max(0, -sw) * w);
      a.wrist.rotation.x = -0.1;
    });
  };
  animate(0, 0);
  return { group, animate, strollSpeed };
}
