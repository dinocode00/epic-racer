import { describe, expect, it } from 'vitest';
import { type PadState, VEHICLES, neutralPad, vehicleById } from '@epic/shared';
import { type ItemKind, type KartState, MIDDLE_EARTH, PROVING, Race, clone } from '../src/index.ts';

/** Human karts on the proving ground's start straight, already racing. */
function setup(ids: string[], at: [number, number][]) {
  const race = new Race(
    PROVING,
    ids.map((id) => ({ vehicle: vehicleById(id), human: true })),
    2,
  );
  race.phase = 'racing';
  race.time = 1;
  race.karts.forEach((k, i) => place(race, k, at[i]![0], at[i]![1]));
  return race;
}
function place(race: Race, k: KartState, s: number, lat: number) {
  const f = race.track.frameAtS(s);
  k.pos = race.track.pointAt(s, lat, k.params.rideHeight);
  k.prevPos = clone(k.pos);
  k.fwd = clone(f.tan);
  k.up = clone(f.up);
  k.hint = race.track.nearestIndex(k.pos);
  k.s = s;
  k.lat = lat;
  k.progress = s;
}
const gas: PadState = { ...neutralPad(), throttle: 1 };
const give = (k: KartState, item: ItemKind) => {
  k.item = item;
  k.itemCount = item === 'boost3' ? 3 : 1;
};
const run = (race: Race, steps: number, pads: PadState[] = []) => {
  for (let i = 0; i < steps; i++) race.step(pads.length ? pads : race.karts.map(() => gas));
};

