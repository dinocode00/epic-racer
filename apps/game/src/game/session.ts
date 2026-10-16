import * as THREE from 'three';
import { type PadState, type TrackDef, VEHICLES, neutralPad, vehicleById } from '@epic/shared';
import { type AiBrain, COUNTDOWN, Race, STEP, aiDrive, createBrain } from '@epic/sim';
import { KartView } from '../render/kartView.ts';
import type { View, Viewport } from '../render/view.ts';
import { World } from '../render/world.ts';
import { ChaseCam } from './camera.ts';
import { Hud } from './hud.ts';
import type { InputSource } from './input.ts';

export interface PlayerSetup {
  name: string;
  color: string;
  vehicle: string;
  source: InputSource;
  /** Drive this human slot with the AI (demo / screenshots). */
  autopilot?: boolean;
  /** Returns true while the player is away (phone dropped); the AI drives meanwhile. */
  away?: () => boolean;
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
  private cams: ChaseCam[];
  private huds: Hud[];
  private spectator?: ChaseCam;
  private humans: number[];
  private pads: PadState[] = [];
  private autoBrains = new Map<number, AiBrain>();
  private acc = 0;
  private countdownEl: HTMLDivElement;
  private hudRoot: HTMLElement;
  private dividers: HTMLDivElement[] = [];
  onFinished?: (
    order: { name: string; color: string; vehicle: string; human: boolean; time: number }[],
  ) => void;
  private finishedFired = false;
  private names: string[];
  private colors: string[];

  constructor(
    private view: View,
    track: TrackDef,
    private players: PlayerSetup[],
    laps = track.laps,
    total = 8,
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
    this.race = new Race(track, entrants, laps);
    this.humans = players.map((_, i) => aiCount + i);
    this.names = [...AI_NAMES.slice(0, aiCount), ...players.map((p) => p.name)];
    this.colors = [...AI_COLORS.slice(0, aiCount), ...players.map((p) => p.color)];
    this.world = new World(this.race.track, view.renderer);
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
      );
      this.world.scene.add(v.root);
      return v;
    });
    this.cams = this.humans.map(() => new ChaseCam());
    if (players.length === 3) this.spectator = new ChaseCam();

    this.hudRoot = document.getElementById('hud')!;
    this.hudRoot.innerHTML = '';
    const rects = layout(players.length === 3 ? 4 : players.length);
    this.huds = players.map((p, i) => {
      const h = new Hud(this.hudRoot, p.name, p.color);
      const r = rects[i]!;
      h.setRect(...r);
      return h;
    });
    if (players.length > 1) {
      const mk = (css: Partial<CSSStyleDeclaration>) => {
        const d = document.createElement('div');
        d.className = 'divider';
        Object.assign(d.style, css);
        this.hudRoot.appendChild(d);
        this.dividers.push(d);
      };
      mk({ left: '0', right: '0', top: 'calc(50% - 2px)', height: '4px' });
      if (players.length > 2) mk({ top: '0', bottom: '0', left: 'calc(50% - 2px)', width: '4px' });
    }
    this.countdownEl = document.createElement('div');
    this.countdownEl.className = 'countdown';
    this.hudRoot.appendChild(this.countdownEl);
    players.forEach((p, i) => {
      if (p.autopilot) this.autoBrains.set(this.humans[i]!, createBrain(100 + i, 1));
    });
  }

  /** Run the simulation forward instantly (for screenshots and tests). */
  fastForward(seconds: number): void {
    const steps = Math.round(seconds * 60);
    for (let i = 0; i < steps; i++) this.stepSim();
  }

  private stepSim(): void {
    const pads: (PadState | undefined)[] = [];
    this.humans.forEach((ki, i) => {
      const away = this.players[i]!.away?.() ?? false;
      if (away && !this.autoBrains.has(ki)) this.autoBrains.set(ki, createBrain(200 + i, 0.8));
      if (!away && !this.players[i]!.autopilot && this.autoBrains.has(ki))
        this.autoBrains.delete(ki);
      const brain = this.autoBrains.get(ki);
      pads[ki] = brain
        ? aiDrive(brain, this.race.karts[ki]!, this.race.track, this.race.leaderProgress, STEP)
        : (this.pads[i] ?? neutralPad());
    });
    this.race.step(pads);
  }

  frame(dt: number): void {
    this.pads = this.players.map((p) => p.source.poll());
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= STEP) {
      this.stepSim();
      this.acc -= STEP;
    }
    const alpha = this.acc / STEP;

    const fx = this.world.fx;
    this.race.karts.forEach((k, i) => {
      const hi = this.humans.indexOf(i);
      const steer = hi >= 0 ? (this.autoBrains.has(i) ? 0 : (this.pads[hi]?.steer ?? 0)) : 0;
      this.views[i]!.update(k, steer, alpha, dt, fx);
    });
    fx.update(dt);

    // Cameras and HUD.
    this.humans.forEach((ki, i) => {
      const k = this.race.karts[ki]!;
      this.cams[i]!.update(this.views[ki]!, k.speed, k.boostTime > 0, !!this.pads[i]?.lookBack, dt);
      this.huds[i]!.update(k, this.race.lapOf(k), this.race.laps);
    });
    if (this.spectator) {
      const leader = this.race.karts.find((k) => k.place === 1)!;
      this.spectator.update(this.views[leader.id]!, leader.speed, leader.boostTime > 0, false, dt);
    }

    // Countdown.
    const t = this.race.time;
    if (t < 0) {
      this.countdownEl.textContent = String(Math.ceil(-t));
      this.countdownEl.className = 'countdown';
    } else if (t < 1) {
      this.countdownEl.textContent = 'GO!';
      this.countdownEl.className = 'countdown go';
    } else this.countdownEl.textContent = '';

    // Render all viewports.
    const rects = layout(this.players.length === 3 ? 4 : this.players.length);
    const vps: Viewport[] = this.cams.map((c, i) => {
      const [x, y, w, h] = rects[i]!;
      const kv = this.views[this.humans[i]!]!;
      return {
        x,
        y,
        w,
        h,
        camera: c.camera,
        before: () => {
          this.world.focusSun(kv.pos);
          fx.setViewportHeight(
            h * window.innerHeight * this.view.renderer.getPixelRatio(),
            c.camera.fov,
          );
        },
      };
    });
    if (this.spectator) {
      const [x, y, w, h] = rects[3]!;
      const sc = this.spectator;
      vps.push({
        x,
        y,
        w,
        h,
        camera: sc.camera,
        before: () => this.world.focusSun(sc.camera.position),
      });
    }
    this.view.render(this.world.scene, vps);

    if (this.race.phase === 'finished' && !this.finishedFired) {
      this.finishedFired = true;
      const order = [...this.race.karts].sort((a, b) => a.place - b.place);
      this.onFinished?.(
        order.map((k) => ({
          name: this.names[k.id]!,
          color: this.colors[k.id]!,
          vehicle: k.vehicle.name,
          human: this.humans.includes(k.id),
          time: k.finished ? k.finishTime : NaN,
        })),
      );
    }
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
