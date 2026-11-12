"""Shared helpers for the racing vehicles built in Blender (podracer.py, corolla.py, ...).

A vehicle is built from many parts (bmesh solids) which are bevelled, shaded by angle, baked
for ambient occlusion into vertex colour (with the road under them), then joined into a few
objects for the game:

  * "body"          everything rigid (one node, one draw per material)
  * "wheel_FL" ...  each wheel on its own node, centred on its axle (the game spins and steers
                    them; front wheels first by name)
  * "fan_L" ...     parts the game spins about their own forward axis (pod engines' fans)
  * empties         "exhaust_*" (boost flame anchors) and "rear_*" (drift sparks / dust)

Materials carry their colour, roughness and metalness in the .glb, so the look is set here;
the game only swaps a few by name (accent, glass, lamps and other glows; see
apps/game/src/render/blenderVehicles.ts).

Coordinates: x = the vehicle's right, y = forward, z = up, metres. The exporter turns that
into the game's convention (y up, facing -z).
"""

import math
import os

import bpy  # isort: skip (must come first: it provides bmesh and mathutils)
import bmesh
from mathutils import Matrix, Vector

V = Vector
TAU = math.tau


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


# ---------------------------------------------------------------- materials


def srgb(h):
    """0xRRGGBB (as the game writes colours) -> linear RGB, which glTF stores."""
    out = []
    for k in (16, 8, 0):
        c = ((h >> k) & 255) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def material(name, colour=0x808080, rough=0.5, metal=0.0, emit=None):
    """A Principled material; emit = (0xRRGGBB, strength) for lamps and glows."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*srgb(colour), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*srgb(emit[0]), 1)
        b.inputs["Emission Strength"].default_value = emit[1]
    m.diffuse_color = (*srgb(colour), 1)
    return m


# ---------------------------------------------------------------- solids


def lathe(bm, profile, around=32, matrix=None, cap0=False, cap1=False, wobble=None, squash=1.0):
    """Turn a profile about the local y axis: [(y, r), ...]. Returns the rings.

    wobble(theta, i) -> radius factor, for ribs and petals; squash scales z (height).
    Angle 0 points along +x, pi/2 along +z (up).
    """
    m = matrix or Matrix.Identity(4)
    rows = []
    for i, (y, r) in enumerate(profile):
        row = []
        for j in range(around):
            th = j / around * TAU
            k = wobble(th, i) if wobble else 1.0
            if r <= 1e-6:
                row = [bm.verts.new(m @ V((0, y, 0)))]
                break
            row.append(bm.verts.new(m @ V((r * k * math.cos(th), y, r * k * math.sin(th) * squash))))
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        for j in range(around):
            j2 = (j + 1) % around
            if len(a) == 1:
                bm.faces.new((a[0], b[j2], b[j]))
            elif len(b) == 1:
                bm.faces.new((a[j], a[j2], b[0]))
            else:
                bm.faces.new((a[j], a[j2], b[j2], b[j]))
    if cap0 and len(rows[0]) > 2:
        bm.faces.new(rows[0])
    if cap1 and len(rows[-1]) > 2:
        bm.faces.new(rows[-1])
    return rows


def loft(bm, sections, around=40):
    """A body lofted along y through superellipse sections.

    sections: dicts with y, w (half width), top, bottom, optional ex (exponent: 1 = ellipse,
    smaller = squarer), exb (exponent for the lower half), x (shift sideways).
    """
    rows = []
    for s in sections:
        mid = (s["top"] + s["bottom"]) / 2
        ex = s.get("ex", 0.9)
        exb = s.get("exb", ex)
        row = []
        for j in range(around):
            th = j / around * TAU
            c, sn = math.cos(th), math.sin(th)
            e = ex if sn >= 0 else exb
            x = s.get("x", 0.0) + s["w"] * math.copysign(abs(c) ** e, c)
            yu = abs(sn) ** e
            z = mid + (s["top"] - mid) * yu if sn >= 0 else mid - (mid - s["bottom"]) * yu
            row.append(bm.verts.new((x, s["y"], z)))
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        for j in range(around):
            j2 = (j + 1) % around
            bm.faces.new((a[j], b[j], b[j2], a[j2]))
    bm.faces.new(rows[0])
    bm.faces.new(list(reversed(rows[-1])))
    return rows


def plate(bm, outline, thick, matrix=None):
    """A flat plate: a 2D outline [(u, v), ...] in the local x/z plane, `thick` along y."""
    m = matrix or Matrix.Identity(4)
    a = [bm.verts.new(m @ V((u, -thick / 2, v))) for u, v in outline]
    b = [bm.verts.new(m @ V((u, thick / 2, v))) for u, v in outline]
    n = len(outline)
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(n):
        i2 = (i + 1) % n
        bm.faces.new((a[i], b[i], b[i2], a[i2]))


def box(bm, centre, size, rot=None):
    m = Matrix.Translation(V(centre)) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((*size, 1))
    return bmesh.ops.create_cube(bm, size=1, matrix=m)["verts"]


def cyl(bm, a, b, r1, r2=None, segs=16):
    """A capped cylinder (or cone frustum) from point a to point b."""
    a, b = V(a), V(b)
    d = b - a
    rot = V((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    m = Matrix.Translation((a + b) / 2) @ rot
    return bmesh.ops.create_cone(
        bm, cap_ends=True, segments=segs, radius1=r1, radius2=r1 if r2 is None else r2, depth=d.length, matrix=m
    )["verts"]


def ball(bm, centre, radii, segs=16, rot=None):
    m = Matrix.Translation(V(centre)) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((*radii, 1))
    return bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(6, segs // 2), radius=1, matrix=m)["verts"]


def torus(bm, centre, R, r, rx=1.0, ry=1.0, segs=32, around=8, rot=None, arc=TAU):
    """A ring of radius R (scaled rx, ry in its plane) and tube radius r, lying in x/y."""
    m = Matrix.Translation(V(centre)) @ (rot or Matrix.Identity(4))
    closed = arc >= TAU - 1e-6
    n = segs if closed else segs + 1
    rows = []
    for i in range(n):
        a = i / segs * arc
        c = V((R * rx * math.cos(a), R * ry * math.sin(a), 0))
        out = V((math.cos(a), math.sin(a), 0))
        rows.append([bm.verts.new(m @ (c + out * (r * math.cos(t)) + V((0, 0, r * math.sin(t))))) for t in (k / around * TAU for k in range(around))])
    for i in range(n if closed else n - 1):
        a, b = rows[i], rows[(i + 1) % n]
        for k in range(around):
            k2 = (k + 1) % around
            bm.faces.new((a[k], a[k2], b[k2], b[k]))
    if not closed:
        bm.faces.new(list(reversed(rows[0])))
        bm.faces.new(rows[-1])
    return rows


def sweep(bm, points, radius, around=8, segs=None, caps=True):
    """A round tube of constant radius through points (cables, rails, pipes)."""
    import kit

    n = segs or max(4, int(sum((V(b) - V(a)).length for a, b in zip(points, points[1:])) / 0.05))
    return kit.tube(bm, points, [{"t": 0, "w": radius, "h": radius}, {"t": 1, "w": radius, "h": radius}], segs=n, around=around, up=(0, 0, 1), caps=caps)


# ---------------------------------------------------------------- objects


PARTS = []  # every part made, for the bake and the join
PIVOTS = {}  # group -> the point its node turns about (a wheel's axle, a fan's hub)


def pivot(group, at):
    PIVOTS[group] = V(at)


def part(name, bm, mat, bevel=0.0, segments=2, smooth_angle=35, group="body", subdiv=0, weld=True):
    """Make an object from a bmesh: bevel its edges, shade it by angle, and remember it.

    group: which game node it joins ("body", "wheel_FL", "fan_L", ...).
    subdiv: extra cuts on long flat faces so the vertex-colour shading has somewhere to live.
    """
    if weld:
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if isinstance(mat, (list, tuple)):
        for m in mat:
            mesh.materials.append(m)
    elif mat:
        mesh.materials.append(mat)
    obj["group"] = group
    _only(obj)
    if bevel > 0:
        b = obj.modifiers.new("Bevel", "BEVEL")
        b.width = bevel
        b.segments = segments
        b.limit_method = "ANGLE"
        b.angle_limit = math.radians(smooth_angle)
        b.miter_outer = "MITER_ARC"
        bpy.ops.object.modifier_apply(modifier="Bevel")
    if subdiv:
        bm2 = bmesh.new()
        bm2.from_mesh(mesh)
        long = [e for e in bm2.edges if e.calc_length() > subdiv]
        for _ in range(4):
            if not long:
                break
            bmesh.ops.subdivide_edges(bm2, edges=long, cuts=1, use_grid_fill=True)
            long = [e for e in bm2.edges if e.calc_length() > subdiv]
        bm2.to_mesh(mesh)
        bm2.free()
    for p in mesh.polygons:
        p.use_smooth = True
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth_angle), keep_sharp_edges=True)
    PARTS.append(obj)
    return obj


def _only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def face_materials(obj, pick, keep=()):
    """Re-assign faces to the object's material slots: pick(centre, normal) -> slot or None.

    Faces already on a slot in `keep` are left alone."""
    mesh = obj.data
    for p in mesh.polygons:
        if p.material_index in keep:
            continue
        k = pick(obj.matrix_world @ p.center, p.normal)
        if k is not None:
            p.material_index = k


def marker(name, at):
    e = bpy.data.objects.new(name, None)
    e.location = V(at)
    bpy.context.scene.collection.objects.link(e)
    return e


# ---------------------------------------------------------------- occlusion


UNLIT = {"glass", "accent", "lamp", "tail", "amber", "glow", "binder", "lens", "reverse", "plate"}


def bake_ao(ground=0.0, samples=96, distance=0.6, floor=0.38, tint=None, pct=0.9):
    """Bake ambient occlusion (with the road under the vehicle) into a "Col" vertex colour.

    Values are scaled so the most open surfaces count as fully lit, then mapped to
    floor..1. tint(obj, co, normal) -> (r, g, b) multiplies in paint detail (grime, soot).
    """
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    if not scene.world:
        scene.world = bpy.data.worlds.new("w")
    scene.world.light_settings.distance = distance
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, ground))
    road = bpy.context.object
    vals = {}
    for o in PARTS:
        _split_materials(o)
    for o in PARTS:
        if not o.data.materials:
            o.data.materials.append(material("bake"))
        # Wheels turn, so they are shaded by themselves alone (no dark patch going round).
        solo = o["group"].startswith("wheel")
        for other in PARTS + [road]:
            other.hide_render = solo and other.get("group") != o["group"]
        ao = o.data.color_attributes.new("AO", "FLOAT_COLOR", "POINT")
        o.data.color_attributes.active_color = ao
        _only(o)
        bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
        vals[o.name] = [ao.data[i].color[0] for i in range(len(o.data.vertices))]
        o.data.color_attributes.remove(ao)
    for other in PARTS:
        other.hide_render = False
    lit = sorted(v for o in PARTS if not _unlit(o) for v in vals[o.name])
    top = lit[int(len(lit) * pct)] if lit else 1.0
    for o in PARTS:
        col = o.data.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        o.data.color_attributes.active_color = col
        normals = [v.normal for v in o.data.vertices]
        for i, v in enumerate(o.data.vertices):
            k = floor + (1 - floor) * min(1.0, vals[o.name][i] / top)
            r = g = b = k
            if tint:
                t = tint(o, o.matrix_world @ v.co, normals[i])
                r, g, b = r * t[0], g * t[1], b * t[2]
            col.data[i].color = (r, g, b, 1.0)
    bpy.data.objects.remove(road)
    return top


def _split_materials(o):
    """Give each material its own vertices where they meet, so a dark wheel well's shading
    doesn't bleed onto the paint beside it."""
    if len(o.data.materials) < 2:
        return
    bm = bmesh.new()
    bm.from_mesh(o.data)
    edges = [e for e in bm.edges if len(e.link_faces) == 2 and e.link_faces[0].material_index != e.link_faces[1].material_index]
    if edges:
        bmesh.ops.split_edges(bm, edges=edges)
        bm.to_mesh(o.data)
    bm.free()


