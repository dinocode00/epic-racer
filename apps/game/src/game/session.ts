import * as THREE from 'three';
import { type PadState, type TrackDef, VEHICLES, neutralPad, vehicleById } from '@epic/shared';
import { COUNTDOWN, type KartState, Netplay, Race, STEP } from '@epic/sim';
import { HazardViews } from '../render/hazardViews.ts';
import { ItemViews } from '../render/itemViews.ts';
import { KartView } from '../render/kartView.ts';
import type { View, Viewport } from '../render/view.ts';
import type { Theme } from '../render/themes.ts';
import { World } from '../render/world.ts';
import { ChaseCam } from './camera.ts';
import { Hud } from './hud.ts';
import { Minimap } from './minimap.ts';
import type { InputSource } from './input.ts';
import { type LinkSetup, quantizePad } from './link.ts';

export interface PlayerSetup {
  name: string;
  color: string;
  vehicle: string;
  source: InputSource;
  /** Drive this human slot with the AI (demo / screenshots). */
  autopilot?: boolean;
  /** Returns true while the player is away (phone dropped); the AI drives meanwhile. */
  away?: () => boolean;
  /**
   * 8-Player Local: false for a player on the other laptop (raced here, but with no camera
   * or input on this one).
   */
  local?: boolean;
}

/** Autopilot skill for an away player, and for a demo player. */
const AWAY_SKILL = 0.8,
  DEMO_SKILL = 1;

/** A racer on the results screen. `player` is the player's index (-1 for AI racers). */
export interface Finisher {
  name: string;
  color: string;
  vehicle: string;
  human: boolean;
  player: number;
  time: number;
}

const AI_NAMES = ['Ripley', 'Marty', 'Ferris', 'Leia', 'Elliott', 'Sarah', 'Indy', 'Neo'];
const AI_COLORS = [
  '#9aa0a6',
  '#c0c4c8',
  '#a7a29a',
  '#8f969e',
  '#b4aaa0',
  '#9fa7b0',
  '#aaa',
  '#999',
];

/** Normalised viewport rectangles for 1-4 players. */
export function layout(n: number): [number, number, number, number][] {
  if (n <= 1) return [[0, 0, 1, 1]];
  if (n === 2)
    return [
      [0, 0, 1, 0.5],
      [0, 0.5, 1, 0.5],
    ];
  return [
    [0, 0, 0.5, 0.5],
    [0.5, 0, 0.5, 0.5],
    [0, 0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5, 0.5],
  ].slice(0, 4) as [number, number, number, number][];
}

/** One race: simulation, scene, cameras, HUDs. */
export class RaceSession {
  readonly race: Race;
  readonly world: World;
  private views: KartView[];
  private hazardViews: HazardViews;
  private itemViews: ItemViews;
  private cams: ChaseCam[];
  private huds: Hud[];
  private spectator?: ChaseCam;
  private humans: number[];
  /** The players with a camera on this laptop (all of them, except in 8-Player Local). */
  private viewers: number[];
  private pads: PadState[] = [];
  private acc = 0;
  /** 8-Player Local: the race shared with the other laptop, and its link. */
  readonly net: Netplay | null = null;
  private link: LinkSetup | null = null;
  private nextHash = 30;
  private ticks = 0;
  /** Held still (8-Player Local: until both laptops have built the race). */
  waiting = false;
  private countdownEl: HTMLDivElement;
  private hudRoot: HTMLElement;
  private dividers: HTMLDivElement[] = [];
  private minimap: Minimap;
  private focus: THREE.Vector3[] = [];
  onFinished?: (order: Finisher[]) => void;
  private finishedFired = false;
  private names: string[];
  private colors: string[];