describe('items', () => {
  it('a tap of ITEM uses every kind of item a human can hold', () => {
    const kinds: ItemKind[] = [
      'boost',
      'boost3',
      'shot',
      'homing',
      'trap',
      'shield',
      'whip',
      'special',
      'eagle',
    ];
    for (const kind of kinds) {
      const race = setup(
        ['bat', 'pod'],
        [
          [60, 0],
          [120, 3],
        ],
      );
      const k = race.karts[0]!;
      run(race, 5);
      give(k, kind);
      const before = k.itemCount;
      run(race, 1, [{ ...gas, item: true }, gas]); // one step down, then let go
      run(race, 5);
      expect(`${kind}: ${k.itemCount}`).toBe(`${kind}: ${before - 1}`);
    }
  });

  it('driving through a box rolls an item into the empty slot', () => {
    const row = PROVING.itemRows![0]!;
    const race = setup(['bat'], [[row - 25, 0]]);
    const k = race.karts[0]!;
    k.speed = 25;
    run(race, 60 * 3);
    expect(k.item).not.toBeNull();
  });

  it('the leader never draws the eagle or the whip; the back of the field often does', () => {
    const race = setup(
      ['bat', 'pod'],
      [
        [400, 0],
        [20, 3],
      ],
    );
    race.step([gas, gas]);
    const [lead, back] = race.karts;
    const lead50 = Array.from({ length: 200 }, () => race.items.roll(lead!));
    const back50 = Array.from({ length: 200 }, () => race.items.roll(back!));
    expect(lead50.filter((i) => i === 'eagle' || i === 'whip').length).toBe(0);
    expect(back50.filter((i) => i === 'eagle' || i === 'special').length).toBeGreaterThan(60);
  });

  it('a straight shot spins the racer ahead; a shield blocks the next one; no double hits', () => {
    const race = setup(
      ['bat', 'pod'],
      [
        [20, 0],
        [60, 0],
      ],
    );
    const [a, b] = race.karts;
    a!.speed = b!.speed = 25;
    give(a!, 'shot');
    race.items.use(a!);
    run(race, 60);
    expect(b!.stunTime).toBeGreaterThan(0);
    expect(b!.immuneTime).toBeGreaterThan(0);
    // Immune: a second shot straight away does nothing.
    const stun = b!.stunTime;
    give(a!, 'shot');
    place(race, a!, b!.s - 15, b!.lat);
    race.items.use(a!);
    run(race, 20);
    expect(b!.stunTime).toBeLessThanOrEqual(stun);
    // Shielded after the immunity wears off: blocked.
    run(race, 120);
    b!.shieldTime = 8;
    give(a!, 'shot');
    place(race, a!, b!.s - 15, b!.lat);
    race.items.use(a!);
    run(race, 30);
    expect(b!.shieldTime).toBe(0);
    expect(b!.stunTime).toBe(0);
  });

  it('holding a shot behind you soaks up a shot from behind', () => {
    const race = setup(
      ['bat', 'pod'],
      [
        [20, 0],
        [50, 0],
      ],
    );
    const [a, b] = race.karts;
    a!.speed = b!.speed = 25;
    give(b!, 'trap');
    b!.trailing = true;
    give(a!, 'shot');
    race.items.use(a!);
    race.step([gas, { ...gas, item: true }]);
    run(race, 40, [gas, { ...gas, item: true }]);
    expect(b!.stunTime).toBe(0);
    expect(b!.item).toBeNull();
  });

  it('Nazgûl: the Morgul blade cuts a racer alongside and leaves it chilled', () => {
    const race = setup(
      ['nazgul', 'pod'],
      [
        [20, -1.5],
        [30, 2.0],
      ],
    );
    const [n, p] = race.karts;
    n!.speed = 30;
    p!.speed = 22;
    give(n!, 'special');
    race.items.use(n!);
    expect(n!.special?.kind).toBe('morgul');
    let cut = false;
    for (let i = 0; i < 120 && !cut; i++) {
      race.step([gas, gas]);
      cut = p!.stunTime > 0;
    }
    expect(cut).toBe(true);
    expect(p!.slowTime).toBeGreaterThan(0.5);
  });

  it('Pod Racer: the flame vent scorches whoever is tailing', () => {
    const race = setup(
      ['pod', 'bat'],
      [
        [40, 0],
        [33, 0],
      ],
    );
    const [p, b] = race.karts;
    p!.speed = b!.speed = 30;
    give(p!, 'special');
    race.items.use(p!);
    run(race, 10);
    expect(b!.stunTime).toBeGreaterThan(0);
    expect(p!.stunTime).toBe(0);
  });

  it('Batmobile: the Batmissile knocks aside whoever it touches and shrugs off hits', () => {
    const race = setup(
      ['bat', 'mach5'],
      [
        [20, 0],
        [26, 0.3],
      ],
    );
    const [b, m] = race.karts;
    b!.speed = 40;
    m!.speed = 20;
    give(b!, 'special');
    race.items.use(b!);
    run(race, 30);
    expect(m!.stunTime).toBeGreaterThan(0);
    expect(Math.abs(m!.slide)).toBeGreaterThan(2);
    expect(b!.stunTime).toBe(0);
    expect(race.items.hit(b!, m!.id)).toBe(false);
  });

  it('Mach 5: the auto-jacks vault it into the air and the robot bird chases the racer ahead', () => {
    const race = setup(
      ['mach5', 'bat'],
      [
        [20, 0],
        [70, 0],
      ],
    );
    const [m, b] = race.karts;
    m!.speed = 30;
    b!.speed = 25;
    race.step([gas, gas]);
    give(m!, 'special');
    race.items.use(m!);
    expect(m!.air).toBe(true);
    expect(race.items.projectiles.some((p) => p.kind === 'robot' && p.target === b!.id)).toBe(true);
    run(race, 120);
    expect(b!.stunTime > 0 || b!.immuneTime > 0).toBe(true);
  });

  it('the Great Eagle carries you well up the road, safe, and sets you down on it', () => {
    const race = new Race(MIDDLE_EARTH, [{ vehicle: VEHICLES[1]!, human: true }], 2);
    race.phase = 'racing';
    race.time = 1;
    const k = race.karts[0]!;
    place(race, k, 2400, 0); // just before the Anduin jump: the eagle flies over the gap
    k.progress = 2400;
    give(k, 'eagle');
    race.items.use(k);
    expect(race.items.hit(k, 99)).toBe(false);
    run(race, 60 * 4);
    expect(k.eagleTime).toBe(0);
    expect(k.progress - 2400).toBeGreaterThan(150);
    expect(k.rescueTime).toBe(0);
    const gap = MIDDLE_EARTH.gaps!.find(([a, b]) => k.s > a && k.s < b);
    expect(gap).toBeUndefined();
  });

  it("the Balrog's whip warns the leader, then lashes; late in the race it becomes boosts", () => {
    const race = setup(
      ['bat', 'pod'],
      [
        [300, 0],
        [100, 0],
      ],
    );
    run(race, 1);
    const [lead, back] = race.karts;
    give(back!, 'whip');
    race.items.use(back!);
    run(race, 30);
    expect(lead!.threat).toBe('whip');
    run(race, 100);
    expect(lead!.stunTime > 0 || lead!.immuneTime > 0).toBe(true);
    lead!.progress = race.track.length * 2 * 0.97;
    give(back!, 'whip');
    race.items.use(back!);
    expect(back!.item).toBe('boost3');
  });

  it('eight AI racers finish Middle-earth using items, nobody stuck', () => {
    const race = new Race(
      MIDDLE_EARTH,
      Array.from({ length: 8 }, (_, i) => ({ vehicle: VEHICLES[i % 4]!, human: false })),
    );
    let used = 0,
      hits = 0;
    while (race.phase !== 'finished' && race.time < 900) {
      race.step([]);
      for (const e of race.items.events) {
        if (e.kind === 'use') used++;
        if (e.kind === 'hit') hits++;
      }
    }
    console.log(
      'items used',
      used,
      'hits',
      hits,
      'finish',
      race.karts.map((k) => k.finishTime.toFixed(0)).join(' '),
    );
    expect(race.phase).toBe('finished');
    expect(used).toBeGreaterThan(40);
    expect(hits).toBeGreaterThan(5);
  });
});
