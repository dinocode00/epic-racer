/**
 * Maths that gives bit-for-bit the same answer in every browser.
 *
 * `+ - * /` and `Math.sqrt` are exact in JavaScript, but `Math.sin`, `Math.atan2`, `Math.exp`,
 * `Math.hypot` and friends are left to each engine, and Chrome, Safari and Firefox can differ in
 * the last bit. One bit is enough for two laptops racing the same race (8-Player Local) to
 * drift apart, so the simulation uses these instead. They are the FreeBSD / fdlibm algorithms
 * (what Chrome itself uses), written with plain arithmetic only.
 */

const INVPIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417; // first 33 bits of pi/2
const PIO2_2 = 6.0771005063039659766e-11; // second 33 bits
const PIO2_2T = 2.02226624879595063154e-21; // pi/2 - (PIO2_1 + PIO2_2)
const PIO2_3 = 2.0222662487111664558e-21; // third 33 bits
const PIO2_3T = 8.47842766036889956997e-32;
const PIO4 = 7.853981633974483e-1;
const TINY = 7.450580596923828e-9; // 2^-27

let ry0 = 0,
  ry1 = 0;
/** x = n * pi/2 + (ry0 + ry1), |ry0| <= pi/4. Returns n mod 4. */
function reduce(x: number): number {
  const fn = Math.round(x * INVPIO2);
  let t = x - fn * PIO2_1;
  let w = fn * PIO2_2;
  let r = t - w;
  w = fn * PIO2_2T - (t - r - w);
  t = r;
  w = fn * PIO2_3;
  r = t - w;
  w = fn * PIO2_3T - (t - r - w);
  ry0 = r - w;
  ry1 = r - ry0 - w;
  return ((fn % 4) + 4) % 4;
}

const S1 = -1.66666666666666324348e-1,
  S2 = 8.33333333332248946124e-3,
  S3 = -1.98412698298579493134e-4,
  S4 = 2.75573137070700676789e-6,
  S5 = -2.50507602534068634195e-8,
  S6 = 1.58969099521155010221e-10;
function ksin(x: number, y: number, iy: number): number {
  const z = x * x,
    w = z * z,
    r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6),
    v = z * x;
  if (iy === 0) return x + v * (S1 + z * r);
  return x - (z * (0.5 * y - v * r) - y - v * S1);
}

const C1 = 4.16666666666666019037e-2,
  C2 = -1.38888888888741095749e-3,
  C3 = 2.48015872894767294178e-5,
  C4 = -2.75573143513906633035e-7,
  C5 = 2.0875723212981748279e-9,
  C6 = -1.13596475577881948265e-11;
function kcos(x: number, y: number): number {
  const z = x * x;
  let w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z;
  w = 1 - hz;
  return w + (1 - w - hz + (z * r - x * y));
}

function sin(x: number): number {
  const ax = Math.abs(x);
  if (ax <= PIO4) return ax < TINY ? x : ksin(x, 0, 0);
  if (!(ax < Infinity)) return NaN;
  switch (reduce(x)) {
    case 0:
      return ksin(ry0, ry1, 1);
    case 1:
      return kcos(ry0, ry1);
    case 2:
      return -ksin(ry0, ry1, 1);
    default:
      return -kcos(ry0, ry1);
  }
}

function cos(x: number): number {
  const ax = Math.abs(x);
  if (ax <= PIO4) return ax < TINY ? 1 : kcos(x, 0);
  if (!(ax < Infinity)) return NaN;
  switch (reduce(x)) {
    case 0:
      return kcos(ry0, ry1);
    case 1:
      return -ksin(ry0, ry1, 1);
    case 2:
      return -kcos(ry0, ry1);
    default:
      return ksin(ry0, ry1, 1);
  }
}

const tan = (x: number): number => sin(x) / cos(x);

const ATANHI = [
  4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1,
  1.570796326794896558,
];
const ATANLO = [
  2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17,
  6.12323399573676603587e-17,
];
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1,
  -1.1111110405462355788e-1, 9.09088713343650656196e-2, -7.69187620504482999495e-2,
  6.66107313738753120669e-2, -5.83357013379057348645e-2, 4.97687799461593236017e-2,
  -3.6531572744216915527e-2, 1.62858201153657823623e-2,
];