  constructor(
    private view: View,
    track: TrackDef,
    private players: PlayerSetup[],
    laps = track.laps,
    total = 8,
    theme?: Theme,
    /** AI difficulty, 0 easy .. 3 expert. */
    aiLevel = 1,
    /** 8-Player Local: race this together with another laptop. */
    link?: LinkSetup,
  ) {
    // AI fills the front of the grid; humans start at the back, like the classics.
    const aiCount = Math.max(0, total - players.length);
    const entrants = [
      ...Array.from({ length: aiCount }, (_, i) => ({
        vehicle: VEHICLES[i % VEHICLES.length]!,
        human: false,
      })),
      ...players.map((p) => ({ vehicle: vehicleById(p.vehicle), human: true })),
    ];
    this.race = new Race(track, entrants, laps, aiLevel);
    this.humans = players.map((_, i) => aiCount + i);
    this.viewers = players.flatMap((p, i) => (p.local === false ? [] : [i]));
    if (link) {
      this.link = link;
      this.net = new Netplay(
        this.race,
        this.humans,
        players.map((p) => p.local !== false),
      );
    }
    const nView = this.viewers.length;
    this.names = [...AI_NAMES.slice(0, aiCount), ...players.map((p) => p.name)];
    this.colors = [...AI_COLORS.slice(0, aiCount), ...players.map((p) => p.color)];
    this.world = new World(this.race.track, view.renderer, theme);
    this.views = this.race.karts.map((k, i) => {
      const v = new KartView(
        k.vehicle.id,
        i >= aiCount
          ? this.colors[i]!
          : [
              '#e8433a',
              '#2f7de1',
              '#3fbf5f',
              '#f5c518',
              '#b05de0',
              '#ff8c2e',
              '#28c4c4',
              '#f070b0',
            ][i % 8]!,
        track.id === 'farm' ? 'angel' : 'eagle',
      );
      this.world.scene.add(v.root);
      return v;
    });
    this.hazardViews = new HazardViews(this.race.track, this.race.hazards);
    this.world.scene.add(this.hazardViews.group);
    this.itemViews = new ItemViews(this.race.track, this.race.items);
    this.world.scene.add(this.itemViews.group);
    this.cams = this.viewers.map(() => new ChaseCam());
    // Three players leave a quarter free; nobody here at all (8-Player Local) shows the leader.
    if (nView === 3 || nView === 0) this.spectator = new ChaseCam();
    // Keep cameras out of hillsides on big jumps (not in tunnels, where rock sits overhead).
    const tunnels = track.tunnels ?? [];
    const underground = (s: number) => tunnels.some(([a, b]) => s >= a - 10 && s <= b + 10);
    this.cams.forEach((c, i) => {
      const k = this.race.karts[this.humans[this.viewers[i]!]!]!;
      c.groundAt = (x, z) => (underground(k.s) ? -Infinity : this.world.groundHeight(x, z));
    });

    this.hudRoot = document.getElementById('hud')!;
    this.hudRoot.innerHTML = '';
    const rects = layout(this.layoutCount);
    this.huds = this.viewers.map((pi, i) => {
      const p = players[pi]!;
      const h = new Hud(this.hudRoot, p.name, p.color);
      h.trackId = track.id;
      const r = rects[i]!;
      h.setRect(...r);
      return h;
    });
    if (nView > 1) {
      const mk = (css: Partial<CSSStyleDeclaration>) => {
        const d = document.createElement('div');
        d.className = 'divider';
        Object.assign(d.style, css);
        this.hudRoot.appendChild(d);
        this.dividers.push(d);
      };
      mk({ left: '0', right: '0', top: 'calc(50% - 2px)', height: '4px' });
      if (nView > 2) mk({ top: '0', bottom: '0', left: 'calc(50% - 2px)', width: '4px' });
    }
    this.minimap = new Minimap(this.hudRoot, this.race.track, Math.max(1, nView));
    this.countdownEl = document.createElement('div');
    this.countdownEl.className = 'countdown';
    this.hudRoot.appendChild(this.countdownEl);
    this.world.setShadowSharing(
      this.cams.length + (this.spectator ? 1 : 0),
      view.renderer.capabilities.maxTextureSize,
    );
    if (this.net)
      this.net.onCorrect = (moved) =>
        moved.forEach(([x, y, z], i) => (x || y || z) && this.views[i]!.correct(x, y, z));
    this.prewarm();
  }

  /**
   * Before the countdown: draw the whole track once with everything showing, every kart's
   * shield, blade, flame and eagle, and one of every item, so all shaders are compiled and
   * all textures are on the GPU. Otherwise each would stall the race the first time it
   * appears (the "first time" hitches).
   */
  private prewarm(): void {
    const restore = [...this.views.map((v) => v.warmup()), this.itemViews.warmup()];
    const changed: [THREE.Object3D, boolean, boolean][] = [];
    this.world.scene.traverse((o) => {
      // Lights stay as they are: one more light would compile a variant the race never uses.
      if ((o as THREE.Light).isLight) return;
      if (!o.visible || o.frustumCulled) {
        changed.push([o, o.visible, o.frustumCulled]);
        o.visible = true;
        o.frustumCulled = false;
      }
    });
    const cam = this.cams[0]?.camera ?? new THREE.PerspectiveCamera();
    this.view.render(this.world.scene, [{ x: 0, y: 0, w: 1, h: 1, camera: cam, shadow: true }]);
    for (const [o, visible, culled] of changed) {
      o.visible = visible;
      o.frustumCulled = culled;
    }
    restore.forEach((r) => r());
    // Replace the warm-up picture with a proper first frame straight away.
    this.frame(0);
  }