def _unlit(o):
    return all(m.name in UNLIT for m in o.data.materials)


def join_groups():
    """Join the parts into one object per game node; returns {group: object}."""
    if os.environ.get("VEHICLE_TRIS"):  # where the triangles go, biggest parts first
        for o in sorted(PARTS, key=lambda o: -len(o.data.polygons))[:15]:
            print("TRIS", o.name, sum(len(p.vertices) - 2 for p in o.data.polygons))
    groups = {}
    for o in PARTS:
        groups.setdefault(o["group"], []).append(o)
    out = {}
    for name, objs in groups.items():
        # A node spins about its own origin: put it on the axle.
        pv = PIVOTS.get(name, V((0, 0, 0)))
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        obj.name = obj.data.name = name
        cols = obj.data.color_attributes
        if "Col" in cols:  # joining forgets which colour layer is the active (exported) one
            cols.active_color = cols["Col"]
            cols.render_color_index = cols.find("Col")
        # Origin on the pivot, so the node's position is the axle.
        obj.data.transform(Matrix.Translation(obj.location - pv))
        obj.location = pv
        out[name] = obj
    PARTS.clear()
    return out


def stats():
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type == "MESH")
    return tris


# ---------------------------------------------------------------- export and preview


def export(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        use_selection=False,
        export_cameras=False,
        export_lights=False,
        export_apply=True,
        export_extras=False,
    )
    compact(path)
    return os.path.getsize(path)


