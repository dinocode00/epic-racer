import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
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
  /**
   * Redraw the shadow map before this view (default: only before the first one, so all
   * views share one shadow map per frame).
   */
  shadow?: boolean;
}

const RETRO_LINES = 240;
/**
 * The most pixels worth drawing: a TV is 1080p, so a high-DPI laptop screen mirrored or cast
 * to it gains nothing from more (drawing at 2x density is four times the work).
 */
const MAX_PIXELS = 1920 * 1080;

/** What the automatic quality control can turn down. */
export interface QualitySettings {
  /** Resolution multiplier on top of the 1080p cap (1 = full). */
  res: number;
  bloom: boolean;
}

/** Draws every viewport into the composer's buffer (the first pass of the modern look). */
class ViewportsPass extends Pass {
  scene: THREE.Scene | null = null;
  viewports: Viewport[] = [];
  constructor() {
    super();
    this.needsSwap = false;
  }
  override render(
    r: THREE.WebGLRenderer,
    _w: THREE.WebGLRenderTarget,
    read: THREE.WebGLRenderTarget,
  ): void {
    if (!this.scene) return;
    const W = read.width,
      H = read.height;
    r.setRenderTarget(read);
    r.setClearColor(0x000000, 1);
    r.clear();
    this.viewports.forEach((vp, i) => {
      const x = Math.round(vp.x * W),
        w = Math.round(vp.w * W),
        h = Math.round(vp.h * H);
      const y = H - Math.round(vp.y * H) - h;
      vp.camera.aspect = w / h;
      vp.camera.updateProjectionMatrix();
      psxUniforms.uSnapRes.value.set(w, h);
      vp.before?.();
      r.shadowMap.needsUpdate = vp.shadow ?? i === 0;
      read.viewport.set(x, y, w, h);
      read.scissor.set(x, y, w, h);
      read.scissorTest = true;
      r.setRenderTarget(read); // three reads the target viewport on bind
      r.render(this.scene!, vp.camera);
    });
    read.viewport.set(0, 0, W, H);
    read.scissorTest = false;
  }
}

/** A gentle grade after tone mapping: a touch more colour and contrast, a soft vignette. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 1.03);                      // saturation
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.18);      // gentle S-curve
      vec2 d = vUv - 0.5;
      c *= 1.0 - dot(d, d) * 0.32;                     // vignette
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

/** Owns the WebGL renderer and draws 1-4 viewports in the chosen look. */
export class View {
  readonly renderer: THREE.WebGLRenderer;
  look: LookName = 'modern';
  private rt: THREE.WebGLRenderTarget;
  private post: { scene: THREE.Scene; camera: THREE.OrthographicCamera; mat: THREE.ShaderMaterial };
  private width = 1;
  private height = 1;
  /** Modern-look post-processing (null on ?quality=low). */
  private composer: EffectComposer | null = null;
  private vpPass = new ViewportsPass();
  private bloom: UnrealBloomPass | null = null;
  private quality: QualitySettings = { res: 1, bloom: true };

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = true;
    // Shadows are redrawn when a view asks (once per frame), not before every view.
    this.renderer.shadowMap.autoUpdate = false;
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

    if (new URLSearchParams(location.search).get('quality') !== 'low') {
      // Multisampled HDR buffer -> bloom on the brightest things -> tone map -> grade.
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(this.vpPass);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 0.92);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      this.composer.addPass(new ShaderPass(GradeShader));
    }

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

  /** Pixel density: the screen's, capped at 1080p worth of pixels, times the quality scale. */
  private pixelRatio(): number {
    const cap = Math.sqrt(MAX_PIXELS / Math.max(1, this.width * this.height));
    return Math.min(window.devicePixelRatio || 1, 2, cap) * this.quality.res;
  }

  /** Apply automatic-quality settings (resolution changes reallocate buffers, so only on change). */
  setQuality(q: QualitySettings): void {
    const resChanged = q.res !== this.quality.res;
    this.quality = { ...q };
    if (this.bloom) this.bloom.enabled = q.bloom;
    if (resChanged) this.resize();
  }

  /** Drawing-buffer size in pixels (for the frame-rate display). */
  get bufferSize(): { w: number; h: number } {
    const v = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    return { w: v.x, h: v.y };
  }

  resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(this.width, this.height);
    const lines = RETRO_LINES;
    this.rt.setSize(Math.round((lines * this.width) / this.height), lines);
    this.post.mat.uniforms.uRes!.value.set(this.rt.width, this.rt.height);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(this.width, this.height);
  }

  render(scene: THREE.Scene, viewports: Viewport[]): void {
    const r = this.renderer;
    const retro = this.look === 'retro';
    if (!retro && this.composer) {
      this.vpPass.scene = scene;
      this.vpPass.viewports = viewports;
      this.composer.render();
      return;
    }
    const W = retro ? this.rt.width : this.width;
    const H = retro ? this.rt.height : this.height;
    r.setRenderTarget(retro ? this.rt : null);
    r.setScissorTest(true);
    viewports.forEach((vp, i) => {
      const x = Math.round(vp.x * W),
        w = Math.round(vp.w * W),
        h = Math.round(vp.h * H);
      const y = H - Math.round(vp.y * H) - h; // GL origin is bottom-left
      vp.camera.aspect = w / h;
      vp.camera.updateProjectionMatrix();
      psxUniforms.uSnapRes.value.set(w, h);
      vp.before?.();
      r.shadowMap.needsUpdate = vp.shadow ?? i === 0;
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
    });
    r.setScissorTest(false);
    if (retro) {
      r.setRenderTarget(null);
      r.setViewport(0, 0, this.width, this.height);
      r.render(this.post.scene, this.post.camera);
    }
  }
}