  /** Run the simulation forward instantly (for screenshots and tests). */
  fastForward(seconds: number): void {
    const steps = Math.round(seconds * 60);
    for (let i = 0; i < steps; i++) this.stepSim();
  }

  /** Viewports to lay out: three players use quarters; nobody here gets a full screen. */
  private get layoutCount(): number {
    const n = this.viewers.length;
    return n === 3 ? 4 : Math.max(1, n);
  }

  /** What player `i` (on this laptop) drives with this step: their pad, or the autopilot. */
  private inputOf(i: number): PadState {
    const p = this.players[i]!;
    if (p.autopilot) return { ...neutralPad(), auto: DEMO_SKILL };
    if (p.away?.()) return { ...neutralPad(), auto: AWAY_SKILL };
    return this.pads[i] ?? neutralPad();
  }

  private stepSim(): void {
    const pads: (PadState | undefined)[] = [];
    this.humans.forEach((ki, i) => (pads[ki] = this.inputOf(i)));
    this.race.step(pads);
  }

  /**
   * 8-Player Local: run the steps due, each with this laptop's inputs straight away and the
   * other laptop's as last heard (put right as soon as the real ones arrive).
   */
  private stepLinked(dt: number): void {
    const net = this.net!,
      link = this.link!;
    this.acc += Math.min(dt, 0.1) * link.rate();
    let steps = 0;
    while (this.acc >= STEP && steps < 8) {
      if (!net.canAdvance()) {
        // Too long without word from the other laptop: hold here rather than guess further.
        net.stats.stalls++;
        this.acc = Math.min(this.acc, STEP);
        break;
      }
      const f = net.frame;
      const mine: [number, PadState][] = [];
      for (const i of this.viewers) {
        const pad = quantizePad(this.inputOf(i));
        net.setLocal(i, pad);
        mine.push([i, pad]);
      }
      net.advance();
      link.onStep(f, mine);
      this.acc -= STEP;
      steps++;
    }
    net.catchUp();
    // Fingerprints of confirmed steps, to check both laptops still agree.
    const c = net.confirmed;
    while (c + 1 >= this.nextHash) {
      const s = net.stateAt(this.nextHash);
      if (s) link.onHash(this.nextHash, this.race.hash(s));
      this.nextHash += 30;
    }
    // The results come from confirmed steps only, so they're the same on both laptops.
    if (!this.finishedFired && ++this.ticks % 6 === 0) {
      const s = net.stateAt(c + 1);
      if (s?.phase === 'finished') this.finish(s.karts);
    }
  }

  /** Frozen: the race clock and everything on screen stand still, but it keeps rendering. */
  paused = false;

