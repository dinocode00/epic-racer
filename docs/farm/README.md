# Grandparents' Farm (new map, blueprint stage)

A future Epic Racer map built from a childhood memory of the grandparents' farm. We are
still in the **blueprint stage**: getting the land, landmarks and their looks right. Race
routes are deliberately not designed yet.

| File | What it is |
| --- | --- |
| `sketch.jpg` | The hand-drawn master sketch with the 17 numbered landmarks. It wins every disagreement. |
| `blueprint.png` | The current blueprint (v4): landmarks on the real outline, contours every 2 ft. |
| `blueprint.json` | The same blueprint as data, in metres (x east, y north, origin at the SW property corner): every confirmed fact, the open questions, the terrain model and all 623 Christmas trees. |

## Landmarks

1 Farmhouse · 2 Wooden garage · 3 Large red barn · 4 Paved ramp up to the barn ·
5 Gravel driveway · 6 Tall aluminum windmill · 7 Orchard · 8 Grape vines ·
9 Red wooden garage · 10 Wire corn crib · 11 Red wooden shed · 12 Plexiglass greenhouse ·
13 Christmas tree rows · 14 Pumpkin patch · 15 Rusted barrel stove · 16 Clothes lines ·
17 Kids' playhouse. Also: old stone well, sandbox, vegetable and flower garden, mailbox,
a very large Scotch pine, a spruce row along the northeast line, mowed grass paths, and a
wild field of weeds, grass and wildflowers.

## The picture to capture

Lush green summer into early fall: fruit on the trees, flowers blooming, sunshine. Five
acres bordered by prairie and trees, no fences. A cracked paved country road on the
northwest side, neighbouring farmhouses behind trees to the northeast and southwest, and a
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
  to east, in an orderly grid of south-north lines, sizes random tree by tree.
- Ground (barnyard = 0): falls about 20 ft south to the pumpkin patch (gentle at first,
  steeper near the bottom), about 15 ft west to the road corner, and rises slightly toward
  the farmhouse.

Answers use a farm compass: "north" is along the barn toward the wooden garage, "west" is
the barn's ramp side.

## How it was made

- The property outline was traced from a present-day satellite photo (not committed) and
  scaled to the owner's estimate of about 5 acres (≈ 139 m × 218 m).
- The sketch was stretched onto that outline with mean value coordinates, matching 7 points
  (both road corners, the notch, both south corners, the NE corner, the driveway entrance),
  with the farmhouse and barn pinned to today's footprints.
- Buildings are squared to one grid: the barn's long axis is perpendicular to the NE
  property line.
- Today's pond is new since then and is left out. The dense evergreen forest across the
  south half today is the Christmas tree block grown up.

## Status

- [x] Step 1: placement (boundary, positions, rough sizes)
- [ ] Step 2: the look of each landmark. Mostly done; a few small details open.
- [ ] Step 3: ground and surroundings. Mostly done.
- [ ] Step 4: blueprint locked as map data
- Later: race routes

Rebuild with `tools/farm-blueprint/` (Python 3 + numpy + Pillow). It needs the sketch and
the satellite photo, saved as `2.jpg` and `1.webp` in one folder:
`python3 blueprint.py <image-folder> <out-folder>`, then `python3 build_page.py <out>.html`.
`terrain.py` holds the slope model and the Christmas tree layout; `notes.py` holds the
page text, confirmed facts and open questions.