def compact(path):
    """Store vertex colours and normals in 8 bits instead of 32-bit floats (about half the
    file). Colours as normalised bytes are core glTF; byte normals need KHR_mesh_quantization,
    which three.js's loader reads."""
    import json
    import struct

    import numpy as np

    data = open(path, "rb").read()
    jlen = struct.unpack_from("<I", data, 12)[0]
    js = json.loads(data[20 : 20 + jlen])
    boff = 20 + jlen
    blen = struct.unpack_from("<I", data, boff)[0]
    binary = data[boff + 8 : boff + 8 + blen]
    views, accs = js["bufferViews"], js["accessors"]
    kind = {}
    for m in js["meshes"]:
        for p in m["primitives"]:
            for k in ("NORMAL", "COLOR_0"):
                if k in p["attributes"]:
                    kind[p["attributes"][k]] = k
    users = {}
    for i, a in enumerate(accs):
        users.setdefault(a.get("bufferView"), []).append(i)
    out = bytearray()
    new_views = []
    for vi, v in enumerate(views):
        raw = binary[v.get("byteOffset", 0) : v.get("byteOffset", 0) + v["byteLength"]]
        nv = {k: val for k, val in v.items() if k not in ("byteOffset", "byteLength")}
        ai = users.get(vi, [])
        if len(ai) == 1 and ai[0] in kind and accs[ai[0]]["componentType"] == 5126 and "byteStride" not in v:
            a = accs[ai[0]]
            n = {"VEC3": 3, "VEC4": 4}[a["type"]]
            f = np.frombuffer(raw, dtype="<f4", count=a["count"] * n, offset=a.get("byteOffset", 0)).reshape(-1, n)
            if kind[ai[0]] == "COLOR_0":
                q = np.full((a["count"], 4), 255, dtype=np.uint8)
                q[:, :n] = np.round(np.clip(f[:, :n], 0, 1) * 255)
                a.update(type="VEC4", componentType=5121, normalized=True)
            else:
                q = np.zeros((a["count"], 4), dtype=np.int8)
                q[:, :3] = np.round(np.clip(f, -1, 1) * 127)
                a.update(componentType=5120, normalized=True)
                nv["byteStride"] = 4
            a.pop("byteOffset", None)
            a.pop("min", None)
            a.pop("max", None)
            raw = q.tobytes()
        while len(out) % 4:
            out.append(0)
        nv["byteOffset"] = len(out)
        nv["byteLength"] = len(raw)
        out += raw
        new_views.append(nv)
    while len(out) % 4:
        out.append(0)
    js["bufferViews"] = new_views
    js["buffers"][0]["byteLength"] = len(out)
    for key in ("extensionsUsed", "extensionsRequired"):
        js[key] = sorted(set(js.get(key, [])) | {"KHR_mesh_quantization"})
    jb = json.dumps(js, separators=(",", ":")).encode()
    jb += b" " * (-len(jb) % 4)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(out)))
        fh.write(struct.pack("<II", len(jb), 0x4E4F534A) + jb)
        fh.write(struct.pack("<II", len(out), 0x004E4942) + bytes(out))