  frame(dt: number): void {
    if (this.paused || this.waiting) dt = 0;
    else {
      this.pads = this.players.map((p) => (p.local === false ? neutralPad() : p.source.poll()));
      if (this.net) this.stepLinked(dt);
      else {
        this.acc += Math.min(dt, 0.1);
        while (this.acc >= STEP) {
          this.stepSim();
          this.acc -= STEP;
        }
      }
    }
    const alpha = this.acc / STEP;

    const fx = this.world.fx;
    this.race.karts.forEach((k, i) => {
      const hi = this.humans.indexOf(i);
      let steer = 0;
      if (hi >= 0 && !this.race.autoBrains[i])
        steer =
          this.players[hi]!.local === false
            ? (this.net?.lastUsed(hi)?.steer ?? 0)
            : (this.pads[hi]?.steer ?? 0);
      this.views[i]!.update(k, steer, alpha, dt, fx);
    });
    this.hazardViews.update(this.race.hazards, fx, dt);
    this.itemViews.update(this.race.time, this.race.karts, fx, dt);
    fx.update(dt);
    this.world.setCamera(this.cams[0]?.camera ?? this.spectator?.camera ?? null);
    this.world.update(dt, this.race.time);

    // Cameras and HUD.
    this.viewers.forEach((pi, i) => {
      const ki = this.humans[pi]!;
      const k = this.race.karts[ki]!;
      this.cams[i]!.update(
        this.views[ki]!,
        k.speed,
        k.boostTime > 0,
        !!this.pads[pi]?.lookBack,
        dt,
      );
      this.huds[i]!.update(k, this.race.lapOf(k), this.race.laps, this.race.time);
    });
    if (this.spectator) {
      const leader = this.race.karts.find((k) => k.place === 1)!;
      this.spectator.update(this.views[leader.id]!, leader.speed, leader.boostTime > 0, false, dt);
    }

    this.minimap.update(this.race.karts, this.colors, this.humans);

    // Countdown.
    const t = this.race.time;
    if (this.waiting) {
      this.countdownEl.textContent = 'WAITING FOR THE OTHER LAPTOP…';
      this.countdownEl.className = 'countdown waiting';
    } else if (t < 0) {
      this.countdownEl.textContent = String(Math.ceil(-t));
      this.countdownEl.className = 'countdown';
    } else if (t < 1) {
      this.countdownEl.textContent = 'GO!';
      this.countdownEl.className = 'countdown go';
    } else this.countdownEl.textContent = '';

    // Render all viewports. One shadow map covers every player when they're near enough to
    // each other; otherwise each view redraws it around its own kart.
    const rects = layout(this.layoutCount);
    const leaderView = () => this.views[this.race.karts.find((k) => k.place === 1)!.id]!;
    this.focus.length = 0;
    for (const pi of this.viewers) this.focus.push(this.views[this.humans[pi]!]!.pos);
    if (this.spectator) this.focus.push(leaderView().pos);
    const sharedShadow = this.world.focusSunOn(this.focus);
    const vps: Viewport[] = this.cams.map((c, i) => {
      const [x, y, w, h] = rects[i]!;
      const ki = this.humans[this.viewers[i]!]!;
      const kv = this.views[ki]!;
      return {
        x,
        y,
        w,
        h,
        camera: c.camera,
        shadow: !sharedShadow || i === 0,
        before: () => {
          // Hide other karts that would sit on top of this camera and block the view.
          this.views.forEach((v) => {
            v.root.visible = v === kv || !v.crowds(c.camera.position);
            v.setViewer(v === kv);
          });
          this.world.applyAtmosphere(this.world.atmosphereAt(this.race.karts[ki]!.s));
          if (!sharedShadow) this.world.focusSun(kv.pos);
          fx.setViewportHeight(
            h * window.innerHeight * this.view.renderer.getPixelRatio(),
            c.camera.fov,
          );
        },
      };
    });
    if (this.spectator) {
      const [x, y, w, h] = rects[this.viewers.length === 3 ? 3 : 0]!;
      const sc = this.spectator;
      vps.push({
        x,
        y,
        w,
        h,
        camera: sc.camera,
        shadow: !sharedShadow,
        before: () => {
          this.views.forEach((v) => {
            v.root.visible = true;
            v.setViewer(false);
          });
          const leader = this.race.karts.find((k) => k.place === 1)!;
          this.world.applyAtmosphere(this.world.atmosphereAt(leader.s));
          if (!sharedShadow) this.world.focusSun(leaderView().pos);
        },
      });
    }
    this.view.render(this.world.scene, vps);

    if (!this.net && this.race.phase === 'finished' && !this.finishedFired)
      this.finish(this.race.karts);
  }

  /** The finishing order, to the results screen. */
  private finish(karts: Pick<KartState, 'id' | 'place' | 'finished' | 'finishTime'>[]): void {
    this.finishedFired = true;
    const order = [...karts].sort((a, b) => a.place - b.place);
    this.onFinished?.(
      order.map((k) => ({
        name: this.names[k.id]!,
        color: this.colors[k.id]!,
        vehicle: this.race.karts[k.id]!.vehicle.name,
        human: this.humans.includes(k.id),
        player: this.humans.indexOf(k.id),
        time: k.finished ? k.finishTime : NaN,
      })),
    );
  }

  /** The kart driven by the i-th human player. */
  humanKart(i: number) {
    const ki = this.humans[i];
    return ki === undefined ? undefined : this.race.karts[ki];
  }

  get countdownSeconds(): number {
    return COUNTDOWN;
  }

  dispose(): void {
    this.hudRoot.innerHTML = '';
    this.world.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
  }
}