function atan(x: number): number {
  if (x !== x) return NaN;
  const neg = x < 0;
  const ax = Math.abs(x);
  if (ax >= 7.378697629483821e19) return x > 0 ? ATANHI[3]! + ATANLO[3]! : -ATANHI[3]! - ATANLO[3]!;
  let id: number;
  if (ax < 0.4375) {
    if (ax < TINY) return x;
    id = -1;
  } else {
    if (ax < 1.1875) {
      if (ax < 0.6875) {
        id = 0;
        x = (2 * ax - 1) / (2 + ax);
      } else {
        id = 1;
        x = (ax - 1) / (ax + 1);
      }
    } else if (ax < 2.4375) {
      id = 2;
      x = (ax - 1.5) / (1 + 1.5 * ax);
    } else {
      id = 3;
      x = -1 / ax;
    }
  }
  const z = x * x,
    w = z * z;
  const s1 = z * (AT[0]! + w * (AT[2]! + w * (AT[4]! + w * (AT[6]! + w * (AT[8]! + w * AT[10]!)))));
  const s2 = w * (AT[1]! + w * (AT[3]! + w * (AT[5]! + w * (AT[7]! + w * AT[9]!))));
  if (id < 0) return x - x * (s1 + s2);
  const r = ATANHI[id]! - (x * (s1 + s2) - ATANLO[id]! - x);
  return neg ? -r : r;
}

const PI = 3.141592653589793116;
const PI_LO = 1.2246467991473531772e-16;
const PIO2 = 1.570796326794896558;

function atan2(y: number, x: number): number {
  if (x !== x || y !== y) return NaN;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return Math.atan2(y, x); // exact by the spec
  const negY = y < 0 || (y === 0 && 1 / y < 0);
  if (y === 0) {
    if (x > 0 || (x === 0 && 1 / x > 0)) return y;
    return negY ? -PI : PI;
  }
  if (x === 0) return negY ? -PIO2 : PIO2;
  const z = atan(Math.abs(y / x));
  if (x > 0) return negY ? -z : z;
  const r = PI - (z - PI_LO);
  return negY ? -r : r;
}

const acos = (x: number): number => atan2(Math.sqrt((1 - x) * (1 + x)), x);

const LN2HI = 6.9314718036912381649e-1,
  LN2LO = 1.90821492927058770002e-10,
  INVLN2 = 1.442695040888963387;
const P1 = 1.66666666666666019037e-1,
  P2 = -2.77777777770155933842e-3,
  P3 = 6.61375632143793436117e-5,
  P4 = -1.6533902205465251539e-6,
  P5 = 4.13813679705723846039e-8;
const bits = new DataView(new ArrayBuffer(8));
/** 2^k for an integer k in -1022..1023, built from its bits. */
function pow2(k: number): number {
  bits.setUint32(0, (k + 1023) << 20);
  bits.setUint32(4, 0);
  return bits.getFloat64(0);
}

function exp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019411) return 0;
  const ax = Math.abs(x);
  let hi = x,
    lo = 0,
    k = 0;
  if (ax > 0.34657359027997264) {
    k = Math.round(INVLN2 * x);
    hi = x - k * LN2HI;
    lo = k * LN2LO;
  } else if (ax < 3.725290298461914e-9) return 1 + x;
  const r = hi - lo;
  const t = r * r;
  const c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((r * c) / (c - 2) - r);
  const y = 1 - (lo - (r * c) / (2 - c) - hi);
  if (k >= -1021) return k === 1024 ? y * 2 * pow2(1023) : y * pow2(k);
  return y * pow2(k + 1000) * pow2(-1000);
}

/** Length of (a, b[, c]): unlike Math.hypot, the same in every browser. */
const hypot = (a: number, b: number, c = 0): number => Math.sqrt(a * a + b * b + c * c);

/** x², exactly (unlike `x ** 2`, which some engines compute as a general power). */
const sq = (x: number): number => x * x;

/** Drop-in for the Math functions the simulation needs. */
export const M = { sin, cos, tan, atan, atan2, acos, exp, hypot, sq } as const;
