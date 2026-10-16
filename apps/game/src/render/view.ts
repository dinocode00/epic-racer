import * as THREE from 'three';
import { type LookName, applyTextureLook, psxUniforms } from './look.ts';

/** A viewport in normalised screen coordinates, origin top-left. */
export interface Viewport {
  x: number;
  y: number;
  w: number;
  h: number;
  camera: THREE.PerspectiveCamera;
  /** Called right before this viewport renders (e.g. move the shadow light). */
  before?: () => void;
}

const RETRO_LINES = 240;

/** Owns the WebGL renderer and draws 1-4 viewports in the chosen look. */
export class View {
  readonly renderer: THREE.WebGLRenderer;
  look: LookName = 'modern';
  private rt: THREE.WebGLRenderTarget;
  private post: { scene: THREE.Scene; camera: THREE.OrthographicCamera; mat: THREE.ShaderMaterial };
  private width = 1;
  private height = 1;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.rt = new THREE.WebGLRenderTarget(426, RETRO_LINES, {
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
    });
    const mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.rt.texture }, uRes: { value: new THREE.Vector2() } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform vec2 uRes; varying vec2 vUv;
        float bayer(vec2 p){
          int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
          int i = x + y * 4;
          int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
          return float(m[i]) / 16.0 - 0.5;
        }
        void main(){
          vec2 px = floor(vUv * uRes);
          vec3 c = texture2D(tDiffuse, (px + 0.5) / uRes).rgb;
          c = pow(c, vec3(1.0 / 2.2)); // the buffer holds linear colour
          c += bayer(px) / 24.0;
          c = floor(c * 31.0 + 0.5) / 31.0; // 15-bit colour
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    this.post = { scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setLook(look: LookName): void {
    this.look = look;
    psxUniforms.uSnap.value = look === 'retro' ? 1 : 0;
    this.renderer.toneMapping =
      look === 'retro' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    applyTextureLook(look);
    this.resize();
  }

  resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height);
    const lines = RETRO_LINES;
    this.rt.setSize(Math.round((lines * this.width) / this.height), lines);
    this.post.mat.uniforms.uRes!.value.set(this.rt.width, this.rt.height);
  }

  render(scene: THREE.Scene, viewports: Viewport[]): void {
    const r = this.renderer;
    const retro = this.look === 'retro';
    const W = retro ? this.rt.width : this.width;
    const H = retro ? this.rt.height : this.height;
    r.setRenderTarget(retro ? this.rt : null);
    r.setScissorTest(true);
    for (const vp of viewports) {
      const x = Math.round(vp.x * W),
        w = Math.round(vp.w * W),
        h = Math.round(vp.h * H);
      const y = H - Math.round(vp.y * H) - h; // GL origin is bottom-left
      vp.camera.aspect = w / h;
      vp.camera.updateProjectionMatrix();
      psxUniforms.uSnapRes.value.set(w, h);
      vp.before?.();
      if (retro) {
        this.rt.viewport.set(x, y, w, h);
        this.rt.scissor.set(x, y, w, h);
        this.rt.scissorTest = true;
        r.setRenderTarget(this.rt); // three reads the target viewport on bind
      } else {
        r.setViewport(x, y, w, h);
        r.setScissor(x, y, w, h);
      }
      r.render(scene, vp.camera);
    }
    r.setScissorTest(false);
    if (retro) {
      r.setRenderTarget(null);
      r.setViewport(0, 0, this.width, this.height);
      r.render(this.post.scene, this.post.camera);
    }
  }
}
