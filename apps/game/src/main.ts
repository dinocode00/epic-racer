import { PLAYER_COLORS, neutralPad } from '@epic/shared';
import { PROVING } from '@epic/sim';
import { type LookName } from './render/look.ts';
import { View } from './render/view.ts';
import { GamepadSource, type InputSource, KeyboardSource, connectedGamepads } from './game/input.ts';
import { type PlayerSetup, RaceSession } from './game/session.ts';
import { Showroom } from './game/showroom.ts';

/**
 * Milestone 1 entry point: straight into a race on the gray-box track.
 * URL options (for testing and screenshots):
 *   ?players=1..4  ?demo=1 (autopilot humans)  ?t=20 (skip ahead)  ?look=retro
 *   ?vehicles=pod,bat,mach5,...  ?laps=3
 */
const params = new URLSearchParams(location.search);
const view = new View(document.getElementById('stage')!);
view.setLook((params.get('look') as LookName) ?? 'modern');

const keyboard = new KeyboardSource();
const nobody: InputSource = { kind: 'auto', label: 'Autopilot', poll: neutralPad };

function players(): PlayerSetup[] {
  const demo = params.has('demo');
  const pads = connectedGamepads();
  const n = Math.min(4, Math.max(1, Number(params.get('players') ?? 1 + pads.length)));
  const vehicles = (params.get('vehicles') ?? 'pod,bat,nazgul,mach5').split(',');
  const names = ['REX', 'SAM', 'JO', 'KAI'];
  return Array.from({ length: n }, (_, i) => {
    const source: InputSource = i === 0 ? keyboard : pads[i - 1] ? new GamepadSource(pads[i - 1]!.index, pads[i - 1]!.id) : nobody;
    return {
      name: names[i]!,
      color: PLAYER_COLORS[i]!,
      vehicle: vehicles[i % vehicles.length]!,
      source,
      autopilot: demo || source === nobody,
    };
  });
}

let session: RaceSession;
let showroom: Showroom | undefined;
if (params.get('scene') === 'showroom') {
  const ids = (params.get('vehicles') ?? 'pod,bat,nazgul').split(',');
  showroom = new Showroom(view, ids, ids.map((_, i) => PLAYER_COLORS[i]!), Number(params.get('angle') ?? 0.6), Number(params.get('speed') ?? 0));
}
function start(): void {
  if (showroom) return;
  session?.dispose();
  document.getElementById('ui')!.innerHTML = '';
  session = new RaceSession(view, PROVING, players(), Number(params.get('laps') ?? PROVING.laps));
  session.onFinished = (order) => {
    const ui = document.getElementById('ui')!;
    ui.innerHTML = `<div class="results"><h2>RESULTS</h2>${order
      .map(
        (r, i) =>
          `<div class="row ${r.human ? 'human' : ''}"><span>${i + 1}</span><span><i class="sw" style="background:${r.color}"></i>${r.name} · ${r.vehicle}</span><span>${Number.isNaN(r.time) ? '--' : r.time.toFixed(2) + 's'}</span></div>`,
      )
      .join('')}<div class="hint">Press ENTER or A to race again</div></div>`;
  };
  const t = Number(params.get('t') ?? 0);
  if (t > 0) session.fastForward(t);
  (window as unknown as { __epic: unknown }).__epic = { session, view };
}
start();

let last = performance.now();
function loop(now: number): void {
  // ?fixed=1 steps exactly one 60 Hz frame per render (deterministic screenshots on slow machines).
  const dt = params.has('fixed') ? 1 / 60 : Math.min(0.1, (now - last) / 1000);
  last = now;
  if (showroom) showroom.frame(dt, !params.has('fixed'));
  else session.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.addEventListener('keydown', (e) => {
  if (e.code === 'F2') view.setLook(view.look === 'modern' ? 'retro' : 'modern');
  if (e.code === 'Enter' && session?.race.phase === 'finished') start();
});
window.addEventListener('gamepadconnected', () => {
  if (session && session.race.time < 0) start();
});