def preview(out_dir, name, views, size=(900, 520), target=(0, 0, 0.6), samples=48, ortho=None):
    """Render the vehicle (with its baked colour) from a few angles.

    views = [(tag, yaw°, pitch°, dist[, target])]; yaw 0 looks at the front, 90 the right side."""
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    for m in bpy.data.materials:
        if not m.use_nodes or "Principled BSDF" not in m.node_tree.nodes:
            continue
        nt = m.node_tree
        b = nt.nodes["Principled BSDF"]
        vc = nt.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Col"
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs[0].default_value = 1.0
        mix.inputs[6].default_value = b.inputs["Base Color"].default_value[:]
        nt.links.new(vc.outputs["Color"], mix.inputs[7])
        nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    road = bpy.context.object
    road.data.materials.append(material("preview_road", 0x7d8288, 0.9))
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.5
    sun.data.angle = math.radians(8)
    sun.rotation_euler = (math.radians(40), 0, math.radians(35))
    scene.collection.objects.link(sun)
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.55, 0.62, 0.72, 1)
    bg.inputs["Strength"].default_value = 0.9
    scene.cycles.samples = samples
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.view_settings.view_transform = "Standard"
    for tag, yaw, pitch, dist, *aim in views:
        t = V(aim[0] if aim else target)
        y, p = math.radians(yaw), math.radians(pitch)
        d = V((math.sin(y) * math.cos(p), math.cos(y) * math.cos(p), math.sin(p)))
        cam.location = t + d * dist
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = 50
        if ortho:
            cam.data.type = "ORTHO"
            cam.data.ortho_scale = ortho
        scene.render.filepath = os.path.join(out_dir, f"{name}-{tag}.png")
        bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------- body shells and things on them


