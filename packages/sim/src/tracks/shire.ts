import { TrackBuilder } from '../builder.ts';

/**
 * Shire Downs (inspired by The Lord of the Rings). The Grand Prix opener: wide, rolling
 * and forgiving. Start on the village green by the Party Tree, crest blind hills, cross
 * the brook on a stone bridge by the mill, wind through the hobbit-hole lane, climb past
 * the ruined watchtower, and swoop back down to the green.
 *
 * Landmarks are recorded as arc-length marks so the renderer can dress the scene.
 */
export const SHIRE_MARKS: Record<string, number> = {};

export const SHIRE = (() => {
  const b = new TrackBuilder(6, 8);
  const mark = (name: string) => {
    SHIRE_MARKS[name] = b.length;
  };
  b.straight(110); // village green start
  mark('crest1');
  b.hill(90, 7); // first blind crest
  b.turn(85, 60, 8);
  b.straight(50, -4);
  b.turn(-55, 55, 6);
  mark('bridgeStart');
  b.straight(64); // stone bridge over the brook
  mark('bridgeEnd');
  b.turn(95, 48, 10);
  mark('villageStart');
  b.turn(-30, 80);
  b.turn(30, 80);
  b.straight(40);
  mark('villageEnd');
  b.straight(90, 14); // climb toward the watchtower
  mark('towerTurn');
  b.turn(110, 42, 12);
  b.straight(80, -10);
  b.turn(-35, 70, 6);
  mark('crest2');
  b.hill(70, 5);
  b.turn(60, 70, 8);
  mark('closing');
  b.closeLoop();
  return b.build({
    id: 'shire',
    name: 'Shire Downs',
    defaultWidth: 16,
    laps: 3,
    boostPads: [],
    itemRows: [],
  });
})();
