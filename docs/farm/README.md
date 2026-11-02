# Grandparents' Farm (new map, blueprint stage)

A future Epic Racer map built from a childhood memory of the grandparents' farm. We are
still in the **blueprint stage**: getting the land, landmarks and their looks right. Race
routes are deliberately not designed yet.

| File | What it is |
| --- | --- |
| `sketch.jpg` | The hand-drawn master sketch with the 17 numbered landmarks. It wins every disagreement. |
| `blueprint.png` | The current blueprint (v15): landmarks on the real outline, contours every 2 ft. |
| `blueprint.json` | The same blueprint as data, in metres (x east, y north, origin at the SW property corner): every confirmed fact, the open questions, the terrain model and all 913 Christmas trees. |

## Landmarks

1 Farmhouse · 2 Wooden garage · 3 Large red barn · 4 Paved ramp up to the barn ·
5 Gravel driveway · 6 Tall aluminum windmill · 7 Orchard · 8 Grape vines ·
9 Red wooden garage · 10 Wire corn crib · 11 Red wooden shed · 12 Plexiglass greenhouse ·
13 Christmas tree rows · 14 Pumpkin patch · 15 Rusted barrel stove · 16 Clothes lines ·
17 Kids' playhouse. Also: old stone well, sandbox, vegetable and flower garden, mailbox,
a very large Scotch pine, five huge spruces between the road and the house, a row of 11 ft
arborvitae along the driveway, a spruce row along the northeast line, mowed grass paths, and
a wild field of weeds, grass and wildflowers. The red garage has a rooster weather vane.
Two old flat wooden hay wagons stand in the grass east of the shed, one with pumpkins, and a
mature lilac (purple blossoms) grows from the grass on each side at the bottom of the barn ramp.

## The picture to capture

Lush green summer into early fall: fruit on the trees, flowers blooming, sunshine. About
five acres bordered by prairie and trees, no fences. A wild field of weeds, grass and
wildflowers lies outside the east line. A cracked paved country road on the
northwest side with a light ditch along it, a gravel lane on the northeast, neighbouring
farmhouses behind trees to the northeast and southwest, and a
rising hill of grass and wildflowers past the pumpkin patch.

## Key facts (full list in `blueprint.json` under `confirmed`)

- Farmhouse and barn stood where today's house and barn stand. The farmhouse (from the
  owner's photo) is an L-shaped two-storey house: white siding, slate-blue trim, dark
  shingles, buff brick chimney, fieldstone foundation, a steep front gable with an octagonal
  vent, a west porch with white railings and lattice, and south-facing front steps with
  railings and a white bench.
- Barn: rounded fieldstone foundation about 8 ft high, red with white trim, black shingle
  gable roof with a large green Christmas tree and white star painted on the west slope.
  A paved ramp leads up to two tractor-size sliding doors. On the south end, one giant
  sliding door has a walk-through door cut into it and a netless basketball hoop.
- The yard (5) is all gravel; only the barn ramp is paved.
- Orchard: 9 lines running with the barn's length, about 10 trees each. Apples are grafted
  trees about 13 ft tall with fruit hanging at about 5 ft; the two west lines are pear and
  cherry.
- Christmas trees: Scotch pine, Douglas fir, white pine and blue spruce in bands from west
  to east, in an orderly grid of south-north lines, sizes random tree by tree. The block
  reaches west to a mowed path along the property line. Its top is one straight west-east
  line just south of the back of the red garage; the gravel yard stops short of it.
- Ground (barnyard = 0): falls about 20 ft south to the pumpkin patch (gentle at first,
  steeper near the bottom), about 15 ft west to the road corner, and rises slightly toward
  the farmhouse.

Answers use a farm compass: "north" is along the barn toward the wooden garage, "west" is
the barn's ramp side.

## How it was made

- The property outline was traced from a present-day satellite photo (not committed) and
  scaled to the owner's estimate of about 5 acres (≈ 139 m × 218 m). South of the Christmas
  trees' top edge, the east line follows memory instead: just outside the east mowed path
  (≈ 4.8 acres in all).
- The sketch was stretched onto that outline with mean value coordinates, matching 7 points
  (both road corners, the notch, both south corners, the NE corner, the driveway entrance),
  with the farmhouse and barn pinned to today's footprints.
- Buildings are squared to one grid: the barn's long axis is perpendicular to the NE
  property line.
- Today's pond is new since then and is left out. The dense evergreen forest across the
  south half today is the Christmas tree block grown up.

## In the game (first look)

The farm is built in 3D from this blueprint at **1:10 scale**: racers are RC-car sized, the
barn is about 225 m long and the property is about 1.4 × 2.2 km, so crossing it at a kart's
top speed takes about a minute. No racetrack yet.

- Run the game (`pnpm start` or the launcher), then open `http://localhost:4000/farm.html`.
- Fly around like a drone, pick a landmark to fly to it, or press **Drive a mini kart**
  (arrows/WASD, Shift for a burst, V to change the ride, C for the drone again).
- `apps/game/src/farm/farmLayout.json` is the game's copy of the blueprint. Regenerate it
  with `python3 tools/farm-blueprint/export_game.py apps/game/src/farm/farmLayout.json`
  (run from `tools/farm-blueprint`, with the images folder the other scripts use).
- The scale is one constant, `FARM_SCALE` in `apps/game/src/farm/layout.ts`.

## Status

- [x] Step 1: placement (boundary, positions, rough sizes)
- [x] Step 2: the look of each landmark
- [x] Step 3: ground and surroundings
- [x] Step 4: blueprint locked as map data (`apps/game/src/farm/farmLayout.json`)
- [x] First 3D build of the farm in the game (`farm.html`)
- Later: race routes

Rebuild with `tools/farm-blueprint/` (Python 3 + numpy + Pillow). It needs the sketch and
the satellite photo, saved as `2.jpg` and `1.webp` in one folder:
`python3 blueprint.py <image-folder> <out-folder>`, then `python3 build_page.py <out>.html`.
`terrain.py` holds the slope model and the Christmas tree layout; `notes.py` holds the
page text, confirmed facts and open questions.
