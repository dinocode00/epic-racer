# Grandparents' Farm (new map, blueprint stage)

A future Epic Racer map built from a childhood memory of the grandparents' farm. We are
still in the **blueprint stage**: getting the land, landmarks and their looks right. Race
routes are deliberately not designed yet.

| File | What it is |
| --- | --- |
| `sketch.jpg` | The hand-drawn master sketch with the 17 numbered landmarks. It wins every disagreement. |
| `blueprint.png` | The current blueprint (v2): landmarks on the real outline, with contours for the slopes. |
| `blueprint.json` | The same blueprint as data, in metres (x east, y north, origin at the SW property corner), including confirmed facts, the terrain model and all 569 Christmas trees. |

## Landmarks

1 Farmhouse · 2 Wooden garage · 3 Large red barn · 4 Gravel hill up to barn ·
5 Gravel driveway · 6 Tall aluminum windmill · 7 Apple tree orchard · 8 Grape vines ·
9 Red wooden garage · 10 Corn grain bin · 11 Red wooden shed · 12 Clear plexiglass
greenhouse · 13 Christmas tree rows · 14 Pumpkin patch · 15 Old rusted wood burner ·
16 Clothes lines · 17 Kids' small playhouse.

Unnumbered scenery from the sketch: a big shade tree by the wood burner, five evergreens
between the road and the house, a tree row along the northeast line, dashed paths around
the Christmas trees, and a lane between the Christmas trees and the pumpkin patch.

## Confirmed so far

- Farmhouse and barn stood where today's house and barn stand.
- Barn: stone foundation about 8 ft high. The second floor is reached by an earth ramp
  centred on the west wall, ending at two tractor-size sliding doors that open left and
  right. Ground floor on the south side: a small door and a large sliding door with a
  basketball hoop (no net).
- The driveway (5) is all open gravel, graded for driving and parking. No grass inside it.
- Corn bin (10) is a round wire-mesh corn crib. Wood burner (15) is a barrel stove on legs
  with a tall stovepipe.
- Christmas trees (13): Scotch pine, Douglas fir, white pine, blue spruce in bands from west
  to east, in neat south-north lines. Sizes: 15% knee high or below, 50% about 6 ft,
  35% 8 to 10 ft.
- Ground: south of an east-west line through the north tip of the Christmas trees, the land
  falls gradually to the pumpkin patch, the lowest point. West of a line from the
  orchard's west side to the farmhouse, the land slopes down to the west. How far each
  slope drops is not confirmed yet (placeholders: 13 ft and 10 ft).

## How it was made

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

- [ ] Step 1: placement confirmed (boundary, positions, rough sizes). Nearly done.
- [ ] Step 2: the look of each landmark (shapes, colours, materials, heights). Started.
- [ ] Step 3: ground and surroundings (slopes, surfaces, tree types, what lies beyond). Started.
- [ ] Step 4: blueprint locked as map data
- Later: race routes

Rebuild with `tools/farm-blueprint/` (Python 3 + numpy + Pillow). It needs the sketch and
the satellite photo, saved as `2.jpg` and `1.webp` in one folder:
`python3 blueprint.py <image-folder> <out-folder>`, then `python3 build_page.py <out>.html`. `terrain.py` holds the slope model and the
Christmas tree layout.
