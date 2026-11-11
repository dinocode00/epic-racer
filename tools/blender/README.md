# Blender models

Some characters are modelled, rigged and animated in [Blender](https://www.blender.org) instead
of being built from code. Blender is driven by Python scripts here, with no window, so a model
is rebuilt from scratch by one command and the script is the source of truth.

| Script      | Output                                  | Used by                       |
| ----------- | --------------------------------------- | ----------------------------- |
| `nazgul.py` | `apps/game/src/render/models/nazgul.glb` | `apps/game/src/render/rigged.ts` |
| `cat.py` | `apps/game/src/render/models/cat.glb` (both barn cats) | `apps/game/src/render/rigged.ts`, `farm/critters.ts` |
| `trees.py` | `apps/game/src/farm/treesAo.json` (shading in the crowns) | `apps/game/src/farm/treesAo.ts` |
| `pumpkin.py` | `apps/game/src/render/models/pumpkins.glb` (pumpkin bodies and stem) | `apps/game/src/farm/plants.ts` |
| `buildings.py --what vehicle-<id> --normalize` | `apps/game/src/render/models/ao/<id>.jpg` + `.json` (each code-built vehicle) | `apps/game/src/render/vehicleAo.ts` |
| `grandpa.py` | `apps/game/src/farm/grandpa/skin.json` (skin weights) | `apps/game/src/farm/grandpa/skin.ts` |
| `buildings.py` | `apps/game/src/farm/buildingsAo.jpg` + `.json` (baked soft shadows) | `apps/game/src/farm/buildingsAo.ts` |

`kit.py` holds the shared helpers (swept tubes, lofts, cloth cards, skin weights, posing).

## Rebuilding a model

Blender is only needed to change a model. The exported `.glb` is committed, so playing or
building the game needs nothing extra.

```sh
python3 -m venv .tools/blender && .tools/blender/bin/pip install bpy   # once (about 450 MB)
.tools/blender/bin/python tools/blender/nazgul.py -- apps/game/src/render/models/nazgul.glb
```

Add `--preview some/dir` to also render pictures of the rest pose and of each clip with
Blender's own renderer, which is the quick way to check a change before opening the game.

Grandpa is still built by the game's code; Blender only works out how his clothes bend.
After changing his meshes, export him from the game first, then redo the weights:

```sh
node tools/blender/export.cjs /tmp/grandpa-export.json
.tools/blender/bin/python tools/blender/grandpa.py -- /tmp/grandpa-export.json apps/game/src/farm/grandpa/skin.json
```

The buildings' soft shadows are redone the same way (after changing any building):

```sh
node tools/blender/export.cjs /tmp/buildings-export.json buildings
.tools/blender/bin/python tools/blender/buildings.py -- /tmp/buildings-export.json /tmp/buildingsAo
# then convert /tmp/buildingsAo.png to a grey JPEG at apps/game/src/farm/buildingsAo.jpg
# (e.g. ffmpeg -i /tmp/buildingsAo.png -pix_fmt gray -q:v 3 ...) and copy the .json beside it
```

If the weights or the shadows get out of date, the changed pieces simply stay rigid until this is rerun.

## How a model reaches the game

- **Skin**: overlapping parts are melted into one surface (voxel remesh), smoothed and thinned,
  then bound to the skeleton with Blender's automatic weights.
- **Animation**: each clip is a Python function from time to a pose. Legs are placed from hoof
  targets (inverse kinematics), so hooves plant and push off. The script checks its own pose
  maths against Blender before keyframing.
- **Materials**: only their names matter. `rigged.ts` swaps in the game's own materials by
  name, so Blender-built and code-built models share one look. A new material name must be
  added there (the test in `apps/game/test/models.test.ts` fails otherwise).
- **Delivery**: the `.glb` is bundled into the script as data (`?inline`), so there is no extra
  file to host.
