"""Shared helpers for building Epic Racer models in Blender from Python (headless).

Coordinates are Blender's: x = the model's right, y = forward, z = up, in metres. The glTF
exporter turns that into the game's convention (y up, facing -z).
"""

import math

import bpy  # isort: skip (must come first: it provides bmesh and mathutils)
import bmesh
from mathutils import Matrix, Quaternion, Vector

V = Vector
TAU = math.tau


# ---------------------------------------------------------------- curves


def spline(points, n):
    """Centripetal Catmull-Rom through `points`, resampled to n+1 evenly spaced positions.

    Returns (positions, tangents).
    """
    pts = [V(p) for p in points]
    if len(pts) == 2:
        pos = [pts[0].lerp(pts[1], i / n) for i in range(n + 1)]
        tan = [(pts[1] - pts[0]).normalized()] * (n + 1)
        return pos, tan
    ext = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    dense = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        t0 = 0.0
        t1 = t0 + max(1e-6, (p1 - p0).length) ** 0.5
        t2 = t1 + max(1e-6, (p2 - p1).length) ** 0.5
        t3 = t2 + max(1e-6, (p3 - p2).length) ** 0.5
        steps = 24
        for k in range(steps + (1 if i == len(ext) - 3 else 0)):
            t = t1 + (t2 - t1) * k / steps
            a1 = p0 * ((t1 - t) / (t1 - t0)) + p1 * ((t - t0) / (t1 - t0))
            a2 = p1 * ((t2 - t) / (t2 - t1)) + p2 * ((t - t1) / (t2 - t1))
            a3 = p2 * ((t3 - t) / (t3 - t2)) + p3 * ((t - t2) / (t3 - t2))
            b1 = a1 * ((t2 - t) / (t2 - t0)) + a2 * ((t - t0) / (t2 - t0))
            b2 = a2 * ((t3 - t) / (t3 - t1)) + a3 * ((t - t1) / (t3 - t1))
            dense.append(b1 * ((t2 - t) / (t2 - t1)) + b2 * ((t - t1) / (t2 - t1)))
    acc = [0.0]
    for a, b in zip(dense, dense[1:]):
        acc.append(acc[-1] + (b - a).length)
    total = acc[-1]
    pos, tan = [], []
    j = 0
    for i in range(n + 1):
        d = total * i / n
        while j < len(acc) - 2 and acc[j + 1] < d:
            j += 1
        seg = acc[j + 1] - acc[j]
        k = (d - acc[j]) / seg if seg > 1e-9 else 0.0
        pos.append(dense[j].lerp(dense[j + 1], k))
        tan.append((dense[j + 1] - dense[j]).normalized())
    return pos, tan


def _ring_at(rings, t):
    rs = sorted(rings, key=lambda r: r["t"])
    i = 0
    while i < len(rs) - 2 and rs[i + 1]["t"] < t:
        i += 1
    a = rs[i]
    b = rs[i + 1] if i + 1 < len(rs) else a
    k = min(1.0, max(0.0, (t - a["t"]) / (b["t"] - a["t"]))) if b["t"] > a["t"] else 0.0
    s = k * k * (3 - 2 * k)
    mix = lambda key, d=0.0: a.get(key, d) + (b.get(key, d) - a.get(key, d)) * s  # noqa: E731
    return mix("w"), mix("h"), mix("dy"), mix("ex", 1.0)


def _sp(c, ex):
    return math.copysign(abs(c) ** ex, c)


# ---------------------------------------------------------------- solids (added to a bmesh)