def keys(table, t):
    """Smooth, overshoot-free interpolation through (t, value) keys, any order (monotone
    cubic: the curve has no flat steps at the keys and never bulges past them)."""
    ks = sorted(table)
    if t <= ks[0][0]:
        return ks[0][1]
    if t >= ks[-1][0]:
        return ks[-1][1]
    xs = [k[0] for k in ks]
    ys = [k[1] for k in ks]
    n = len(ks)
    d = [(ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) for i in range(n - 1)]
    m = [d[0]] + [0.0 if d[i - 1] * d[i] <= 0 else 2 / (1 / d[i - 1] + 1 / d[i]) for i in range(1, n - 1)] + [d[-1]]
    i = 0
    while xs[i + 1] < t:
        i += 1
    h = xs[i + 1] - xs[i]
    u = (t - xs[i]) / h
    h00, h10, h01, h11 = 2 * u**3 - 3 * u**2 + 1, u**3 - 2 * u**2 + u, -2 * u**3 + 3 * u**2, u**3 - u**2
    return h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1]


def shell(bm, ys, ring):
    """A closed body through rings: ring(y) -> [(x, z), ...] for the right half, bottom centre
    first, top centre last (mirrored to make the left). Returns the rows."""
    rows = []
    for y in ys:
        half = ring(y)
        full = half + [(-x, z) for x, z in reversed(half[1:-1])]
        rows.append([bm.verts.new((x, y, z)) for x, z in full])
    for a, b in zip(rows, rows[1:]):
        n = len(a)
        for j in range(n):
            j2 = (j + 1) % n
            bm.faces.new((a[j], a[j2], b[j2], b[j]))
    caps = [bm.faces.new(rows[0]), bm.faces.new(list(reversed(rows[-1])))]
    # Fan the end caps from their centres (a big n-gon triangulates into long slivers).
    bmesh.ops.poke(bm, faces=caps)
    return rows


