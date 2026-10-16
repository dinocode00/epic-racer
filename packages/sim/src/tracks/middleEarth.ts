import type { HazardDef } from '@epic/shared';
import { TrackBuilder } from '../builder.ts';

/**
 * Middle-earth: one big lap through the lands of The Lord of the Rings, clockwise.
 *
 *  Hobbiton    sheep, hay, Gandalf's cart, Green Dragon barrels; jump over Bag End;
 *              fireworks from lap 2
 *  Weathertop  climb against charging Nazgul, summit hairpin, leap off the summit
 *  Rivendell   narrow elven bridge with no railings over the gorge, waterfall spray
 *  Moria       the Watcher's tentacles at the Doors of Durin; slalom through the
 *              Dwarrowdelf pillars; falling rock; the Bridge of Khazad-dum: narrow,
 *              no railings, broken in the middle, the Balrog's whip
 *  Lothlorien  mallorn trunks growing in the road
 *  Argonath    jump the Anduin between the two kings
 *  Rohan       rolling whoops, Rohirrim galloping across
 *  Pelennor    Oliphaunts and catapult boulders; switchbacks up Minas Tirith and a leap
 *              off the citadel's prow
 *  Mordor      the Black Gate opens and shuts; jump the lava (fall in and the Eagles
 *              come); the Eye's searchlight
 *  Dead Marshes narrow causeway, no edges, mud
 */
const bump = (
  kind: string,
  lat: number,
  r: number,
  extra: Partial<HazardDef> = {},
): Omit<HazardDef, 's'> => ({ kind, lat, r, effect: 'bump', ...extra });

