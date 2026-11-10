# Blender models

Some characters are modelled, rigged and animated in [Blender](https://www.blender.org) instead
of being built from code. Blender is driven by Python scripts here, with no window, so a model
is rebuilt from scratch by one command and the script is the source of truth.

| Script      | Output                                  | Used by                       |
| ----------- | --------------------------------------- | ----------------------------- |
| `nazgul.py` | `apps/game/src/render/models/nazgul.glb` | `apps/game/src/render/rigged.ts` |

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
