import { TrackBuilder } from '../builder.ts';

/**
 * Proving Grounds: the gray-box test track. A banked rectangle with a hill,
 * a long sweeper and a full vertical loop that proves track-relative gravity
 * (the same system the Inception "Paris Fold" will use).
 */
export const PROVING = (() => {
  const A = 170,
    B = 110,
    R = 46,
    SHIFT = 22;
  const b = new TrackBuilder(6, 9)
    .straight(A) // start / finish straight
    .turn(90, R, 14)
    .hill(B + SHIFT, 8)
    .turn(90, R, 14)
    .straight(60)
    .loop(15, SHIFT)
    .straight(A - 60)
    .turn(90, R, 18)
    .straight(B)
    .turn(90, R, 14);
  const end = b.position;
  if (Math.hypot(end[0], end[1], end[2]) > 0.5) {
    throw new Error(`Proving Grounds does not close: ends at ${end.join(',')}`);
  }
  return b.build({
    id: 'proving',
    name: 'Proving Grounds',
    defaultWidth: 18,
    laps: 3,
    boostPads: [300, 640],
    itemRows: [120, 520],
  });
})();
