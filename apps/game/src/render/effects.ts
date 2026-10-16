import * as THREE from 'three';
import * as tex from './textures.ts';

/** A pooled particle system with per-particle colour, alpha and size. */
export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grow: Float32Array;
  private base: Float32Array;
  private next = 0;
  readonly uniforms = { uScale: { value: 500 }, map: { value: tex.softDot() as THREE.Texture } };

  constructor(
    private n: number,
    additive: boolean,
    private gravity = 0,
    private drag = 1.5,
  ) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n).fill(1);
    this.grow = new Float32Array(n);
    this.base = new Float32Array(n * 4);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vColor;
        void main(){
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; varying vec4 vColor;
        void main(){
          float a = texture2D(map, gl_PointCoord).a * vColor.a;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor.rgb, a);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, color: THREE.Color, alpha: number, size: number, life: number, grow = 0): void {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.base.set([color.r, color.g, color.b, alpha], i * 4);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.grow[i] = grow;
  }

  update(dt: number): void {
    const k = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i]! <= 0) {
        this.col[i * 4 + 3] = 0;
        continue;
      }
      this.life[i] = this.life[i]! - dt;
      const t = Math.max(0, this.life[i]! / this.maxLife[i]!);
      for (let a = 0; a < 3; a++) {
        this.vel[i * 3 + a] = this.vel[i * 3 + a]! * k;
        this.pos[i * 3 + a] = this.pos[i * 3 + a]! + this.vel[i * 3 + a]! * dt;
      }
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1]! - this.gravity * dt;
      this.size[i] = this.size[i]! + this.grow[i]! * dt;
      this.col[i * 4] = this.base[i * 4]!;
      this.col[i * 4 + 1] = this.base[i * 4 + 1]!;
      this.col[i * 4 + 2] = this.base[i * 4 + 2]!;
      this.col[i * 4 + 3] = this.base[i * 4 + 3]! * t;
    }
    const g = this.points.geometry;
    g.attributes.position!.needsUpdate = true;
    g.attributes.aColor!.needsUpdate = true;
    g.attributes.aSize!.needsUpdate = true;
  }
}

/** Shared effect systems for a scene. */
export class Effects {
  readonly sparks = new Particles(1500, true, 9, 2.5);
  readonly smoke = new Particles(900, false, -0.6, 1.2);
  readonly group = new THREE.Group();
  constructor() {
    this.group.add(this.sparks.points, this.smoke.points);
  }
  /** Projection scale for point sizes, per viewport. */
  setViewportHeight(px: number, fovDeg: number): void {
    const s = px / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.sparks.uniforms.uScale.value = s;
    this.smoke.uniforms.uScale.value = s;
  }
  update(dt: number): void {
    this.sparks.update(dt);
    this.smoke.update(dt);
  }
}

export const DRIFT_COLORS = [new THREE.Color(1, 0.95, 0.75), new THREE.Color(0.3, 0.65, 1.6), new THREE.Color(1.6, 0.7, 0.15), new THREE.Color(1.3, 0.35, 1.6)];

/** Boost flame: layered additive cones. Scale z for length. */
export function flame(): THREE.Group {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(
    new THREE.ConeGeometry(0.24, 1.6, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.8),
    new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  const inner = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 1.0, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xa8e0ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  g.add(outer, inner);
  return g;
}
