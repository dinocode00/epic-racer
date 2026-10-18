# Items, power-ups and special abilities (design draft)

Status: built (first version). Decisions below are final for now; numbers are first-pass tuning.
Background research: [reports/Kart racer item design.md](../reports/Kart%20racer%20item%20design.md).

## Decisions so far

| #   | Decision                                                                                       |
| --- | ---------------------------------------------------------------------------------------------- |
| 1   | Default chaos level **Classic** (a gentler Chill preset for young kids later)                  |
| 2   | **One** held item slot (hold ITEM to trail a trap/shot behind you as a shield)                 |
| 3   | **Yes** to a rare anti-leader item, with a counter                                             |
| 4   | **One track-themed item per track**, on top of the shared roster (which is reskinned per film) |
| 5   | Weapon-style film gadgets are **in** (guns, blades, flame vents)                               |
| 6   | One of the things you can pull from an item box is **SPECIAL**: your vehicle's unique ability  |

## How it plays

- Rows of item boxes across the road, about three rows per lap.
- Drive through one: a short roulette (~1 s) on the TV next to your place, and the icon
  appears on your phone's ITEM button.
- One slot. Tap ITEM to use. Shots and traps can be fired backwards (stick down / swipe down)
  or held behind you as a shield.
- What you draw depends on how far behind the leader you are (time gap): the further back,
  the better the odds of boosts, SPECIAL and the anti-leader item.
- Every hit uses the existing spin (about a second, you keep your heading). After a hit you
  can't be hit again for ~2 s. Homing attacks show a warning on the TV at least 1 s before.

## Shared roster (built once, reskinned per film)

| Mechanic           | What it does                                                                         | Middle-earth skin                    |
| ------------------ | ------------------------------------------------------------------------------------ | ------------------------------------ |
| Boost              | Short speed burst                                                                    | Lembas bread                         |
| Triple Boost       | Three bursts, use one at a time                                                      | Three lembas                         |
| Straight Shot      | Fires dead ahead (or back); spins the first racer it hits                            | Elven arrow volley                   |
| Homing Shot        | Chases the next racer ahead; warning on their screen                                 | Dragon firework (Merry and Pippin's) |
| Drop Trap          | Leave it on the road behind you, or hold as a shield                                 | Orc caltrops                         |
| Shield             | Blocks one hit for ~8 s                                                              | Mithril vest                         |
| Anti-leader (rare) | Long warning, then spins whoever is 1st; never in the last stretch; Shield blocks it | Balrog's whip                        |
| **SPECIAL**        | Your vehicle's unique ability (below)                                                | —                                    |
| **Track item**     | One per track (below)                                                                | —                                    |

## Special abilities (one per vehicle)

Each special mixes a speed burst with a distinct way to hurt rivals: to the side, behind,
straight through, and over the top. That keeps them different from each other and easy to
read on a split screen. Each has its own colour and sound.

### Nazgûl: Morgul Charge (your idea)

- The horse breaks into a full gallop: about +25% speed for 3 s.
- The rider holds out a pale Morgul blade on one side. It reaches about 4 m out.
- Any racer the blade passes through is cut: it spins, and a "Morgul chill" leaves it
  slowed (frosted screen edges) for 1.5 s.
- Side choice: the blade swaps automatically to whichever side has the closest rival
  (simple for kids), or follows your steering at the moment you trigger it.
- Ghostly blue-white blade trail and a Nazgûl shriek on activation.
- Alternative or extra: the shriek makes racers just ahead wobble (the existing rear-bump
  wobble) as a "fear" effect.

### Pod Racer: Sebulba's Flame Vent

- Engines go to full afterburn: about +35% speed for 2.5 s, the biggest straight-line burst
  in the game.
- A jet of flame blasts out of the back, about 12 m long. Anyone behind you in it is
  scorched: spins and loses speed. It punishes anyone sitting in your slipstream.
- Film basis: Sebulba's hidden, illegal flame vent that roasted a rival's engines.
- Alternative: the flame vents sideways (left and right) instead of backwards, roasting
  racers alongside. This overlaps with the Nazgûl, so backwards is preferred.

### Batmobile: Batmissile

- The car sheds its outer panels and narrows into the rocket-shaped Batmissile
  (_Batman Returns_).
- For 3 s it is unstoppable: +30% speed, immune to hits and hazards, and anyone it touches is
  knocked aside spinning (like a Mario Kart Star, but a battering ram).
- Its narrower body can slip through gaps that the normal Batmobile can't.
- Alternative: Bat-Guns. Front machine guns fire a 2 s burst at the first racer ahead
  within ~40 m (spin), plus a short boost. Simpler, more "weapon", less spectacle.

### Mach 5: Auto-Jacks + Homing Robot

- Button A: the auto-jacks fire and the Mach 5 vaults high into the air, about 2 s of
  hang time over the traffic and any hazards below, landing with a boost.
- Button G: at the same moment it releases its homing robot bird, which chases the
  nearest racer ahead and spins them (they get a warning, like any homing shot).
- Alternative: Button C, rotary saws. Saws come out of both sides for 3 s and cut anyone
  you side-swipe. Overlaps with the Nazgûl, so the jacks + robot are preferred.

### Balance targets

- Each special is worth about one Triple Boost plus one attack.
- SPECIAL shows up more often further back, and rarely for 1st place.
- AI racers use their specials too, with simple rules, for example the Pod Racer fires
  its vent when someone is right behind it.
- Specials never launch a kart off the track and never stack with another hit (the ~2 s
  immunity after a hit applies).

## Middle-earth track item (pick one)

| Option                  | Effect                                                                                                                | Plays as                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Great Eagle** (lean)  | An eagle swoops in and carries you forward about 150 m, immune to everything, then drops you on the road              | Big catch-up for the back of the field; huge spectacle. Shown in gold so it isn't confused with the fall rescue |
| Elven Cloak             | 6 s: homing shots lose you, and the Eye of Sauron's searchlight can't slow you                                        | Defensive; pays off at the Black Gate and the Eye                                                               |
| Horn of Helm Hammerhand | A shockwave that clears nearby shots and traps and wobbles racers around you; a ghostly Rohirrim charge rides through | Counter and area attack                                                                                         |
| Phial of Galadriel      | A burst of light that dazzles racers ahead (screen flash, weaker steering for 1 s)                                    | Short-range attack; stronger in Moria                                                                           |

## Controls

- Phone: tap ITEM to use; swipe down on ITEM to fire backwards; hold ITEM to trail.
  The button shows the held item's icon (SPECIAL shows your vehicle's emblem).
- Xbox: X or LB to use; hold to trail; stick down + X to fire backwards.
- Keyboard: E / Left Ctrl (WASD player) or Period / Right Ctrl (arrows player); hold to
  trail; hold back (S or Down) while firing to throw backwards.
- All warnings appear on the TV in the attacker's colour, with a distinct sound per threat.
  iPhones can't vibrate from a web page; Xbox pads rumble.

Chosen: all four specials as written; the Nazgûl blade swings to the nearest rival
automatically; Middle-earth's item is the **Great Eagle**. Firing backwards is "hold BRAKE
(or look back) while you use it" on every controller.

## Build order once approved

1. Item boxes, roulette, slot, TV and phone icons, controls, hit immunity.
2. Shared roster (6 + anti-leader) with Middle-earth skins; AI item use.
3. The four specials.
4. The Middle-earth track item.
5. Tuning presets (Chill / Classic / Chaos) and per-player "help" odds.