def arc(cx, cz, r, a0, a1, n):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cz + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


def seg(a, b, n, bend=None):
    """n+1 points from a to b; bend(t) -> (dx, dz) to curve it."""
    out = []
    for i in range(n + 1):
        t = i / n
        x, z = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        if bend:
            dx, dz = bend(t)
            x, z = x + dx, z + dz
        out.append((x, z))
    return out


def chain(*parts):
    """Join point runs, dropping each run's first point (shared with the previous run's last)."""
    out = list(parts[0])
    for p in parts[1:]:
        out += list(p[1:])
    return out


def car_ring(w, zb, zbot, zt, xg, rr, rs, rbot, crown, tuck=0.03, bulge=0.006):
    """A car body's cross-section (right half, bottom centre to top centre, for shell()).

    Up from the floor (zbot) round the lower corner (rbot) and the flank (half width w, tucked
    in at the foot, a little fuller in the middle) to the shoulder (radius rs) at the waist
    zb; then the greenhouse leans in to the roof edge (half width xg, corner radius rr) and
    across the crowned top at zt. Over the hood and trunk, zt sits just above zb and xg just
    inside the shoulder, so the same points make a flat deck with a rounded edge.
    """
    a = seg((0, zbot), (w - rbot, zbot), 5)
    b = arc(w - rbot, zbot + rbot, rbot, -math.pi / 2, 0, 4)
    c = seg((w, zbot + rbot), (w, zb - rs), 9, lambda t: (-tuck * (1 - t) ** 2 + bulge * math.sin(math.pi * t), 0))
    d = arc(w - rs, zb - rs, rs, 0, math.pi / 2, 4)
    e = seg((w - rs, zb), (xg, zt - rr), 9)
    f = arc(xg - rr, zt - rr, rr, 0, math.pi / 2, 5)
    g = [(x, zt + crown * (1 - (x / (xg - rr)) ** 2)) for x, _ in seg((xg - rr, zt), (0, zt), 9)]
    return chain(a, b, c, d, e, f, g)


def cut(obj, cutter, mat=None):
    """Boolean difference; the faces it makes take `mat` (e.g. a dark wheel well)."""
    if mat is not None:
        cutter.data.materials.clear()
        cutter.data.materials.append(mat)
    m = obj.modifiers.new("Cut", "BOOLEAN")
    m.operation = "DIFFERENCE"
    m.object = cutter
    m.solver = "EXACT"
    m.material_mode = "TRANSFER"
    _only(obj)
    bpy.ops.object.modifier_apply(modifier="Cut")


def solid_bm_object(name, bm):
    """A throwaway object (cutters)."""
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


