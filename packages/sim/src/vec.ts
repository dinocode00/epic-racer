export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const fromArr = (a: readonly number[]): Vec3 => ({ x: a[0]!, y: a[1]!, z: a[2]! });
export const clone = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const addScaled = (a: Vec3, b: Vec3, s: number): Vec3 => ({
  x: a.x + b.x * s,
  y: a.y + b.y * s,
  z: a.z + b.z * s,
});
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const dist2 = (a: Vec3, b: Vec3): number => {
  const dx = a.x - b.x,
    dy = a.y - b.y,
    dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
};
export const norm = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : v3(0, 1, 0);
};
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});
/** Remove the component of `a` along unit vector `n`. */
export const reject = (a: Vec3, n: Vec3): Vec3 => addScaled(a, n, -dot(a, n));

/** Rotate vector `a` around unit axis `k` by `angle` radians (Rodrigues). */
export function rotateAround(a: Vec3, k: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const kxa = cross(k, a);
  const kda = dot(k, a);
  return {
    x: a.x * c + kxa.x * s + k.x * kda * (1 - c),
    y: a.y * c + kxa.y * s + k.y * kda * (1 - c),
    z: a.z * c + kxa.z * s + k.z * kda * (1 - c),
  };
}

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
export const approach = (x: number, target: number, rate: number): number =>
  x < target ? Math.min(target, x + rate) : Math.max(target, x - rate);