def tube(bm, points, rings, segs=24, around=16, up=(0, 0, 1), caps=True, uv=None):
    """Sweep varying cross-sections along a curve (necks, legs, sleeves, strands).

    rings: dicts with t (0..1 along the curve), w (half width, sideways), h (half height,
    towards `up`), optional dy (shift along up) and ex (superellipse exponent).
    Returns the vertices as a list of rows.
    """
    pos, tan = spline(points, segs)
    upv = V(up)
    rows = []
    for i in range(segs + 1):
        c, T = pos[i], tan[i]
        side = T.cross(upv)
        if side.length < 1e-6:
            side = V((1, 0, 0))
        side.normalize()
        nup = side.cross(T).normalized()
        w, h, dy, ex = _ring_at(rings, i / segs)
        row = []
        for j in range(around):
            th = j / around * TAU
            p = c + side * (w * _sp(math.cos(th), ex)) + nup * (h * _sp(math.sin(th), ex) + dy)
            row.append(bm.verts.new(p))
        rows.append(row)
    layer = bm.loops.layers.uv.verify() if uv else None
    for i in range(segs):
        for j in range(around):
            k = (j + 1) % around
            f = bm.faces.new((rows[i][j], rows[i][k], rows[i + 1][k], rows[i + 1][j]))
            if layer:
                for loop, (uu, vv) in zip(
                    f.loops,
                    ((j / around, i / segs), ((j + 1) / around, i / segs), ((j + 1) / around, (i + 1) / segs), (j / around, (i + 1) / segs)),
                ):
                    loop[layer].uv = (uu * uv[0], vv * uv[1])
    if caps:
        bm.faces.new(rows[0])
        bm.faces.new(rows[-1])
    return rows


def loft(bm, sections, around=28, ex=0.9):
    """A body lofted through cross-sections along y: dicts with y, w (half width), top, bottom."""
    rows = []
    for s in sections:
        mid = (s["top"] + s["bottom"]) / 2
        row = []
        for j in range(around):
            th = j / around * TAU
            c, sn = math.cos(th), math.sin(th)
            x = s["w"] * _sp(c, s.get("ex", ex))
            yu = abs(sn) ** s.get("ex", ex)
            z = mid + (s["top"] - mid) * yu if sn >= 0 else mid - (mid - s["bottom"]) * yu
            row.append(bm.verts.new((x, s["y"], z)))
        rows.append(row)
    for i in range(len(rows) - 1):
        for j in range(around):
            k = (j + 1) % around
            bm.faces.new((rows[i][j], rows[i][k], rows[i + 1][k], rows[i + 1][j]))
    bm.faces.new(rows[0])
    bm.faces.new(rows[-1])
    return rows


def ellipsoid(bm, centre, radii, rot_x=0.0, segs=20):
    m = Matrix.Translation(V(centre)) @ Matrix.Rotation(rot_x, 4, "X") @ Matrix.Diagonal((*radii, 1))
    return bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2 + 2, radius=1, matrix=m)["verts"]


