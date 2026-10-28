# Grandparents' Farm (new map, blueprint stage)

A future Epic Racer map built from a childhood memory of the grandparents' farm. We are
still in the **blueprint stage**: getting the land, landmarks and their looks right. Race
routes are deliberately not designed yet.

| File | What it is |
| --- | --- |
| `sketch.jpg` | The hand-drawn master sketch with the 17 numbered landmarks. It wins every disagreement. |
| `blueprint-v1.png` | Blueprint v1: the sketch's landmarks placed on the real property outline. |
| `blueprint.json` | The same blueprint as data, in metres (x east, y north, origin at the SW property corner). |

## Landmarks

1 Farmhouse · 2 Wooden garage · 3 Large red barn · 4 Gravel hill up to barn ·
5 Gravel driveway · 6 Tall aluminum windmill · 7 Apple tree orchard · 8 Grape vines ·
9 Red wooden garage · 10 Corn grain bin · 11 Red wooden shed · 12 Clear plexiglass
greenhouse · 13 Christmas tree rows · 14 Pumpkin patch · 15 Old rusted wood burner ·
16 Clothes lines · 17 Kids' small playhouse.

Unnumbered scenery from the sketch: a big shade tree by the wood burner, five evergreens
between the road and the house, a tree row along the northeast line, dashed paths around
the Christmas trees, and a lane between the Christmas trees and the pumpkin patch.

## How v1 was made

- The property outline was traced from a present-day satellite photo (not committed). Area
  ≈ 4.6 acres, about 133 m × 209 m. Scale is provisional (≈ 0.19 m per satellite pixel,
  judged from today's barn, houses and road) until the real acreage is known.
- The sketch was stretched onto that outline with mean value coordinates, matching 7 points
  (both road corners, the notch, both south corners, the NE corner, the driveway entrance).
- The farmhouse and barn are pinned to today's house and barn footprints. Today's barn
  still has a separate section on its NE end (the wooden garage, 2) and a gravel loop on its
  west side (the gravel hill, 4).
- Buildings are squared to one grid: the barn's long axis is perpendicular to the NE
  property line.
- Today's pond is new since the sketch's time and is left out. The dense evergreen forest
  across the south half today is the Christmas tree block grown up.

## Status

- [ ] Step 1: placement confirmed (boundary, positions, rough sizes)
- [ ] Step 2: the look of each landmark (shapes, colours, materials, heights)
- [ ] Step 3: ground and surroundings (slopes, surfaces, tree types, what lies beyond)
- [ ] Step 4: blueprint locked as map data
- Later: race routes

Rebuild with `tools/farm-blueprint/` (Python 3 + numpy + Pillow). It needs the sketch and
the satellite photo, saved as `2.jpg` and `1.webp` in one folder:
`python3 blueprint.py <image-folder> <out-folder>`, then `python3 build_page.py <out>.html`.