class Surface:
    """Ray casts against a body, to lay things on it."""

    def __init__(self, obj):
        from mathutils.bvhtree import BVHTree

        bpy.context.view_layer.update()
        self.tree = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())

    def hit(self, origin, direction):
        loc, nor, _, _ = self.tree.ray_cast(V(origin), V(direction).normalized())
        if loc is None:
            return None, None
        if nor.dot(V(direction)) > 0:
            nor = -nor
        return loc, nor


def chaikin(poly, n=2):
    for _ in range(n):
        out = []
        for i, a in enumerate(poly):
            b = poly[(i + 1) % len(poly)]
            out += [a.lerp(b, 0.25), a.lerp(b, 0.75)]
        poly = out
    return poly


def outline(corners, per_edge=4, round_=1):
    """A closed outline through 2D corners (Vector), corners rounded off."""
    pts = []
    for i, a in enumerate(corners):
        b = corners[(i + 1) % len(corners)]
        pts += [a.lerp(b, k / per_edge) for k in range(per_edge)]
    return chaikin(pts, round_)


def grow(poly, d):
    """Offset a convex 2D outline outward by d."""
    n = len(poly)
    c = sum(poly, V((0, 0))) / n
    out = []
    for i, p in enumerate(poly):
        a, b = poly[i - 1], poly[(i + 1) % n]
        t = (b - a).normalized()
        nrm = V((t.y, -t.x))
        if nrm.dot(p - c) < 0:
            nrm = -nrm
        out.append(p + nrm * d)
    return out