def cone(bm, base, tip, r1, r2=0.0, segs=10, squash=1.0):
    """A cone or cylinder from the centre of its base to its tip."""
    a, b = V(base), V(tip)
    d = b - a
    rot = V((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    m = Matrix.Translation((a + b) / 2) @ rot @ Matrix.Diagonal((1, squash, 1, 1))
    return bmesh.ops.create_cone(
        bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=d.length, matrix=m
    )["verts"]


def box(bm, centre, size, rot=None):
    m = Matrix.Translation(V(centre)) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((*size, 1))
    return bmesh.ops.create_cube(bm, size=1, matrix=m)["verts"]


def card(bm, matrix, w, h, seg_x=1, seg_y=3, taper=1.0):
    """A cloth strip hanging down from its top edge, with UVs.

    v = 0 at the top edge here, which the glTF exporter flips to v = 1: the game's tatter
    texture is solid at v = 1 and ragged at v = 0, so the hem comes out torn.

    In its own frame the strip lies in the x/z plane, top edge centred on the origin.
    Returns rows of vertices, top row first.
    """
    layer = bm.loops.layers.uv.verify()
    rows = []
    for j in range(seg_y + 1):
        f = j / seg_y
        half = w / 2 * (1 + (taper - 1) * f)
        rows.append([bm.verts.new(matrix @ V((-half + 2 * half * i / seg_x, 0, -h * f))) for i in range(seg_x + 1)])
    for j in range(seg_y):
        for i in range(seg_x):
            f = bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
            for loop, (uu, vv) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                loop[layer].uv = (uu / seg_x, vv / seg_y)
    return rows


# ---------------------------------------------------------------- objects


def material(name, colour=(0.5, 0.5, 0.5)):
    """Materials are matched by NAME in the game, which supplies its own shaders."""
    m = bpy.data.materials.get(name)
    if not m:
        m = bpy.data.materials.new(name)
        m.diffuse_color = (*colour, 1)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (*colour, 1)
    return m


def to_object(name, bm, mat=None, smooth=True, fix_normals=True):
    if fix_normals:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if mat:
        mesh.materials.append(mat)
    if smooth:
        for p in mesh.polygons:
            p.use_smooth = True
    return obj


def only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def fuse(obj, voxel=0.014, smooth=6, target_tris=14000):
    """Melt overlapping parts into one continuous skin, then thin it to a game-sized mesh."""
    only(obj)
    obj.data.remesh_voxel_size = voxel
    obj.data.remesh_voxel_adaptivity = 0
    bpy.ops.object.voxel_remesh()
    m = obj.modifiers.new("Smooth", "SMOOTH")
    m.factor, m.iterations = 0.5, smooth
    bpy.ops.object.modifier_apply(modifier="Smooth")
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if tris > target_tris:
        d = obj.modifiers.new("Thin", "DECIMATE")
        d.ratio = target_tris / tris
        bpy.ops.object.modifier_apply(modifier="Thin")
    obj.data.validate()  # thinning can leave a few collapsed faces
    obj.data.update()
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def unwrap(obj, scale=1.0):
    only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.01)
    bpy.ops.object.mode_set(mode="OBJECT")
    if scale != 1.0:
        for uv in obj.data.uv_layers.active.data:
            uv.uv = (uv.uv[0] * scale, uv.uv[1] * scale)


def join(objs, name):
    if len(objs) == 1:
        objs[0].name = objs[0].data.name = name
        return objs[0]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]


# ---------------------------------------------------------------- weights


def _seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.length_squared)))
    return (p - (a + ab * t)).length


def weight_rigid(obj, bone, verts=None):
    g = obj.vertex_groups.get(bone) or obj.vertex_groups.new(name=bone)
    g.add(list(verts) if verts is not None else range(len(obj.data.vertices)), 1.0, "REPLACE")


def weight_near(obj, bones, rest, power=4.0, verts=None, keep=2):
    """Weight each vertex to the nearest of `bones` (name -> (head, tail)), softly blended."""
    groups = {b: obj.vertex_groups.get(b) or obj.vertex_groups.new(name=b) for b in bones}
    for v in obj.data.vertices:
        if verts is not None and v.index not in verts:
            continue
        p = obj.matrix_world @ v.co
        ws = sorted(((1.0 / max(1e-4, _seg_dist(p, *rest[b])) ** power, b) for b in bones), reverse=True)[:keep]
        total = sum(w for w, _ in ws)
        for w, b in ws:
            groups[b].add([v.index], w / total, "REPLACE")


def bind_auto(obj, rig, bones):
    """Blender's automatic (bone heat) skin weights, limited to the named bones."""
    saved = {b.name: b.use_deform for b in rig.data.bones}
    for b in rig.data.bones:
        b.use_deform = b.name in bones
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    for b in rig.data.bones:
        b.use_deform = saved[b.name]
    for v in obj.data.vertices:  # bone heat overshoots 1.0 by a hair on some vertices
        for g in v.groups:
            g.weight = min(1.0, g.weight)
    filled = sum(1 for v in obj.data.vertices if v.groups)
    return filled == len(obj.data.vertices)


def bind_manual(obj, rig):
    """Attach an object whose vertex groups are already painted to the skeleton."""
    obj.parent = rig
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = rig


# ---------------------------------------------------------------- posing


def rx(a):
    return Quaternion((1, 0, 0), a)


def ry(a):
    return Quaternion((0, 1, 0), a)


def rz(a):
    return Quaternion((0, 0, 1), a)


def wrap(a):
    return (a + math.pi) % TAU - math.pi


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def bump(x, a, b):
    """0 outside [a, b], rising smoothly to 1 in the middle."""
    if x <= a or x >= b:
        return 0.0
    return math.sin(math.pi * (x - a) / (b - a)) ** 2
