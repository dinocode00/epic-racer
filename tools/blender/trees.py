"""Soft shading inside the farm's tree crowns, baked by Blender per vertex.

    node tools/blender/export.cjs EXPORT.json trees
    python tools/blender/trees.py -- EXPORT.json apps/game/src/farm/treesAo.json

Each tree kind (Christmas trees, spruces, the giant Scotch pine, orchard and woodland trees,
arborvitae) is baked on its own with a ground plane under it: ambient occlusion into a vertex
colour, so leaves deep in the crown and the trunk under it come out darker and the outer shell
of the canopy stays bright. The game multiplies that into the kind's colours.
"""

import base64
import json
import os
import sys

import bpy  # isort: skip (must come first: it provides bmesh and mathutils)
import bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
SRC, OUT = argv[0], argv[1]
SAMPLES = int(argv[argv.index("--samples") + 1]) if "--samples" in argv else 64
kinds = json.load(open(SRC))["trees"]["kinds"]


def b(p):
    return Vector((p[0], -p[2], p[1]))  # game y-up -> Blender z-up


out = []
for ki, kind in enumerate(kinds):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    bm = bmesh.new()
    counts = {}
    for part in ("solid", "leaves"):
        g = kind.get(part)
        if not g:
            continue
        raw = g["pos"]
        vs = [bm.verts.new(b(raw[i : i + 3])) for i in range(0, len(raw), 3)]
        counts[part] = (len(bm.verts) - len(vs), len(vs))
        tri = g["tri"]
        for k in range(0, len(tri), 3):
            f = (vs[tri[k]], vs[tri[k + 1]], vs[tri[k + 2]])
            if len(set(f)) == 3:
                try:
                    bm.faces.new(f)
                except ValueError:
                    pass
    mesh = bpy.data.meshes.new("Tree")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("Tree", mesh)
    scene.collection.objects.link(obj)
    height = max(v.co.z for v in mesh.vertices)
    bpy.ops.mesh.primitive_plane_add(size=max(40, height * 4), location=(0, 0, -0.01))
    attr = mesh.color_attributes.new("AO", "FLOAT_COLOR", "POINT")
    mesh.color_attributes.active_color = attr
    mat = bpy.data.materials.new("bake")
    mesh.materials.append(mat)
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = SAMPLES
    scene.world = bpy.data.worlds.new("w")
    scene.world.light_settings.distance = max(0.8, height * 0.18)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    raw_ao = [attr.data[i].color[0] for i in range(len(mesh.vertices))]
    # Leaf cards bake as solid sheets, so the raw values run dark; scale each kind so its
    # sunniest outer leaves (the brightest tenth) count as fully lit.
    top = sorted(raw_ao)[int(len(raw_ao) * 0.9)] or 1.0
    ao = [max(0, min(255, round(min(1.0, v / top) * 255))) for v in raw_ao]
    entry = {}
    for part, (start, n) in counts.items():
        entry[part] = {"n": n, "ao": base64.b64encode(bytes(ao[start : start + n])).decode()}
    out.append(entry)
    print(f"KIND {ki}: height {height:.1f} m, {len(mesh.vertices)} vertices, mean AO {sum(ao) / len(ao) / 255:.2f}")

os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
json.dump({"kinds": out}, open(OUT, "w"), separators=(",", ":"))
print(f"RESULT kinds={len(out)} -> {OUT} ({os.path.getsize(OUT) // 1024} KB)")
