# Farm detail pass: plan and progress

This file tracks the graphics and animation pass over the whole farm. It is kept up to date
as each item lands, so the work can be picked up from here at any time.

- **Status keys:** `[x]` done and pushed · `[~]` in progress · `[ ]` not started · `[?]` needs the owner's say-so first (it would add something to the farm that isn't in the blueprint).
- **Code:** apps/game/src/farm/* (farm-only) and apps/game/src/render/foliage.ts (shared with the other tracks).
- **Check:** every item gets a screenshot from the explorer before it is ticked.

## What good-looking simple games do (and what we take from them)

| Idea | Seen in | What it means here |
| --- | --- | --- |
| One wind for everything: a single breeze direction with gusts that travel across the land, sampled by grass, trees, cloth and particles alike | Ghost of Tsushima ("Blowing from the West"), A Short Hike, Breath of the Wild | One `wind` module. Trees, grass, flowers, laundry, the windmill and the weathervane all read the same gusts, so a gust visibly rolls across the farm. |
| Grass is mostly a shader trick: lots of cheap instanced blades near the camera that fade out with distance, bending more at the tip, lighter at the tip, with a sheen where the wind presses it flat | Ghost of Tsushima, Zelda, countless indie games | Instanced lawn and field grass around the camera, painted ground beyond. |
| Silhouette before detail: a tree species is recognised by its outline and colour first | Every stylised game; tree ID guides | Separate shapes for Scotch pine, Douglas fir, white pine, blue spruce, the big spruces, and for apple/pear/cherry. |
| Shadows must move with the mesh | Valve's tree-sway write-up (the shadow pass ignored the sway) | The depth materials get the same wind as the visible ones. |
| Soft contact darkening and grime where things meet the ground; trim, gutters and small fixtures make buildings read as real | Stylised architecture kits, Animal Crossing, Tiny Glade | Ground contact shadows, a dirt band on walls near the ground, gutters and downspouts, sills, curtains behind the glass, roof ridge caps. |
| Small life everywhere | A Short Hike, Alba, Animal Crossing | Butterflies, swallows round the barn, drifting seed fluff, the odd falling leaf, laundry flapping. |
| Drifting cloud shadows | Most outdoor stylised games | Slow, soft cloud shadows sliding across the farm on the breeze. |

## Phase 1: one summer breeze

- [x] A wind module (`render/wind.ts`): a breeze from the south-west plus gust bands that roll across the land. The same function runs in the shaders (GLSL) and on the CPU (TS).
- [x] Trees bend downwind and flutter harder inside a gust. The shared `windPatch` gets the gust field, and the leaf/needle depth materials get the same motion so the shadows sway too.
- [x] Arborvitae, lilacs, grape leaves and pumpkin leaves sway (lilac bushes and grape foliage merged into single meshes, so fewer draw calls) (they are plain meshes today).
- [x] The windmill wheel speeds up and slows with the gusts at the tower, and the head turns into the wind.
- [x] The rooster weathervane points into the wind with a little jitter.
- [x] Laundry on the clothes lines flaps (with clothes pegs): pinned along the top, billowing downwind.

## Phase 2: trees that read as their species

- [x] **Scotch pine (the giant by the stove):** an orange upper trunk, crooked limbs and a broad, flat-topped crown of needle plates; it reads as a Scotch pine on the skyline. a tall, bare orange-red upper trunk with flaky bark, grey plated bark low down, a few big crooked limbs, and an irregular, flat-topped crown of separate blue-green needle pads.
- [x] **Scotch pine (young, in the Christmas-tree grid):** a sheared, dense cone with a tufty, twisted-needle texture, yellow-green to blue-green.
- [x] **Douglas fir:** a soft, dense, dark green cone with a pointed top and slightly drooping branch tips.
- [x] **White pine:** soft and feathery, with tiered horizontal whorls and gaps between them, blue-green with long needles.
- [x] **Blue spruce:** a stiff, symmetric, spiky cone in silvery blue, with upturned branch tips.
- [x] **Big spruces by the road:** tall and dark, with drooping curtain branchlets.
- [x] **Orchard:** apples get a short, crooked trunk and a wide, spreading crown; pears grow upright and pyramid-shaped; cherries get a rounded crown and reddish banded bark.
- [x] **Woods beyond the line:** three or four broadleaf shapes (oak, maple, ash) so the tree line isn't one tree repeated.

## Phase 3: grass and ground

- [x] Instanced lawn grass around the camera (`farm/grass.ts`): short and mowed, with colour variation and a lighter tip, fading out by distance and bending in the breeze.
- [x] Tall grass in the wild fields and on the berms: seed heads, waving visibly in gusts.
- [x] Late-summer wildflowers in the fields (Queen Anne's lace, chicory, black-eyed Susans, goldenrod), plus clover and the odd dandelion in the lawn.
- [x] Loose gravel stones (instanced pebbles) on the yard, driveway, apron and lane near the camera.
- [x] The kart presses the grass down and out of its way.
- [x] A richer ground texture: lawn colour varying in soft patches, tyre tracks down the gravel lane.
- [x] Soft contact shadows under every building, wagon and tree.

## Phase 4: buildings

- [x] Grime (`farm/grime.ts`): a dirt band on the walls near the ground, rain streaks under windows and eaves, weathering on the barn boards.
- [x] Gutters and downspouts on the farmhouse and the red garage, plus fascia and soffit boards.
- [x] Ridge caps and drip edges on the roofs; shingle rows with relief.
- [x] Windows: sills, curtains or blinds behind the glass, and a sky reflection.
- [x] Siding and boards with real relief (bump maps), so light rakes across the lap siding.
- [x] Small fixtures: an electric meter on the north wall (the spigot, porch lantern and door hardware were already there).
- [ ] Barn: hay visible in the loft door, rust and dents on the metal, the board-and-batten shadow lines.

## Phase 5: life and atmosphere

- [x] Clouds in the sky (`farm/sky.ts`) and their shadows drifting across the farm on the breeze.
- [x] Butterflies around the flowers: monarchs and cabbage whites.
- [x] Barn swallows swooping around the barn and over the lawn (climbing over the roof, not through it).
- [x] Seed fluff and pollen drifting in the sunlight, carried by the breeze.
- [x] Now and then a leaf falling from the orchard trees near the camera, twirling down on the breeze and lying in the grass.
- [ ] The light: a warm summer grade, a soft haze in the distance, and a check that the shadows aren't too hard.

## Ideas to ask the owner about (not added until confirmed)

- [x] Barn cats (owner said yes to a couple): an orange tabby sitting by the barn's south door, and a black-and-white tom patrolling the east side, stopping to sit and look around.
- Owner said no to: a yard light, power poles, a TV antenna, chickens, a dog.
- Mowing stripes on the lawn: already painted (along the farm grid).

## Phase 6: polish and performance

- [x] Grapevines: leafy rows of leaf-card clumps with shoots trailing off the wire (they were faceted gem shapes up close).

- [x] Arborvitae: built from the conifer kit with needle sprays instead of smooth columns.
- [x] Orchard: some fruit on the outside of the crown so it reads from a distance.

- [x] Walk every landmark view and fix anything that looks off (lilacs given leaf fringes and floret sprays; blue spruce toned toward silver-green).
- [x] Load time (now ~8 s in the software renderer, was ~70 s): the ground canvas is painted with ~600k small fills plus blurs, which takes about 70 s on the software renderer used for screenshots. Speckle is now laid down from a pattern tile.
- [ ] Check frame time and draw calls at low and high quality; instance or merge anything that got expensive.
- [x] Republish the explorer (version 10).

## Progress log

- Plan written; baseline screenshots taken.
- Phase 1 done and pushed. Trees, grass, grime, gutters, clouds and critters written.
- Checked in screenshots: tree species, lawn, wild grass, gravel stones, gutters and sills, clouds, butterflies. Butterflies capped at about 40 (one at every flower was ~300). Explorer republished (version 8).
