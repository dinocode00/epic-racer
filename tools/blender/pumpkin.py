"""The farm's pumpkins, modelled and painted in Blender.

    python tools/blender/pumpkin.py -- apps/game/src/render/models/pumpkins.glb [--preview DIR]

One body per style (field, cinderella, tall, warty, giant) of unit radius, standing upright with
its flatness built in (the game's instancing scales and places them), plus one stem. Painted
in vertex colour as a multiplier on each pumpkin's own colour: dark creases between rounded
lobes, brighter lobe tops, faint streaks along the ribs, a greenish-yellow blush round the stem,
a dark blossom scar underneath and the pale patch where it sat on the ground, all with Blender's
baked occlusion (deepest in the creases and the stem well). The stem is ridged, flared at the
base, curved, green below and woody tan at the cut top.

Coordinates: Blender z-up here; the exporter writes the game's y-up.
"""

import math
import os
import random
import sys

import bpy  # isort: skip (must come first: it provides bmesh and mathutils)
import bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[0] if argv else "pumpkins.glb"
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
TAU = math.tau

# Style: flatness (height / width), lobes, crease depth, warts, stem-well depth.
STYLES = {
    "field": (0.8, 10, 0.08, 0.0, 0.16),
    "cinderella": (0.55, 12, 0.12, 0.0, 0.2),
    "tall": (1.05, 9, 0.07, 0.0, 0.12),
    "warty": (0.78, 10, 0.07, 0.1, 0.15),
    "giant": (0.72, 14, 0.11, 0.0, 0.18),
}
AROUND, RINGS = 40, 20


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def body(name, flat, lobes, depth, warts, well, seed):
    rnd = random.Random(seed)
    bm = bmesh.new()
    rows = []
    lobes_at = []  # per vertex, in creation order (= index)
    for j in range(RINGS + 1):
        v = j / RINGS  # 0 at the top (stem), 1 at the bottom (blossom end)
        th = v * math.pi
        rows.append([])
        for i in range(AROUND if 0 < j < RINGS else 1):
            a = i / AROUND * TAU
            r = math.sin(th)
            z = math.cos(th)
            # Rounded lobes meeting in creases: the creases are narrow, the lobes full.
            lobe = abs(math.cos(a * lobes / 2)) ** 0.45
            fade = math.sin(th) ** 0.7  # creases fade out toward the poles
            k = 1 - depth * (1 - lobe) * fade * 1.6 + depth * 0.25
            # Pinched in at both ends; a well sunk round the stem and a dimple underneath.
            k *= 1 - 0.18 * abs(z) ** 6
            if warts:
                k += warts * max(0.0, math.sin(a * 23 + seed) * math.sin(z * 19) * math.sin(a * 7 + z * 13)) ** 2 * 2.2 * math.sin(th) ** 3
            zz = z * flat
            if z > 0.55:
                zz -= well * flat * smooth((z - 0.55) / 0.45) ** 1.5
            if z < -0.7:
                zz += 0.06 * flat * smooth((-z - 0.7) / 0.3)
            p = Vector((r * k * math.cos(a), r * k * math.sin(a), zz))
            rows[-1].append(bm.verts.new(p))
            lobes_at.append(lobe)
    for j in range(RINGS):
        a, b = rows[j], rows[j + 1]
        for i in range(AROUND):
            i2 = (i + 1) % AROUND
            if len(a) == 1:
                bm.faces.new((a[0], b[i2], b[i]))
            elif len(b) == 1:
                bm.faces.new((a[i], a[i2], b[0]))
            else:
                bm.faces.new((a[i], a[i2], b[i2], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    # The paint (before occlusion): a multiplier on the pumpkin's own colour.
    col = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    for v in mesh.vertices:
        p = v.co
        lobe = lobes_at[v.index]
        u = p.z / flat  # +1 top .. -1 bottom
        a = math.atan2(p.y, p.x)
        tone = 0.6 + 0.4 * lobe  # creases darker, lobe tops brighter
        tone *= 1 + 0.06 * math.sin(a * lobes * 3 + math.sin(a * 5) * 2 + u * 3)  # rib streaks
        tone *= 1 + (rnd.random() - 0.5) * 0.05
        c = [tone * 0.88, tone * 0.88, tone * 0.88]
        top = smooth((u - 0.45) / 0.45)  # greenish-yellow blush round the stem
        c = [c[0] * (1 - 0.25 * top), c[1] * (1 + 0.12 * top), c[2] * (1 - 0.1 * top)]
        ground = smooth((-u - 0.55) / 0.3) * smooth((math.cos(a - 0.7) + 0.2) / 1.2)  # where it sat
        c = [c[0] + (1.0 - c[0]) * 0.55 * ground, c[1] + (0.95 - c[1]) * 0.55 * ground, c[2] + (0.72 - c[2]) * 0.55 * ground]
        scar = smooth((-u - 0.93) / 0.07)  # blossom scar
        c = [x * (1 - 0.55 * scar) for x in c]
        col.data[v.index].color = (*[min(1.0, x) for x in c], 1.0)
    return obj


def stem(seed):
    """Unit stem: height 1 (z -0.5 .. 0.5), flared base of radius 1, ridged, curving over."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    N, H = 15, 12
    rows = []
    for j in range(H + 1):
        t = j / H
        r = 0.55 + 0.45 * (1 - smooth(t * 3)) + 0.05 * (1 - t)
        bend = 0.35 * t * t
        rows.append([])
        for i in range(N):
            a = i / N * TAU
            ridge = 1 + 0.16 * math.cos(a * 5)
            x = r * ridge * math.cos(a) + bend
            y = r * ridge * math.sin(a)
            rows[-1].append(bm.verts.new((x, y, t - 0.5)))
    for j in range(H):
        for i in range(N):
            i2 = (i + 1) % N
            bm.faces.new((rows[j][i], rows[j][i2], rows[j + 1][i2], rows[j + 1][i]))
    bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new("stem")
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new("stem", mesh)
    scene.collection.objects.link(obj)
    col = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    for v in mesh.vertices:
        t = v.co.z + 0.5
        g = (0.36, 0.42, 0.2)
        tan = (0.58, 0.5, 0.34)
        k = smooth((t - 0.35) / 0.6)
        n = 1 + (rnd.random() - 0.5) * 0.12
        cut = smooth((t - 0.96) / 0.04)
        c = [(g[i] + (tan[i] - g[i]) * k) * n * (1 + 0.25 * cut) for i in range(3)]
        col.data[v.index].color = (*c, 1.0)
    return obj


objs = [body(n, *s, seed=i * 7 + 3) for i, (n, s) in enumerate(STYLES.items())]
st = stem(5)

# Occlusion into the paint: each body baked with a stem in its well and the ground under it.
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 96
scene.world = bpy.data.worlds.new("w")
scene.world.light_settings.distance = 0.35
for o in objs:
    flat = STYLES[o.name][0]
    for other in objs + [st]:
        other.hide_render = other is not o
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, -flat * 0.88))
    floor = bpy.context.object
    probe = st.copy()
    probe.data = st.data.copy()
    scene.collection.objects.link(probe)
    probe.scale = (0.08, 0.08, 0.28)
    probe.location = (0, 0, flat * (1 - STYLES[o.name][4]) + 0.06)
    probe.hide_render = False
    paint = [tuple(c.color) for c in o.data.color_attributes["Col"].data]
    ao = o.data.color_attributes.new("AO", "FLOAT_COLOR", "POINT")
    o.data.color_attributes.active_color = ao
    if not o.data.materials:
        o.data.materials.append(bpy.data.materials.new("bake"))
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    vals = [ao.data[i].color[0] for i in range(len(o.data.vertices))]
    top = sorted(vals)[int(len(vals) * 0.92)] or 1.0
    colour = o.data.color_attributes["Col"]
    for i, c in enumerate(paint):
        k = 0.45 + 0.55 * min(1.0, vals[i] / top)
        colour.data[i].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)
    o.data.color_attributes.remove(ao)
    o.data.color_attributes.active_color = o.data.color_attributes["Col"]
    bpy.data.objects.remove(floor)
    bpy.data.objects.remove(probe)
for o in objs + [st]:
    o.hide_render = False

# One shared material name; the game supplies its own.
skin = bpy.data.materials.new("pumpkin")
for o in objs:
    o.data.materials.clear()
    o.data.materials.append(skin)
st.data.materials.clear()
st.data.materials.append(bpy.data.materials.new("stem"))

if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    for i, o in enumerate(objs):
        o.location = ((i - 2) * 2.4, 0, STYLES[o.name][0] * 0.88)
        s = st.copy()
        scene.collection.objects.link(s)
        s.scale = (0.08, 0.08, 0.26)
        s.location = (o.location.x, 0, o.location.z + STYLES[o.name][0] * (1 - STYLES[o.name][4]) + 0.1)
    mat = bpy.data.materials.new("vc")
    mat.use_nodes = True
    vc = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    mix = mat.node_tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    mix.inputs[6].default_value = (0.9, 0.42, 0.1, 1)
    mat.node_tree.links.new(vc.outputs["Color"], mix.inputs[7])
    mat.node_tree.links.new(mix.outputs[2], mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.5
    for o in objs:
        o.data.materials[0] = mat
    smat = bpy.data.materials.new("svc")
    smat.use_nodes = True
    vc2 = smat.node_tree.nodes.new("ShaderNodeVertexColor")
    vc2.layer_name = "Col"
    smat.node_tree.links.new(vc2.outputs["Color"], smat.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    for o in scene.objects:
        if o.name.startswith("stem"):
            o.data.materials[0] = smat
    bpy.ops.mesh.primitive_plane_add(size=40)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = (0, -9, 4.2)
    cam.rotation_euler = (math.radians(66), 0, 0)
    cam.data.lens = 40
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 4
    sun.rotation_euler = (math.radians(45), 0, math.radians(30))
    scene.collection.objects.link(sun)
    scene.world.color = (0.6, 0.65, 0.7)
    scene.cycles.samples = 24
    scene.render.resolution_x, scene.render.resolution_y = 900, 380
    scene.render.filepath = os.path.join(PREVIEW, "pumpkins.png")
    bpy.ops.render.render(write_still=True)
    raise SystemExit(0)

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_yup=True,
    export_vertex_color="ACTIVE",
    export_all_vertex_colors=False,
    use_selection=False,
    export_cameras=False,
    export_lights=False,
    export_apply=True,
)
print(f"RESULT styles={len(objs)} tris={sum(len(o.data.polygons) for o in objs) * 2} size={os.path.getsize(OUT) // 1024}KB")
