import { VEHICLES } from './vehicles.ts';
import { VEHICLE_ICONS } from './icons.ts';

/**
 * The "How to play" guide, shared by the TV lobby and the phone so they always agree.
 * Returned as HTML; each app styles the `.howto` classes its own way.
 */

const SPECIALS: Record<string, string> = {
  pod: '<b>Flame Vent</b>: speed burst, fire jet scorches anyone behind.',
  bat: '<b>Batmissile</b>: turns into a rocket that rams racers aside.',
  nazgul: '<b>Morgul Charge</b>: surge forward, blade strikes the nearest rival.',
  mach5: '<b>Auto-Jacks + Robot</b>: leaps up, a robot chases the racer ahead.',
  corolla: '<b>Flame Vent</b>: speed burst, fire jet scorches anyone behind.',
  landcruiser: '<b>Auto-Jacks + Robot</b>: leaps up, a robot chases the racer ahead.',
};

const ITEMS: [string, string, string][] = [
  ['🍞', 'Boost <i>(Lembas)</i>', 'A burst of speed. ×3 gives you three.'],
  ['🏹', 'Shot <i>(Elven arrows)</i>', 'Flies straight ahead and spins the first racer it hits.'],
  ['🎆', 'Homing shot <i>(Dragon firework)</i>', 'Chases down the racer just ahead.'],
  ['✴️', 'Trap <i>(Orc caltrops)</i>', 'Lands on the road; whoever drives over it spins.'],
  ['🛡️', 'Shield <i>(Mithril)</i>', 'Blocks the next hit for 8 seconds.'],
  ['🔥', "Leader strike <i>(Balrog's whip)</i>", 'Lashes whoever is 1st (2nd if that is you).'],
  ['🦅', 'Great Eagle', 'Carries you forward high over everything.'],
  ['⭐', 'Special', "Your own vehicle's power (see Vehicles)."],
];

const bar = (n: number) => `<i class="howto-bar"><i style="width:${n * 20}%"></i></i>`;

export function howToHtml(): string {
  const vehicles = VEHICLES.map(
    (
      v,
    ) => `<tr><td class="howto-icon">${VEHICLE_ICONS[v.id] ?? ''}</td><td><b>${v.name}</b><br><small>${SPECIALS[v.id] ?? ''}</small></td>
      <td>${bar(v.speed)}</td><td>${bar(v.handling)}</td><td>${bar(v.weight)}</td></tr>`,
  ).join('');
  return `<div class="howto">
  <h2>How to play</h2>

  <section><h3>Getting started</h3><ul>
    <li><b>Phones:</b> scan the QR code on the TV. The first time, Safari warns the connection is not private; tap <i>Show Details</i>, then <i>visit this website</i>.</li>
    <li><b>Xbox pad:</b> press A. <b>Keyboard:</b> Enter (arrow keys) or Space (WASD).</li>
    <li>Pick a ride, then READY. The race starts when everyone is ready. Change track with T or LB/RB.</li>
    <li>First across the line after the last lap wins!</li>
  </ul></section>

  <section><h3>Controls</h3><div class="howto-cols">
    <div><h4>📱 Phone</h4><ul>
      <li><b>Right thumb</b>, anywhere on the right half: hold for gas.</li>
      <li><b>Slide</b> steering: slide that thumb left or right.</li>
      <li><b>Tilt</b> steering (choose in the lobby): hold the phone like a wheel and turn it. CENTER sets straight.</li>
      <li><b>Left thumb:</b> DRIFT and ITEM.</li>
      <li>Let go of the gas to slow down.</li>
      <li><b>❚❚</b> (top right) pauses: resume, restart the race or exit to the lobby.</li>
    </ul></div>
    <div><h4>🎮 Xbox pad</h4><ul>
      <li>Left stick: steer</li><li>RT: gas · LT: brake / reverse</li>
      <li>A or RB: drift</li><li>X or LB: item</li><li>Y: look back · Start: pause</li>
    </ul></div>
    <div><h4>⌨️ Keyboard</h4><ul>
      <li><b>Player 1:</b> arrows, Right Shift drift, . (period) item, , (comma) look back</li>
      <li><b>Player 2:</b> WASD, Left Shift drift, E item, C look back</li>
      <li>Esc or P: pause · F2: modern / retro look</li>
    </ul></div>
  </div></section>

  <section><h3>Racing tips</h3><ul>
    <li><b>Start boost:</b> hit the gas in the last second of the countdown. Too early and you spin.</li>
    <li><b>Drift boost:</b> hold DRIFT while turning at speed. Sparks go blue, orange, purple; let go for a boost (purple is biggest).</li>
    <li><b>Slipstream:</b> tuck in right behind another racer to get towed, then a boost.</li>
    <li><b>Big air:</b> ramps and drops launch you; you can steer a little in the air.</li>
    <li>Fall off the track and a Great Eagle carries you back. Going the wrong way for 2 seconds turns you around.</li>
    <li>Fire backwards (Xbox, keyboard): hold brake or look back as you let go.</li>
  </ul></section>

  <section><h3>Items</h3>
    <p>Drive through the rows of item boxes to get one item at a time; the further behind you are, the stronger they get. Hold ITEM with a shot or trap to trail it behind you as a shield, let go to fire.</p>
    <table class="howto-items">${ITEMS.map(([i, n, d]) => `<tr><td class="howto-ic">${i}</td><td><b>${n}</b><br><small>${d}</small></td></tr>`).join('')}</table>
  </section>

  <section><h3>Vehicles</h3>
    <p><b>Speed</b>: top speed. <b>Handling</b>: how sharply it turns. <b>Weight</b>: heavy rides win bumps but pick up speed slower; light ones get going quicker but get knocked around. Every vehicle gets big air.</p>
    <table class="howto-veh"><tr><th></th><th></th><th>SPEED</th><th>HANDLING</th><th>WEIGHT</th></tr>${vehicles}</table>
  </section>
</div>`;
}
