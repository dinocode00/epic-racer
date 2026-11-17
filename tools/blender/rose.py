"""Rose's Hot Wheel: a sparkly purple sports coupe, modelled in Blender after a die-cast toy.

    python tools/blender/rose.py -- apps/game/src/render/models/rose.glb [--preview DIR]

A late-1990s Japanese sports coupe on a wide stance: one smooth shell from nose to tail, a low
hood between angular headlamps that sweep back into the fenders, a deep front bumper with two
slatted silver intakes and round fog lamps, a rounded cabin with aqua-tinted glass, a short
deck with a ducktail spoiler and end caps, a band of tail lamps across a recessed panel, the
number-plate recess and one exhaust out of the left corner (the boost flames come out of it).
The livery: turquoise claw slashes edged in lime on the hood corners and down each flank,
with dark tears through them, white hatched panels and TEAM NITEMARE along the doors. A line
in the player's colour runs along each sill. Wheels: black dishes with gold spider spokes
(five spokes, each forking in two) and a gold centre.
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
OUT = argv[0] if argv else "rose.glb"
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None

vh.reset()

M = {
    "paint": vh.material("paint", 0x5b2a9e, 0.3, 0.55),  # sparkly metallic purple
    "under": vh.material("under", 0x2a2b2d, 0.85, 0.0),
    "well": vh.material("well", 0x0d0d0e, 0.95, 0.0),
    "trim": vh.material("trim", 0x1a1720, 0.65, 0.1),
    "gap": vh.material("gap", 0x24123e, 0.7, 0.0),
    # Aqua-tinted glass, kept as its own material (the game swaps plain "glass" for its own).
    "aqua": vh.material("aqua", 0x3fc6d8, 0.06, 0.35),
    "teal": vh.material("teal", 0x2fc4dc, 0.35, 0.05),
    "lime": vh.material("lime", 0xb6f03a, 0.35, 0.0),
    "tear": vh.material("tear", 0x2a1048, 0.4, 0.2),
    "white": vh.material("white", 0xf4f4f1, 0.35, 0.05),
    "silver": vh.material("silver", 0xc9ccd2, 0.25, 0.85),
    "gold": vh.material("gold", 0xd9a43a, 0.25, 1.0),
    "lamp": vh.material("lamp", 0xfff4d6, 0.2, 0.0, emit=(0xfff4d6, 1.4)),
    "tail": vh.material("tail", 0xd01818, 0.2, 0.0, emit=(0xd01818, 1.6)),
    "chrome": vh.material("chrome", 0xdedfe3, 0.18, 1.0),
    "rim": vh.material("rim", 0x141416, 0.35, 0.5),
    "rubber": vh.material("rubber", 0x1b1b1d, 0.88, 0.0),
    "accent": vh.material("accent", 0xffffff, 0.5, 0.0, emit=(0xffffff, 1.0)),
}

# ======================================================================== the shell

FRONT, BACK = 2.24, -2.2
WHEEL_Y = (1.34, -1.2)  # front, rear axle
WHEEL_R, WHEEL_X, WHEEL_W = 0.32, 0.76, 0.28
ARCH_R = 0.355

W = lambda y: keys([(2.24, 0.48), (2.232, 0.58), (2.21, 0.67), (2.17, 0.75), (2.1, 0.81), (2.0, 0.85), (1.82, 0.875), (1.34, 0.89), (0.9, 0.875), (0.3, 0.865), (-0.6, 0.865), (-1.2, 0.885), (-1.65, 0.875), (-1.88, 0.85), (-2.03, 0.81), (-2.12, 0.75), (-2.175, 0.67), (-2.195, 0.59), (-2.2, 0.5)], y)  # noqa: E731
ZB = lambda y: keys([(2.24, 0.48), (2.21, 0.54), (2.12, 0.6), (1.9, 0.68), (1.34, 0.765), (0.74, 0.82), (0.0, 0.85), (-0.9, 0.87), (-1.5, 0.89), (-1.95, 0.9), (-2.12, 0.88), (-2.19, 0.82), (-2.2, 0.76)], y)  # noqa: E731
ZBOT = lambda y: keys([(2.24, 0.27), (2.21, 0.22), (2.12, 0.2), (1.9, 0.19), (-1.9, 0.19), (-2.1, 0.21), (-2.18, 0.25), (-2.2, 0.32)], y)  # noqa: E731

WS0, WS1 = 0.72, -0.04  # windscreen base and top (y)
RF, RB = -0.74, -1.46  # rear window top and base
ROOF = 1.25


def _s(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def cabin(y):
    if y >= WS0 or y <= RB:
        return 0.0
    if y >= WS1:
        return _s((WS0 - y) / (WS0 - WS1))
    if y >= RF:
        return 1.0
    return _s((y - RB) / (RF - RB))


def ztop_raw(y):
    if y >= WS0:
        return ZB(y) + 0.03
    if y >= WS1:
        t = (WS0 - y) / (WS0 - WS1)
        z0 = ZB(WS0) + 0.03
        return z0 + (ROOF - z0) * (t + 0.22 * t * (1 - t))
    if y >= RF:
        return ROOF + 0.02 * math.sin(math.pi * (WS1 - y) / (WS1 - RF))
    if y >= RB:
        t = (RF - y) / (RF - RB)
        z1 = ZB(RB) + 0.03
        return ROOF - (ROOF - z1) * (t + 0.3 * t * (1 - t))
    return ZB(y) + 0.03


def ZTOP(y):
    return sum(ztop_raw(y + d) for d in (-0.05, -0.025, 0, 0.025, 0.05)) / 5


RS, RBOT = 0.12, 0.1  # soft shoulders and rockers


def XG1(y):
    g = cabin(y)
    return (W(y) - min(RS, (ZB(y) - ZBOT(y)) * 0.5) - 0.1) * (1 - g) + 0.6 * g


def ring(y):
    g = cabin(y)
    # Round every edge as far as the section allows (the nose and tail are only a hand high).
    h = ZB(y) - ZBOT(y)
    rs, rb = min(RS, h * 0.5), min(RBOT, h * 0.4)
    return vh.car_ring(W(y), ZB(y), ZBOT(y), ZTOP(y), XG1(y), 0.09 + 0.08 * g, rs, rb, 0.03 + 0.015 * g, tuck=0.05, bulge=0.008)


ys = [2.24, 2.236, 2.228, 2.215, 2.195, 2.168, 2.135, 2.095, 2.05]
y = 2.01
while y > -2.0:
    ys.append(y)
    y -= 0.04
ys += [-2.04, -2.08, -2.115, -2.14, -2.16, -2.175, -2.187, -2.195, -2.2]
bm = bmesh.new()
vh.shell(bm, ys, ring)
body = vh.part("shell", bm, [M["paint"], M["under"]], smooth_angle=72)

for wy in WHEEL_Y:
    for s in (-1, 1):
        bm = bmesh.new()
        vh.cyl(bm, (s * 0.48, wy, WHEEL_R), (s * 1.3, wy, WHEEL_R), ARCH_R, ARCH_R, 48)
        vh.cut(body, vh.solid_bm_object("arch", bm), M["well"])
        bpy.data.objects.remove(bpy.data.objects["arch"])
vh.face_materials(body, lambda c, n: 1 if n.z < -0.6 and c.z < 0.33 else None, keep={body.data.materials.find("well")})
vh._only(body)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(72), keep_sharp_edges=True)

surf = vh.Surface(body)


def side(s):
    """Rays onto the right (s = 1) or left (s = -1) flank: (u, v) = (y, z)."""
    return (lambda u, v: V((s * 2.0, u, v))), V((-s, 0, 0))


TOP = (lambda u, v: V((u, v, 3.0))), V((0, 0, -1))  # (u, v) = (x, y)
NOSE = (lambda u, v: V((u, 3.5, v))), V((0, -1, 0))  # (u, v) = (x, z)
TAIL = (lambda u, v: V((u, -3.5, v))), V((0, 1, 0))


def lay(name, poly, aim, mat, lift, thick=None, group="body", rings=None):
    bm = vh.panel(surf, poly, aim[0], aim[1], lift, lift if thick is None else thick, rings=rings)
    return vh.part(name, bm, mat, smooth_angle=60, group=group, weld=False)


def P(*pts):
    return [V(p) for p in pts]


def circle(cx, cy, r, n=20):
    return [V((cx + r * math.cos(k / n * TAU), cy + r * math.sin(k / n * TAU))) for k in range(n)]


def line(name, pts2, aim, width=0.005, lift=0.0015, mat=None):
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


# ======================================================================== glass

for s in (-1, 1):
    aim = side(s)
    zl = lambda y: ZB(y) + 0.03  # noqa: E731
    win = vh.outline(P((0.6, zl(0.6)), (0.0, 1.15), (-0.7, 1.16), (-1.1, zl(-1.1))), 5, 2)
    lay(f"frame{s}", vh.grow(win, 0.022), aim, M["trim"], 0.004)
    lay(f"glass{s}", win, aim, M["aqua"], 0.007)
    line(f"bpillar{s}", [(-0.36, zl(-0.36) + 0.01), (-0.38, 1.15)], aim, width=0.012, lift=0.009, mat=M["paint"])

ws = vh.outline(P((-0.6, 0.66), (0.6, 0.66), (0.47, 0.02), (-0.47, 0.02)), 5, 2)
lay("frame_ws", vh.grow(ws, 0.028), TOP, M["trim"], 0.004)
lay("glass_ws", ws, TOP, M["aqua"], 0.007)
rw = vh.outline(P((-0.47, -0.82), (0.47, -0.82), (0.55, -1.38), (-0.55, -1.38)), 5, 2)
lay("frame_rw", vh.grow(rw, 0.028), TOP, M["trim"], 0.004)
lay("glass_rw", rw, TOP, M["aqua"], 0.007)

# ======================================================================== nose

for s in (-1, 1):
    # Angular headlamps sweeping back over the corners into the fenders.
    hl = vh.outline(P((s * 0.4, 0.5), (s * 0.76, 0.53), (s * 0.79, 0.6), (s * 0.5, 0.58)), 3, 2)
    lay(f"hlbezel{s}", vh.grow(hl, 0.016), NOSE, M["trim"], 0.008, rings=3)
    lay(f"headlamp{s}", hl, NOSE, M["lamp"], 0.018, rings=3)
    # Round fog lamps in the bumper corners.
    lay(f"fogring{s}", circle(s * 0.62, 0.33, 0.065), NOSE, M["trim"], 0.006)
    lay(f"fog{s}", circle(s * 0.62, 0.33, 0.045), NOSE, M["lamp"], 0.01)
# Two slatted silver intakes in the middle of the bumper, and the slot above them.
for s in (-1, 1):
    box = vh.outline(P((s * 0.04, 0.27), (s * 0.4, 0.27), (s * 0.4, 0.4), (s * 0.04, 0.4)), 3, 2)
    lay(f"intakerim{s}", vh.grow(box, 0.014), NOSE, M["tear"], 0.004)
    lay(f"intake{s}", box, NOSE, M["silver"], 0.008)
    for k in range(4):
        z = 0.295 + k * 0.03
        lay(f"slat{s}{k}", vh.outline(P((s * 0.05, z), (s * 0.39, z), (s * 0.39, z + 0.008), (s * 0.05, z + 0.008)), 2, 0), NOSE, M["trim"], 0.011)
lay("grilleslot", vh.outline(P((-0.3, 0.46), (0.3, 0.46), (0.28, 0.49), (-0.28, 0.49)), 4, 1), NOSE, M["trim"], 0.005)
# A lip under the bumper.
bm = bmesh.new()
vh.box(bm, (0, 2.1, 0.19), (1.5, 0.26, 0.045))
vh.part("lip", bm, M["paint"], bevel=0.02, segments=4)
# Hood pins and the cowl.
for s in (-1, 1):
    loc, nor = surf.hit((s * 0.32, 0.92, 3), (0, 0, -1))
    bm = bmesh.new()
    vh.cyl(bm, loc - nor * 0.01, loc + nor * 0.018, 0.018, 0.016, 12)
    vh.part(f"pin{s}", bm, M["silver"], smooth_angle=50)

# ======================================================================== gaps, handles, mirrors

for s in (-1, 1):
    aim = side(s)
    line(f"gap_door1{s}", [(0.72, 0.28), (0.72, ZB(0.72) - 0.03)], aim)
    line(f"gap_door2{s}", [(-0.62, 0.28), (-0.62, ZB(-0.62) - 0.025)], aim)
    line(f"gap_hood{s}", [(s * 0.66, 0.74), (s * 0.72, 1.6), (s * 0.6, 2.08)], TOP)
    line(f"gap_deck{s}", [(s * 0.7, -1.5), (s * 0.68, -2.1)], TOP)
    lay(f"handle{s}", vh.outline(P((-0.38, 0.75), (-0.38, 0.775), (-0.52, 0.775), (-0.52, 0.75)), 3, 1), aim, M["tear"], 0.008)
    loc, nor = surf.hit((s * 2, 0.6, 0.9), (-s, 0, 0))
    bm = bmesh.new()
    vh.box(bm, loc + V((s * 0.04, 0, 0)), (0.08, 0.05, 0.03))
    vh.part(f"mirrorarm{s}", bm, M["paint"], bevel=0.014, segments=3)
    bm = bmesh.new()
    vh.ball(bm, loc + V((s * 0.11, -0.02, 0.03)), (0.07, 0.05, 0.05), 16)
    vh.part(f"mirror{s}", bm, M["paint"], smooth_angle=70)
line("gap_hood", [(-0.66, 0.74), (0.66, 0.74)], TOP)
line("gap_deck", [(-0.7, -1.5), (0.7, -1.5)], TOP)

# ======================================================================== the livery


def claw(name, poly, aim, rings=2, lift=0.003):
    """A turquoise slash edged in lime."""
    p = vh.outline(P(*poly), 3, 0)
    lay(f"{name}_edge", vh.grow(p, 0.016), aim, M["lime"], lift, rings=rings)
    lay(f"{name}", p, aim, M["teal"], lift + 0.0015, rings=rings)


# Claw rakes on the hood corners: tips at the front, raking back towards the windscreen.
HOOD = [
    [(0.36, 1.3), (0.5, 1.3), (0.6, 1.98)],
    [(0.5, 1.36), (0.6, 1.34), (0.66, 1.84)],
    [(0.6, 1.3), (0.7, 1.32), (0.72, 1.68)],
    [(0.42, 1.52), (0.52, 1.5), (0.5, 1.84)],
    [(0.34, 1.26), (0.72, 1.24), (0.68, 1.36), (0.38, 1.4)],
]
for s in (-1, 1):
    for i, poly in enumerate(HOOD):
        claw(f"hood{s}_{i}", [(s * (x - 0.06), y) for x, y in poly], TOP, rings=4, lift=0.005)

# Down each flank: broad slashes raking up and back across the doors, dark tears through
# them, white hatched panels at either end and TEAM NITEMARE along the bottom.
SIDE = [
    # The broad turquoise sweep along the doors...
    [(0.66, 0.34), (-0.96, 0.31), (-0.96, 0.46), (0.5, 0.5)],
    # ...with claws tearing up and back out of it, and a few broken shards.
    [(0.62, 0.44), (0.38, 0.47), (0.02, 0.76)],
    [(0.4, 0.46), (0.14, 0.48), (-0.26, 0.78)],
    [(0.16, 0.47), (-0.12, 0.47), (-0.5, 0.74)],
    [(-0.1, 0.46), (-0.4, 0.46), (-0.8, 0.77)],
    [(-0.4, 0.45), (-0.7, 0.45), (-0.98, 0.7)],
    [(-0.68, 0.44), (-0.95, 0.44), (-1.0, 0.58)],
    [(0.7, 0.34), (0.56, 0.34), (0.44, 0.24)],
    [(-1.66, 0.38), (-1.76, 0.36), (-2.04, 0.7)],
    [(-1.7, 0.56), (-1.78, 0.54), (-1.98, 0.8)],
]
TEARS = [
    [(0.52, 0.36), (0.47, 0.37), (0.06, 0.68)],
    [(0.24, 0.35), (0.19, 0.36), (-0.24, 0.7)],
    [(-0.06, 0.34), (-0.11, 0.35), (-0.56, 0.68)],
    [(-0.36, 0.34), (-0.41, 0.35), (-0.84, 0.66)],
    [(0.6, 0.42), (-0.7, 0.4), (-0.7, 0.41), (0.6, 0.43)],
]
for s in (-1, 1):
    aim = side(s)
    for i, poly in enumerate(SIDE):
        claw(f"side{s}_{i}", poly, aim, rings=3)
    for i, poly in enumerate(TEARS):
        lay(f"tear{s}_{i}", vh.outline(P(*poly), 3, 0), aim, M["tear"], 0.0055, rings=2)
    # Hatched white panels: thin diagonal bars.
    for y0, z0, n in ((0.98, 0.5, 5), (-1.86, 0.62, 4)):
        for k in range(n):
            yy = y0 - k * 0.045
            lay(f"hatch{s}_{y0}_{k}", vh.outline(P((yy, z0), (yy - 0.02, z0), (yy - 0.09, z0 + 0.14), (yy - 0.07, z0 + 0.14)), 2, 0), aim, M["white"], 0.0035, rings=1)


def letter(name, string, size, at, normal, up, mat, depth=0.003):
    """Lettering lying on the body at `at`, facing `normal`, its top towards `up`."""
    n = V(normal).normalized()
    u = (V(up) - n * V(up).dot(n)).normalized()
    r = u.cross(n)
    rot = Matrix((r, -n, u)).transposed().to_4x4()
    obj = vh.text(name, string, size, Matrix.Translation(V(at)) @ rot, mat, depth)
    for v in obj.data.vertices:  # bend the letters onto the panel
        off = (v.co - V(at)).dot(n)
        loc, _ = surf.hit(v.co + n * 0.5, -n)
        if loc is not None:
            v.co = loc + n * (0.0055 + depth + off)
    return obj


for s in (-1, 1):
    loc, nor = surf.hit((s * 2, -0.12, 0.27), (-s, 0, 0))
    letter(f"team{s}", "TEAM NITEMARE", 0.07, loc, nor, (0, 0, 1), M["white"])
    # The player's colour along the sill.
    rays = [(V((s * 3, 0.92 - 1.75 * i / 30, 0.235)), V((-s, 0, 0))) for i in range(31)]
    vh.part(f"accent{s}", vh.strip(surf, rays, -0.004, 0.007, 0.01, around=6, ex=1.0), M["accent"])

# ======================================================================== tail

# Ducktail spoiler along the end of the deck, with little end caps.
deck = surf.hit((0, -2.0, 3), (0, 0, -1))[0].z
bm = bmesh.new()
vh.box(bm, (0, -2.02, deck + 0.05), (1.36, 0.17, 0.05), Matrix.Rotation(-0.22, 4, "X"))
vh.part("ducktail", bm, M["paint"], bevel=0.023, segments=4)
for s in (-1, 1):
    bm = bmesh.new()
    vh.box(bm, (s * 0.68, -2.0, deck + 0.04), (0.04, 0.2, 0.08))
    vh.part(f"duckcap{s}", bm, M["trim"], bevel=0.018, segments=3)
    bm = bmesh.new()
    vh.box(bm, (s * 0.3, -1.98, deck + 0.025), (0.035, 0.06, 0.05))
    vh.part(f"duckpost{s}", bm, M["paint"], bevel=0.016, segments=3)

# A recessed panel across the tail with the lamps in a band along it.
lay("tailrecess", vh.outline(P((-0.76, 0.6), (0.76, 0.6), (0.74, 0.76), (-0.74, 0.76)), 5, 2), TAIL, M["tear"], 0.003)
for s in (-1, 1):
    lay(f"taillamp{s}", vh.outline(P((s * 0.4, 0.625), (s * 0.74, 0.62), (s * 0.72, 0.735), (s * 0.4, 0.735)), 4, 2), TAIL, M["tail"], 0.008)
    lay(f"tailinner{s}", vh.outline(P((s * 0.12, 0.64), (s * 0.36, 0.64), (s * 0.36, 0.72), (s * 0.12, 0.72)), 3, 1), TAIL, M["tail"], 0.007)
plate = vh.outline(P((-0.2, 0.4), (0.2, 0.4), (0.2, 0.53), (-0.2, 0.53)), 4, 1)
lay("platerecess", plate, TAIL, M["paint"], -0.012, 0.0, rings=2)
line("platebox", [(-0.2, 0.4), (0.2, 0.4), (0.2, 0.53), (-0.2, 0.53), (-0.2, 0.4)], TAIL, width=0.006, lift=0.003)
line("bumperline", [(-0.82, 0.58), (0.82, 0.58)], TAIL, width=0.006, lift=0.003)

# One exhaust, out of the left corner.
bm = bmesh.new()
vh.lathe(bm, [(-2.0, 0.045), (-2.27, 0.045), (-2.275, 0.04), (-2.12, 0.035)], 18, Matrix.Translation((-0.56, 0, 0.24)), cap1=True)
vh.part("tailpipe", bm, M["chrome"], smooth_angle=50)
vh.marker("exhaust", (-0.56, -2.28, 0.24))

# ======================================================================== wheels


def face(group, m):
    """Black dish with gold spider spokes: five, each forking in two, and a gold centre."""
    bm = bmesh.new()
    vh.lathe(bm, [(-0.04, 0.245), (-0.015, 0.24), (0.0, 0.2), (-0.012, 0.08), (-0.012, 0.0)], 40, m)
    vh.part(f"{group}_dish", bm, M["rim"], smooth_angle=35, group=group)
    bm = bmesh.new()
    for k in range(5):
        a0 = k / 5 * TAU
        stem = [m @ V((r * math.cos(a0), 0.012, r * math.sin(a0))) for r in (0.05, 0.08, 0.11)]
        vh.sweep(bm, stem, 0.014, around=6)
        for fork in (-1, 1):
            pts = []
            for i in range(6):
                t = i / 5
                r = 0.11 + 0.125 * t
                a = a0 + fork * 0.38 * math.sin(t * math.pi / 2) - fork * 0.08 * t * t
                pts.append(m @ V((r * math.cos(a), 0.012 - 0.01 * t, r * math.sin(a))))
            vh.sweep(bm, pts, 0.011, around=6)
    vh.part(f"{group}_spokes", bm, M["gold"], smooth_angle=60, group=group)
    bm = bmesh.new()
    vh.lathe(bm, [(-0.01, 0.06), (0.015, 0.058), (0.025, 0.04), (0.028, 0.0)], 24, m)
    vh.part(f"{group}_cap", bm, M["gold"], group=group)
    bm = bmesh.new()
    vh.lathe(bm, [(0.026, 0.02), (0.031, 0.0)], 12, m)
    vh.part(f"{group}_bolt", bm, M["white"], group=group)


for name, wy, s in (("wheel_FL", WHEEL_Y[0], -1), ("wheel_FR", WHEEL_Y[0], 1), ("wheel_RL", WHEEL_Y[1], -1), ("wheel_RR", WHEEL_Y[1], 1)):
    vh.wheel(name, (s * WHEEL_X, wy, WHEEL_R), s, WHEEL_R, WHEEL_W, 0.25, {"rubber": M["rubber"], "rim": M["rim"]}, cap=face)

# ======================================================================== bake, join, export


def tint(o, co, n):
    """A little road dust low on the flanks."""
    if o["group"] != "body" or o.data.materials[0].name != "paint":
        return (1, 1, 1)
    dust = max(0.0, 1 - (co.z - 0.19) / 0.25) * 0.1
    return (1 - dust, 1 - dust * 1.05, 1 - dust * 1.15)


vh.bake_ao(ground=0.0, samples=96, distance=0.6, floor=0.42, tint=tint, pct=0.8)
nodes = vh.join_groups()
print("RESULT tris", vh.stats(), "nodes", sorted(nodes))
size = vh.export(OUT)
print(f"RESULT {OUT} {size // 1024} KB")

if PREVIEW:
    vh.preview(
        PREVIEW,
        "rose",
        [("front", 35, 15, 8.5), ("side", 270, 4, 8.5), ("rear", 150, 18, 8.5), ("top", 0.01, 80, 9), ("nose", 0, 8, 5.5), ("tail", 180, 8, 5.5), ("wheel", 75, 3, 2.2, (0.82, 1.34, 0.32))],
        target=(0, 0, 0.6),
    )