export const MIDDLE_EARTH = (() => {
  const b = new TrackBuilder(6, 8);

  // ------------------------------------------------------------ Hobbiton
  b.region('hobbiton').mark('partyField');
  b.hazard(60, bump('hayBale', 5, 1.1)).hazard(75, bump('hayBale', -4.5, 1.1));
  b.hazard(95, {
    kind: 'sheep',
    lat: 0,
    r: 1.0,
    effect: 'bump',
    move: { axis: 'lat', amp: 6, period: 5 },
  });
  b.hazard(105, {
    kind: 'sheep',
    lat: 2,
    r: 1.0,
    effect: 'bump',
    move: { axis: 'lat', amp: 5, period: 4, phase: 2 },
  });
  b.straight(130);
  b.mark('bagEnd').ramp(28, 14).flight({ drop: 2, pop: 3, landing: 35 }); // over the top of Bag End
  b.turn(55, 70, 6);
  b.mark('gandalfLane');
  b.hazard(10, {
    kind: 'gandalfCart',
    lat: -3,
    r: 1.8,
    effect: 'bump',
    move: { axis: 's', amp: 25, period: 16 },
  });
  for (let i = 0; i < 4; i++)
    b.hazard(15 + i * 14, {
      kind: 'firework',
      lat: i % 2 ? 3 : -3,
      r: 2.2,
      effect: 'launch',
      strike: { period: 5, warn: 1, active: 0.4, phase: i * 1.2 },
      fromLap: 2,
    });
  b.straight(130);
  b.turn(-40, 60, 6);
  b.mark('millBridge');
  b.hazard(20, {
    kind: 'barrel',
    lat: 0,
    r: 0.8,
    effect: 'bump',
    move: { axis: 'lat', amp: 7, period: 3 },
  });
  b.hazard(32, {
    kind: 'barrel',
    lat: 0,
    r: 0.8,
    effect: 'bump',
    move: { axis: 'lat', amp: 7, period: 3, phase: Math.PI },
  });
  b.straight(60);
  b.turn(25, 80);
  b.straight(50, 7);

  // ------------------------------------------------------------ Weathertop
  b.region('weathertop');
  for (let i = 0; i < 3; i++)
    b.hazard(20 + i * 25, {
      kind: 'nazgulRider',
      lat: i % 2 ? 4 : -4,
      r: 1.6,
      effect: 'spin',
      move: { axis: 's', amp: 18, period: 6, phase: i * 2 },
    });
  b.straight(100, 18);
  b.mark('weathertopSummit');
  b.turn(150, 20, 4); // summit hairpin
  b.mark('weathertopLeap').ramp(22, 16).flight({ drop: 16, pop: 4, landing: 45 });
  b.turn(-65, 55, 6);
  b.straight(80, 17);

  // ------------------------------------------------------------ Rivendell
  b.region('rivendell');
  b.turn(-45, 60, 6);
  b.mark('rivendellBridge').width(10).begin('open');
  b.straight(140);
  b.end('open').width();
  b.turn(50, 70, 8);
  b.mark('rivendellFalls');
  b.hazard(25, { kind: 'spray', lat: 4, r: 4, effect: 'slow' });
  b.straight(120);

  // ------------------------------------------------------------ Moria
  b.region('moria').mark('doorsOfDurin');
  for (let i = 0; i < 3; i++)
    b.hazard(18 + i * 18, {
      kind: 'tentacle',
      lat: [-3, 4, -1][i]!,
      r: 2.6,
      effect: 'launch',
      strike: { period: 4.5, warn: 1.2, active: 0.6, phase: i * 1.5 },
    });
  b.straight(70);
  b.begin('tunnels').mark('dwarrowdelf');
  for (let i = 0; i < 8; i++)
    b.hazard(20 + i * 22, bump('pillar', [-4, 4, 0, -5, 5, -2, 3, 0][i]!, 1.6));
  b.straight(200);
  b.turn(70, 50, 6);
  for (let i = 0; i < 4; i++)
    b.hazard(20 + i * 30, {
      kind: 'fallingRock',
      lat: [-3, 3, 0, -4][i]!,
      r: 2.2,
      effect: 'spin',
      strike: { period: 5, warn: 1.3, active: 0.5, phase: i * 1.1 },
    });
  b.straight(150);
  b.turn(-45, 50, 6);
  b.mark('khazadDum').width(8).begin('open');
  b.straight(30);
  b.hazard(8, {
    kind: 'balrogWhip',
    lat: 0,
    r: 2.4,
    effect: 'launch',
    strike: { period: 4, warn: 1.0, active: 0.45 },
  });
  b.mark('bridgeBreak').ramp(12, 10).flight({ drop: 1, pop: 4, landing: 20, open: true });
  b.straight(25);
  b.end('open').width();
  b.mark('moriaExit').straight(30).end('tunnels');
  b.straight(10);

  // ------------------------------------------------------------ Lothlorien
  b.region('lothlorien');
  b.turn(40, 80, 6);
  b.mark('mallorns');
  for (let i = 0; i < 7; i++)
    b.hazard(25 + i * 28, bump('mallorn', [-3.5, 3.5, 0, -4.5, 2, 4.5, -1][i]!, 2.2));
  b.straight(320, 4);
  b.turn(25, 100);

  // ------------------------------------------------------------ Argonath
  b.region('argonath').mark('argonath');
  b.straight(40);
  b.mark('anduinJump').ramp(30, 16).flight({ speed: 32, drop: 4, pop: 6, landing: 40 });
  b.straight(60, 12);

  // ------------------------------------------------------------ Rohan
  b.region('rohan');
  b.turn(45, 90, 6);
  b.mark('edoras');
  for (let i = 0; i < 3; i++) b.ramp(14, 12).flight({ drop: 0.5, pop: 2, landing: 22 }); // rolling whoops
  for (let i = 0; i < 3; i++)
    b.hazard(-60 + i * 25, {
      kind: 'rohirrim',
      lat: 0,
      r: 1.8,
      effect: 'spin',
      move: { axis: 'lat', amp: 8, period: 4.5, phase: i * 1.6 },
    });
  b.straight(60, 8);

  // ------------------------------------------------------------ Pelennor & Minas Tirith
  b.region('pelennor');
  b.turn(35, 100, 6);
  b.mark('oliphaunts');
  for (let i = 0; i < 3; i++)
    b.hazard(40 + i * 55, {
      kind: 'oliphaunt',
      lat: 0,
      r: 3.6,
      effect: 'launch',
      move: { axis: 'lat', amp: 10, period: 9, phase: i * 2.1 },
    });
  for (let i = 0; i < 4; i++)
    b.hazard(30 + i * 45, {
      kind: 'boulder',
      lat: [3, -4, 1, -2][i]!,
      r: 3,
      effect: 'spin',
      strike: { period: 6, warn: 1.6, active: 0.5, phase: i * 1.4 },
    });
  b.straight(150);
  b.mark('minasTirith').mark('greatGate');
  b.straight(50, 10);
  b.turn(170, 15, 0); // switchback up the tiers
  b.straight(55, 10);
  b.turn(-170, 15, 0);
  b.straight(45, 10);
  b.mark('prow').ramp(24, 15).flight({ speed: 32, drop: 30, pop: 4, landing: 50 });
  b.turn(55, 70, 8);
  b.straight(130, 27); // up onto the plateau of Mordor

  // ------------------------------------------------------------ Mordor
  b.region('mordor').mark('blackGate');
  b.hazard(30, {
    kind: 'gateLeft',
    lat: -4,
    r: 4,
    effect: 'bump',
    strike: { period: 7, warn: 1.2, active: 1.8 },
  });
  b.hazard(30, {
    kind: 'gateRight',
    lat: 4,
    r: 4,
    effect: 'bump',
    strike: { period: 7, warn: 1.2, active: 1.8 },
  });
  b.straight(60);
  b.turn(-30, 60, 6);
  b.mark('mountDoom');
  for (let i = 0; i < 3; i++)
    b.hazard(10 + i * 20, {
      kind: 'lavaBurst',
      lat: [-4, 3, 0][i]!,
      r: 2.4,
      effect: 'launch',
      strike: { period: 4, warn: 1.1, active: 0.5, phase: i * 1.3 },
    });
  b.straight(60);
  b.mark('lavaJump').ramp(20, 14).flight({ drop: 0, pop: 4, landing: 30, open: true });
  b.mark('baradDur');
  b.hazard(30, {
    kind: 'eyeBeam',
    lat: 0,
    r: 4.5,
    effect: 'slow',
    move: { axis: 'lat', amp: 7, period: 5 },
  });
  b.turn(35, 60, 8);
  b.straight(90);

  // ------------------------------------------------------------ Dead Marshes
  b.region('deadMarshes').mark('deadMarshes').width(10).begin('open');
  for (let i = 0; i < 4; i++)
    b.hazard(15 + i * 22, { kind: 'mud', lat: i % 2 ? 2.5 : -2.5, r: 3, effect: 'slow' });
  b.turn(-20, 60);
  b.turn(20, 60);
  b.end('open').width();
  b.closeLoop();

  return b.build({
    id: 'middleEarth',
    name: 'Middle-earth',
    defaultWidth: 16,
    laps: 2,
    boostPads: [],
    itemRows: [],
  });
})();

export const ME_MARKS = MIDDLE_EARTH.marks!;
export const ME_REGIONS = MIDDLE_EARTH.regions!;
