"""The Mystery Machine, a 1960s panel van in green and light blue, modelled in Blender.

    python tools/blender/mystery.py -- apps/game/src/render/models/mystery.glb [--preview DIR]

One rounded box of a shell, with the colour split running dead level round the waist and the
front leaning back a touch above it. Painted on (as raised shapes, not pictures): orange
flowers with yellow middles over both colours and on the nose, and the name down both sides in
orange, edged in dark green. Laid on the body: the split windscreen and the cab's side windows
in black rubber, two rear windows, round headlamps in chrome rings either side of a black
grille with chrome bars, amber indicators, tall red tail lamps, door seams and chrome handles,
mirrors on arms, chrome bumpers wrapping both ends, a line in the player's colour along the
colour split, and the tailpipe. Grey steel wheels behind chrome dog-dish hubcaps.

The same footprint, wheel positions, exhaust point and camera height as the code-built van
it replaces: 4.6 m long, 1.9 m wide, 1.95 m tall.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402  isort: skip
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import vehicle as vh  # noqa: E402
from vehicle import TAU, V, keys  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[0] if argv else "mystery.glb"
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None

vh.reset()

M = {
    "paint": vh.material("paint", 0x63b7cf, 0.4, 0.12),  # light blue, above the waist
    "green": vh.material("green", 0x7fb441, 0.42, 0.12),
    "under": vh.material("under", 0x2a2b2d, 0.85, 0.0),
    "well": vh.material("well", 0x0d0d0e, 0.95, 0.0),
    "orange": vh.material("orange", 0xf28c28, 0.45, 0.0),
    "yellow": vh.material("yellow", 0xffd23a, 0.45, 0.0),
    "edge": vh.material("edge", 0x2f6b1f, 0.5, 0.0),  # the lettering's dark green edge
    "trim": vh.material("trim", 0x161719, 0.7, 0.1),
    "gap": vh.material("gap", 0x2c3a3e, 0.7, 0.0),
    "glass": vh.material("glass", 0x0d1626, 0.08, 0.9),
    "lamp": vh.material("lamp", 0xfff4d6, 0.2, 0.0, emit=(0xfff4d6, 1.4)),
    "amber": vh.material("amber", 0xff8a1a, 0.2, 0.0, emit=(0xff8a1a, 1.0)),
    "tail": vh.material("tail", 0xd01818, 0.2, 0.0, emit=(0xd01818, 1.6)),
    "chrome": vh.material("chrome", 0xdedfe3, 0.18, 1.0),
    "rim": vh.material("rim", 0x2c2e33, 0.55, 0.2),
    "rubber": vh.material("rubber", 0x1b1b1d, 0.88, 0.0),
    "accent": vh.material("accent", 0xffffff, 0.5, 0.0, emit=(0xffffff, 1.0)),
}

# ======================================================================== the shell

FRONT, BACK = 2.3, -2.3
WHEEL_Y = (1.45, -1.42)
WHEEL_R, WHEEL_X, ARCH_R = 0.36, 0.78, 0.47
SPLIT = 0.97  # the waist, where green meets blue

W = lambda y: keys([(2.3, 0.84), (2.285, 0.885), (2.255, 0.915), (2.2, 0.932), (2.08, 0.94), (-2.1, 0.94), (-2.24, 0.93), (-2.28, 0.9), (-2.3, 0.87)], y)  # noqa: E731
ZT = lambda y: keys([(2.3, 1.78), (2.285, 1.84), (2.255, 1.885), (2.2, 1.908), (2.08, 1.92), (-2.0, 1.92), (-2.18, 1.9), (-2.26, 1.86), (-2.3, 1.8)], y)  # noqa: E731
ZBOT = lambda y: keys([(2.3, 0.42), (2.26, 0.39), (2.15, 0.38), (-2.15, 0.38), (-2.26, 0.39), (-2.3, 0.42)], y)  # noqa: E731

# The ends close in rings shrinking towards the middle of each face (so the colour split runs
# level across them too), bulging out a little: y -> (where the ring sits, how big it is).
ENDS = {}


def end_rings(y0, out, n=7):
    ys = []
    for k in range(1, n + 1):
        f = 1 - k / n
        y = y0 + out * (1 - f**2.2) + (1e-4 * k if out > 0 else -1e-4 * k)
        ENDS[round(y, 6)] = (y0, max(f, 0.02))
        ys.append(y)
    return ys


def ring(y):
    y0, f = ENDS.get(round(y, 6), (y, 1.0))
    w, zb, zt = W(y0) * (0.55 + 0.45 * f), ZBOT(y0), ZT(y0)
    zb = SPLIT - (SPLIT - zb) * f
    zt = SPLIT + (zt - SPLIT) * f
    rb, rt = 0.08 * f, 0.17 * f
    a = vh.seg((0, zb), (w - rb, zb), 5)
    b = vh.arc(w - rb, zb + rb, rb, -math.pi / 2, 0, 4)
    c1 = vh.seg((w, zb + rb), (w, SPLIT), 5, lambda t: (-0.02 * (1 - t) ** 2, 0))
    c2 = vh.seg((w, SPLIT), (w, zt - rt), 9, lambda t: (0.008 * math.sin(math.pi * t), 0))
    d = vh.arc(w - rt, zt - rt, rt, 0, math.pi / 2, 6)
    e = [(x, zt + 0.02 * f * (1 - (x / max(w - rt, 1e-3)) ** 2)) for x, _ in vh.seg((w - rt, zt), (0, zt), 8)]
    return vh.chain(a, b, c1, c2, d, e)


def _s(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


ys = [2.3, 2.29, 2.275]
y = 2.25
while y > -2.27:
    ys.append(y)
    y -= 0.04
ys.append(-2.3)
ys = list(reversed(end_rings(2.3, 0.035))) + ys + end_rings(-2.3, -0.02)
ys.sort(reverse=True)
bm = bmesh.new()
vh.shell(bm, ys, ring)
# The end faces: one smooth, gentle dome each (rather than ring by ring).
for v in bm.verts:
    if abs(v.co.y) > 2.3 + 1e-6:
        out = 0.035 if v.co.y > 0 else 0.02
        dome = max(0.0, 1 - (v.co.x / 0.9) ** 2) * max(0.0, 1 - ((v.co.z - 1.15) / 0.8) ** 2)
        v.co.y = math.copysign(2.3 + 1e-6 + out * dome, v.co.y)
# Lean the front back above the waist.
for v in bm.verts:
    if v.co.z > SPLIT and v.co.y > 1.4:
        v.co.y -= 0.17 * (v.co.z - SPLIT) * _s((v.co.y - 1.4) / 0.85)
body = vh.part("shell", bm, [M["paint"], M["under"], M["green"]], smooth_angle=60)

for wy in WHEEL_Y:
    for s in (-1, 1):
        bm = bmesh.new()
        vh.cyl(bm, (s * 0.5, wy, WHEEL_R), (s * 1.3, wy, WHEEL_R), ARCH_R, ARCH_R, 48)
        vh.cut(body, vh.solid_bm_object("arch", bm), M["well"])
        bpy.data.objects.remove(bpy.data.objects["arch"])
WELL = body.data.materials.find("well")
vh.face_materials(body, lambda c, n: 1 if n.z < -0.6 and c.z < 0.45 else (2 if c.z < SPLIT else None), keep={WELL})
vh._only(body)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(60), keep_sharp_edges=True)

surf = vh.Surface(body)


def side(s):
    return (lambda u, v: V((s * 2.0, u, v))), V((-s, 0, 0))  # (u, v) = (y, z)


TOP = (lambda u, v: V((u, v, 3.0))), V((0, 0, -1))  # (x, y)
NOSE = (lambda u, v: V((u, 3.5, v))), V((0, -1, 0))  # (x, z)
TAIL = (lambda u, v: V((u, -3.5, v))), V((0, 1, 0))


def lay(name, poly, aim, mat, lift, thick=None, group="body"):
    bm = vh.panel(surf, poly, aim[0], aim[1], lift, lift if thick is None else thick)
    return vh.part(name, bm, mat, smooth_angle=60, group=group, weld=False)


def P(*pts):
    return [V(p) for p in pts]


def rect(u0, v0, u1, v1, per=3, r=1):
    return vh.outline(P((u0, v0), (u1, v0), (u1, v1), (u0, v1)), per, r)


def ellipse(cu, cv, a, b, rot=0.0, n=16):
    c, s_ = math.cos(rot), math.sin(rot)
    return [V((cu + a * math.cos(t) * c - b * math.sin(t) * s_, cv + a * math.cos(t) * s_ + b * math.sin(t) * c)) for t in (k / n * TAU for k in range(n))]


def line(name, pts2, aim, width=0.006, lift=0.0015, mat=None):
    """A panel gap: a thin dark ribbon along a 2D polyline."""
    bm = bmesh.new()
    pts2 = [V(p) for p in pts2]
    dense = []
    for a, b in zip(pts2, pts2[1:]):
        n = max(2, int((b - a).length / 0.03))
        dense += [a.lerp(b, k / n) for k in range(n)]
    dense.append(pts2[-1])
    rows = []
    for i, p in enumerate(dense):
        t = (dense[min(i + 1, len(dense) - 1)] - dense[max(i - 1, 0)]).normalized()
        nrm = V((-t.y, t.x))
        row = []
        for k in (-1, 1):
            loc, nor = surf.hit(aim[0](*(p + nrm * width * k)), aim[1])
            if loc is None:
                break
            row.append(bm.verts.new(loc + nor * lift))
        if len(row) == 2:
            rows.append(row)
    for a, b in zip(rows, rows[1:]):
        bm.faces.new((a[0], a[1], b[1], b[0]))
    return vh.part(name, bm, mat or M["gap"], smooth_angle=80, weld=False)


FLOWERS = 0


def flower(cu, cv, r, aim, spin=0.0):
    """Five orange petals round a yellow middle, painted (raised a hair) on the body."""
    global FLOWERS
    FLOWERS += 1
    for k in range(5):
        a = spin + k / 5 * TAU
        lay(f"petal{FLOWERS}_{k}", ellipse(cu + math.cos(a) * r * 0.55, cv + math.sin(a) * r * 0.55, r * 0.5, r * 0.32, a, 14), aim, M["orange"], 0.003 + 0.0004 * k, 0.003)
    lay(f"heart{FLOWERS}", ellipse(cu, cv, r * 0.28, r * 0.28, 0, 14), aim, M["yellow"], 0.0062, 0.003)


def lettering(name, string, size, at, normal, up, mat, depth=0.003, offset=0.0, lift=0.004):
    """Raised letters bent onto the body at `at`, facing `normal`, their top towards `up`;
    bold-ish and slanted, `offset` fattening them (the edge round them)."""
    n = V(normal).normalized()
    u = (V(up) - n * V(up).dot(n)).normalized()
    r = u.cross(n)
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = string
    cu.size = size
    cu.extrude = depth
    cu.offset = offset + size * 0.035
    cu.shear = 0.22
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.resolution_u = 3
    obj = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(obj)
    obj.matrix_world = Matrix.Translation(V(at)) @ Matrix((r, u, n)).transposed().to_4x4()
    vh._only(obj)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.view_layer.objects.active
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    for v in obj.data.vertices:
        off = (v.co - V(at)).dot(n)
        loc, _ = surf.hit(v.co + n * 0.5, -n)
        if loc is not None:
            v.co = loc + n * (lift + depth + off)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    obj["group"] = "body"
    vh.PARTS.append(obj)
    return obj


# ======================================================================== glass

for s in (-1, 1):
    pane = rect(s * 0.06, 1.12, s * 0.8, 1.7, 4, 2)
    lay(f"frame_ws{s}", vh.grow(pane, 0.028), NOSE, M["trim"], 0.004)
    lay(f"glass_ws{s}", pane, NOSE, M["glass"], 0.007)
    aim = side(s)
    win = rect(1.86, 1.2, 1.16, 1.72, 4, 2)
    lay(f"frame_cab{s}", vh.grow(win, 0.026), aim, M["trim"], 0.004)
    lay(f"glass_cab{s}", win, aim, M["glass"], 0.007)
    back = rect(s * 0.12, 1.3, s * 0.72, 1.7, 4, 2)
    lay(f"frame_back{s}", vh.grow(back, 0.026), TAIL, M["trim"], 0.004)
    lay(f"glass_back{s}", back, TAIL, M["glass"], 0.007)

# ======================================================================== paint: flowers and the name

for s in (-1, 1):
    aim = side(s)
    for k, (yy, zz, r) in enumerate([(0.62, 1.72, 0.15), (0.52, 1.22, 0.19), (-1.92, 1.73, 0.16), (-2.0, 1.2, 0.14), (-1.5, 1.14, 0.11), (0.75, 0.72, 0.11), (0.22, 0.8, 0.13), (-0.32, 0.7, 0.11), (-0.82, 0.8, 0.12), (2.05, 0.7, 0.1), (-2.1, 0.7, 0.1)]):
        flower(yy, zz, r, aim, spin=0.4 * k)
    for text, zz, size in (("The Mystery", 1.58, 0.27), ("Machine", 1.24, 0.31)):
        loc, nor = surf.hit((s * 2, -0.66, zz), (-s, 0, 0))
        lettering(f"name{s}{zz}", text, size, loc, nor, (0, 0, 1), M["orange"], lift=0.008)
        lettering(f"nameedge{s}{zz}", text, size, loc, nor, (0, 0, 1), M["edge"], offset=0.016, depth=0.002, lift=0.004)
flower(0, 0.93, 0.12, NOSE)

# ======================================================================== front

for s in (-1, 1):
    loc, nor = surf.hit((s * 0.64, 3.5, 0.74), (0, -1, 0))
    rot = nor.to_track_quat("Z", "Y").to_matrix().to_4x4()
    bm = bmesh.new()
    vh.torus(bm, loc + nor * 0.012, 0.115, 0.024, segs=32, around=8, rot=rot)
    vh.part(f"hlring{s}", bm, M["chrome"], smooth_angle=60)
    bm = bmesh.new()
    vh.ball(bm, loc, (0.1, 0.1, 0.03), 20, rot)
    vh.part(f"headlamp{s}", bm, M["lamp"], smooth_angle=70)
    lay(f"indicator{s}", rect(s * 0.64 - 0.05, 0.585, s * 0.64 + 0.05, 0.615, 3, 1), NOSE, M["amber"], 0.02)
lay("grille", rect(-0.35, 0.64, 0.35, 0.8, 4, 1), NOSE, M["trim"], 0.006)
for k in range(3):
    z = 0.67 + k * 0.05
    rays = [(V((-0.34 + 0.68 * i / 10, 3.5, z)), V((0, -1, 0))) for i in range(11)]
    vh.part(f"grillebar{k}", vh.strip(surf, rays, -0.004, 0.012, 0.008, around=6), M["chrome"], smooth_angle=50)

# Chrome bumpers wrapping both ends.
for end, y0 in (("front", 2.0), ("rear", -1.96)):
    sy = 1 if y0 > 0 else -1
    angles = [math.radians(-84 + 168 * i / 40) for i in range(41)]
    # Cast from outside, towards the point inside, so the strip sits on the surface.
    rays = [(V((0, y0, 0.53)) + V((math.sin(a), sy * math.cos(a), 0)) * 4, V((-math.sin(a), -sy * math.cos(a), 0))) for a in angles]
    vh.part(f"bumper_{end}", vh.strip(surf, rays, 0.0, 0.04, 0.05), M["chrome"], smooth_angle=50)

# ======================================================================== sides and back

for s in (-1, 1):
    aim = side(s)
    # The player's colour along the colour split, between the ends.
    rays = [(V((s * 3, 2.1 - 4.2 * i / 40, SPLIT)), V((-s, 0, 0))) for i in range(41)]
    vh.part(f"accent{s}", vh.strip(surf, rays, -0.004, 0.008, 0.012, around=6, ex=1.0), M["accent"])
    line(f"gap_cab{s}", [(2.0, 0.45), (2.0, 1.78)], aim)
    line(f"gap_door{s}", [(0.98, 0.45), (0.98, 1.78)], aim)
    line(f"gap_doortop{s}", [(2.0, 1.78), (0.98, 1.78)], aim)
    lay(f"handle{s}", rect(1.2, 1.1, 1.08, 1.13, 3, 1), aim, M["chrome"], 0.014)
    # Mirror on an arm off the cab's front corner.
    loc, nor = surf.hit((s * 2, 2.0, 1.42), (-s, 0, 0))
    bm = bmesh.new()
    vh.cyl(bm, loc, loc + V((s * 0.1, 0, 0)), 0.012, 0.012, 8)
    vh.part(f"mirrorarm{s}", bm, M["chrome"])
    bm = bmesh.new()
    vh.box(bm, loc + V((s * 0.12, 0, 0)), (0.04, 0.12, 0.22))
    vh.part(f"mirror{s}", bm, M["chrome"], bevel=0.015, segments=2)
    # Tall tail lamps at the back corners.
    lay(f"taillamp{s}", rect(s * 0.8, 0.68, s * 0.89, 0.96, 3, 1), TAIL, M["tail"], 0.012)
line("gap_rear", [(0, 0.5), (0, 1.8)], TAIL)
line("gap_reartop", [(-0.82, 1.8), (0.82, 1.8)], TAIL)
lay("rearhandle", rect(0.06, 1.1, 0.2, 1.13, 3, 1), TAIL, M["chrome"], 0.014)
bm = bmesh.new()
vh.lathe(bm, [(-2.15, 0.04), (-2.42, 0.04), (-2.425, 0.035), (-2.2, 0.032)], 14, Matrix.Translation((0.55, 0, 0.32)), cap1=True)
vh.part("tailpipe", bm, M["chrome"], smooth_angle=50)
vh.marker("exhaust", (0.55, -2.42, 0.32))

# ======================================================================== wheels


def dogdish(group, m):
    bm = bmesh.new()
    vh.lathe(bm, [(0.0, 0.17), (0.012, 0.165), (0.03, 0.14), (0.045, 0.09), (0.052, 0.04), (0.054, 0.0)], 40, m)
    vh.part(f"{group}_cap", bm, M["chrome"], smooth_angle=35, group=group)
    bm = bmesh.new()
    for k in range(5):
        a = k / 5 * TAU
        vh.cyl(bm, m @ V((0.2 * math.cos(a), -0.005, 0.2 * math.sin(a))), m @ V((0.2 * math.cos(a), 0.02, 0.2 * math.sin(a))), 0.016, 0.014, 8)
    vh.part(f"{group}_nuts", bm, M["chrome"], group=group)


for name, wy, s in (("wheel_FL", WHEEL_Y[0], -1), ("wheel_FR", WHEEL_Y[0], 1), ("wheel_RL", WHEEL_Y[1], -1), ("wheel_RR", WHEEL_Y[1], 1)):
    vh.wheel(name, (s * WHEEL_X, wy, WHEEL_R), s, WHEEL_R, 0.24, 0.24, {"rubber": M["rubber"], "rim": M["rim"]}, cap=dogdish)

# ======================================================================== bake, join, export


def tint(o, co, n):
    if o["group"] != "body" or o.data.materials[0].name not in ("paint", "green"):
        return (1, 1, 1)
    dust = max(0.0, 1 - (co.z - 0.38) / 0.3) * 0.12
    return (1 - dust, 1 - dust * 1.05, 1 - dust * 1.15)


vh.bake_ao(ground=0.0, samples=96, distance=0.7, floor=0.42, tint=tint, pct=0.8)
nodes = vh.join_groups()
print("RESULT tris", vh.stats(), "nodes", sorted(nodes))
size = vh.export(OUT)
print(f"RESULT {OUT} {size // 1024} KB")

if PREVIEW:
    vh.preview(
        PREVIEW,
        "mystery",
        [("front", 35, 15, 9.5), ("side", 90, 5, 9.5), ("rear", 145, 18, 9.5), ("left", 270, 8, 9.5), ("nose", 20, 6, 4.0, (0, 2.2, 0.7))],
        target=(0, 0, 1.0),
    )