def panel(surf, poly, to_origin, direction, lift, thick=0.0, rings=None, bend_normal=True):
    """A sheet laid on the body inside a 2D outline: each point (u, v) of the outline is cast
    from to_origin(u, v) along `direction` and lifted off the surface by `lift`.
    thick > 0 gives it sides down towards the surface. Returns a bmesh."""
    bm = bmesh.new()
    n = len(poly)
    c = sum(poly, V((0, 0))) / n
    if rings is None:  # enough rings to follow the body's curve, no more
        size = max((p - c).length for p in poly) * 2
        rings = 1 if size < 0.35 else 2 if size < 0.9 else 3

    def place(uv):
        loc, nor = surf.hit(to_origin(uv.x, uv.y), direction)
        if loc is None:
            return None
        return loc + (nor if bend_normal else -V(direction).normalized()) * lift

    centre = place(c)
    rows = []
    for k in range(1, rings + 1):
        r = k / rings
        rows.append([place(c + (p - c) * r) for p in poly])
    if centre is None or any(p is None for row in rows for p in row):
        raise RuntimeError("panel: a ray missed the body")
    cv = bm.verts.new(centre)
    vrows = [[bm.verts.new(p) for p in row] for row in rows]
    toward = -V(direction).normalized()
    for i in range(n):
        f = bm.faces.new((cv, vrows[0][i], vrows[0][(i + 1) % n]))
    for a, b in zip(vrows, vrows[1:]):
        for i in range(n):
            i2 = (i + 1) % n
            bm.faces.new((a[i], b[i], b[i2], a[i2]))
    bm.normal_update()
    if sum(f.normal.dot(toward) for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    if thick > 0:
        edge = vrows[-1]
        low = [bm.verts.new(v.co - toward * thick) for v in edge]
        for i in range(n):
            i2 = (i + 1) % n
            bm.faces.new((edge[i], low[i], low[i2], edge[i2]))
    bm.normal_update()
    return bm


def strip(surf, rays, lift, half_w, half_h, around=8, ex=0.6):
    """A rounded bar laid along the body: rays [(origin, direction), ...] find the path; the
    bar's centre sits half_w off the surface, less `lift` sunk in."""
    import kit

    pts = []
    for o, d in rays:
        loc, nor = surf.hit(o, d)
        if loc is None:
            continue
        pts.append(loc + nor * (half_w - lift))
    bm = bmesh.new()
    if len(pts) < 2:
        return bm
    kit.tube(bm, pts, [{"t": 0, "w": half_w, "h": half_h, "ex": ex}, {"t": 1, "w": half_w, "h": half_h, "ex": ex}], segs=max(4, len(pts) * 2), around=around, up=(0, 0, 1))
    return bm


def text(name, string, size, matrix, mat, depth=0.002):
    """Raised lettering (number plates), as a mesh in the x/z plane of `matrix`, facing -y."""
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = string
    cu.size = size
    cu.extrude = depth
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.resolution_u = 3
    obj = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(obj)
    obj.matrix_world = matrix @ Matrix.Rotation(math.pi / 2, 4, "X")
    _only(obj)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.view_layer.objects.active
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    obj["group"] = "body"
    PARTS.append(obj)
    return obj


# ---------------------------------------------------------------- wheels


def wheel(group, centre, side, radius, width, rim_r, mats, cap=None, blocks=0):
    """A wheel on its own node (group), axle along x, `side` -1 left / +1 right.

    Tyre: rounded shoulders, sidewall bulge, tread grooves. Rim: a dished steel wheel; then
    cap(bm, matrix) adds the face (hubcap, spokes...) in the wheel's frame, where +y points
    out of the car and the face sits at y = 0 (the tyre's outer wall at +width/2).
    mats: {"rubber", "rim"}. blocks > 0: chunky off-road tread, that many blocks round,
    staggered either side of the centre line (instead of a road tyre's grooves).
    """
    pivot(group, centre)
    m = Matrix.Translation(V(centre)) @ Matrix.Rotation(-side * math.pi / 2, 4, "Z")
    w, r = width / 2, radius
    # Tyre: outer wall, tread, inner wall, rolled into the rim.
    prof = [
        (w * 0.82, rim_r * 1.02),
        (w * 0.98, rim_r + (r - rim_r) * 0.35),
        (w, rim_r + (r - rim_r) * 0.62),
        (w * 0.93, r * 0.975),
        (w * 0.72, r),
        (-w * 0.72, r),
        (-w * 0.93, r * 0.975),
        (-w, rim_r + (r - rim_r) * 0.62),
        (-w * 0.98, rim_r + (r - rim_r) * 0.35),
        (-w * 0.82, rim_r * 1.02),
    ]
    # Rows: the profile's corners, with the tread (between the shoulders) cut finer.
    dense = []
    for i, ((y0, r0), (y1, r1)) in enumerate(zip(prof, prof[1:])):
        n = 6 if i == 4 else 1
        for k in range(n):
            dense.append((y0 + (y1 - y0) * k / n, r0 + (r1 - r0) * k / n))
    dense.append(prof[-1])
    # Tread grooves round the crown.
    tread = [(y, rr - (0.008 if abs(abs(y) - w * 0.24) < w * 0.01 else 0.0)) for y, rr in dense]
    bm = bmesh.new()
    if blocks:
        crown = [(1 if y > 0 else -1) if abs(y) < w * 0.73 else 0 for y, _ in dense]

        def knobs(th, i):
            if not crown[i]:
                return 1.0
            k = int(th / TAU * blocks + (0.5 if crown[i] > 0 else 0.0))
            return 1.0 if k % 2 else 1.0 - 0.045 * radius / 0.4

        lathe(bm, dense, blocks * 4, m, wobble=knobs)
    else:
        lathe(bm, tread, 36, m)
    part(f"{group}_tyre", bm, mats["rubber"], smooth_angle=40, group=group)
    # Rim: the barrel and a dished face, set in from the tyre's wall.
    bm = bmesh.new()
    lathe(bm, [(-w * 0.8, rim_r * 1.0), (w * 0.82, rim_r * 1.0), (w * 0.86, rim_r * 0.94), (w * 0.6, rim_r * 0.9), (w * 0.4, rim_r * 0.82), (w * 0.35, 0.0)], 40, m)
    part(f"{group}_rim", bm, mats["rim"], smooth_angle=40, group=group)
    if cap:
        cap(group, m @ Matrix.Translation((0, w * 0.4, 0)))
