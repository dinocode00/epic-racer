"""Soft shadows (ambient occlusion) for the farm's buildings, baked by Blender.

    node tools/blender/export.cjs EXPORT.json buildings
    python tools/blender/buildings.py -- EXPORT.json apps/game/src/farm/buildingsAo

The game builds the buildings from code (apps/game/src/farm/buildings.ts) and keeps doing so.
Blender adds what code can't cheaply: how much of the sky each point can see. Corners, the
undersides of eaves and porch roofs, window and door reveals, the foot of every wall and the
gaps between boards come out darker, as they do in real light.

Every exported mesh keeps its vertices; Blender only gives each vertex a second set of texture
coordinates (into one shared atlas) and bakes the occlusion into that atlas. Writes
`<out>.png` (the atlas, grey) and `<out>.json` (per mesh: its build-order index, vertex count
and the coordinates). Coordinates are the game's (y up); the ground is an occluder only.
"""

import base64
import json
import math
import os
import struct
import sys

import bpy  # isort: skip (must come first: it provides bmesh and mathutils)
import bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
SRC, OUT = argv[0], argv[1]
SIZE = int(argv[argv.index("--size") + 1]) if "--size" in argv else 2048
SAMPLES = int(argv[argv.index("--samples") + 1]) if "--samples" in argv else 96
WHAT = argv[argv.index("--what") + 1] if "--what" in argv else "buildings"
data = json.load(open(SRC))[WHAT]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# Game (x, y up, z) -> Blender (x, -z, y up), so Cycles' world "up" is the sky.
def b(p):
    return Vector((p[0], -p[2], p[1]))


# ---------------------------------------------------------------- one object, all buildings

bm = bmesh.new()
uvl = bm.loops.layers.uv.new("ao")
owner = []  # per bmesh vertex: (mesh entry, vertex index in that mesh)
faces = []  # per (mesh entry, triangle): its face number in the joined mesh, or None
for mi, m in enumerate(data["meshes"]):
    raw = m["pos"]
    base = len(bm.verts)
    vs = [bm.verts.new(b(raw[i : i + 3])) for i in range(0, len(raw), 3)]
    owner += [(mi, k) for k in range(len(vs))]
    tri = m["tri"]
    row = []
    for k in range(0, len(tri), 3):
        f = (vs[tri[k]], vs[tri[k + 1]], vs[tri[k + 2]])
        face = None
        if len(set(f)) == 3:
            try:
                face = bm.faces.new(f)
            except ValueError:  # the same triangle twice (double-sided parts)
                pass
        row.append(face)
    faces.append(row)
bm.faces.index_update()
faces = [[f.index if f else None for f in row] for row in faces]
mesh = bpy.data.meshes.new("Buildings")
bm.to_mesh(mesh)
bm.free()
obj = bpy.data.objects.new("Buildings", mesh)
scene.collection.objects.link(obj)

# The real ground, from the game's own height function (an occluder, not baked): it darkens
# the foot of every wall the way the lawn and gravel would.
G = data["ground"]
gbm = bmesh.new()
grid = [[gbm.verts.new(b((G["x0"] + i, G["heights"][j * G["nx"] + i], G["z0"] + j))) for i in range(G["nx"])] for j in range(G["nz"])]
for j in range(G["nz"] - 1):
    for i in range(G["nx"] - 1):
        gbm.faces.new((grid[j][i], grid[j + 1][i], grid[j + 1][i + 1], grid[j][i + 1]))
bmesh.ops.recalc_face_normals(gbm, faces=gbm.faces[:])
gmesh = bpy.data.meshes.new("Ground")
gbm.to_mesh(gmesh)
gbm.free()
scene.collection.objects.link(bpy.data.objects.new("Ground", gmesh))

# ---------------------------------------------------------------- atlas coordinates

bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
# One island per connected piece, with no extra cuts: the code's meshes already split their
# vertices along every crease, so each game vertex gets exactly one place in the atlas.
bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.002)
bpy.ops.object.mode_set(mode="OBJECT")
# Closed pieces with no seam at all (a car's body shell, a capped loft) can't be flattened in
# one piece: the unwrap collapses them. Let Blender cut those along their creases instead (the
# few vertices that end up in two places are handled per corner below).
cbm = bmesh.new()
cbm.from_mesh(mesh)
cbm.faces.ensure_lookup_table()
seen, closed = set(), set()
for f in cbm.faces:
    if f.index in seen:
        continue
    comp, stack, boundary = [], [f], False
    seen.add(f.index)
    while stack:
        g = stack.pop()
        comp.append(g.index)
        for e in g.edges:
            if len(e.link_faces) < 2:
                boundary = True
            for h in e.link_faces:
                if h.index not in seen:
                    seen.add(h.index)
                    stack.append(h)
    if not boundary:
        closed.update(comp)
cbm.free()
for poly in mesh.polygons:
    poly.select = poly.index in closed
bpy.ops.object.mode_set(mode="EDIT")
if closed:
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002, area_weight=1.0, scale_to_bounds=False)
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.average_islands_scale()
bpy.ops.uv.pack_islands(margin=0.002, rotate=True)
bpy.ops.object.mode_set(mode="OBJECT")
print(f"closed pieces cut by smart project: {len(closed)} faces")

# ---------------------------------------------------------------- bake

img = bpy.data.images.new("ao", SIZE, SIZE, alpha=False)
img.generated_color = (1, 1, 1, 1)
mat = bpy.data.materials.new("bake")
node = mat.node_tree.nodes.new("ShaderNodeTexImage")
node.image = img
mat.node_tree.nodes.active = node
mesh.materials.append(mat)
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = SAMPLES
world = bpy.data.worlds.new("w")
scene.world = world
world.light_settings.distance = float(argv[argv.index("--distance") + 1]) if "--distance" in argv else 2.2  # metres: how far an occluder still darkens a point
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
scene.render.bake.margin = 4
bpy.ops.object.bake(type="AO", margin=4)

# ---------------------------------------------------------------- write

if "--normalize" in argv:
    # Models of many overlapping parts (vehicles) bake dark overall: scale so the most open
    # surfaces (the brightest tenth of the baked texels) count as fully lit.
    import numpy as np

    px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
    v = px[:, 0]
    baked = v[v < 0.999]
    top = float(np.percentile(baked, 90)) if baked.size else 1.0
    px[:, :3] = np.clip(px[:, :3] / max(top, 1e-3), 0, 1)
    img.pixels[:] = px.ravel()
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
img.filepath_raw = OUT + ".png"
img.file_format = "PNG"
scene.view_settings.view_transform = "Standard"
img.save()

layer = mesh.uv_layers["ao"].data
uv = [None] * len(mesh.vertices)
clash = set()
for poly in mesh.polygons:
    for li in poly.loop_indices:
        vi = mesh.loops[li].vertex_index
        u = tuple(layer[li].uv)
        if uv[vi] is None:
            uv[vi] = u
        elif abs(uv[vi][0] - u[0]) + abs(uv[vi][1] - u[1]) > 1e-4:
            clash.add(owner[vi][0])
q16 = lambda u, v: struct.pack("<HH", round(min(1, max(0, u)) * 65535), round(min(1, max(0, v)) * 65535))  # noqa: E731
per = {}
for vi, (mi, k) in enumerate(owner):
    per.setdefault(mi, []).append(uv[vi] or (0.0, 0.0))
meshes = []
for mi, m in enumerate(data["meshes"]):
    if mi in clash:
        # This piece is cut in two somewhere: one coordinate per triangle corner instead (the
        # game splits its vertices to match).
        tri, out, start = m["tri"], [], per[mi]
        for t, fi in enumerate(faces[mi]):
            if fi is None:
                out += [start[tri[t * 3 + j]] for j in range(3)]
            else:
                poly = mesh.polygons[fi]
                out += [tuple(layer[li].uv) for li in poly.loop_indices]
        meshes.append({"i": m["i"], "n": len(start), "corners": True, "uv": base64.b64encode(b"".join(q16(*c) for c in out)).decode()})
    else:
        pts = per.get(mi, [])
        meshes.append({"i": m["i"], "n": len(pts), "uv": base64.b64encode(b"".join(q16(*c) for c in pts)).decode()})
json.dump({"size": SIZE, "meshes": meshes}, open(OUT + ".json", "w"), separators=(",", ":"))
print(f"RESULT meshes={len(meshes)} verts={len(mesh.vertices)} split per corner={len(clash)} -> {OUT}.png/.json")
