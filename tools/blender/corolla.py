"""1995 Toyota Corolla sedan (E100), in white, modelled in Blender.

    python tools/blender/corolla.py -- apps/game/src/render/models/corolla.glb [--preview DIR]

One continuous body shell from bumper to bumper: soft-cornered three-box lines, a rounded
shoulder running into the hood and trunk, a gently crowned roof, the greenhouse leaning in
(tumblehome), round wheel arches with dark wells. On it, laid to the surface: tinted glass in
black rubber surrounds, a black B-pillar and mirror sails, slim wraparound headlamps either
side of a narrow grille slot with the oval emblem, amber corner lamps, wide red tail lamps with
amber and reversing sections, panel gaps round the doors, hood and trunk, black pull handles,
rub strips round the bumpers and along the doors (with a thin line in the player's colour),
wipers, an aerial, mirrors, the rear number plate and the tailpipe. 14-inch steel wheels
behind plain silver hubcaps with eight slots.

Real proportions: 4.37 m long, 1.69 m wide, 1.38 m tall; the same footprint, wheel positions
and exhaust point as the code-built car it replaces.
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
OUT = argv[0] if argv else "corolla.glb"
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None

vh.reset()

M = {
    "paint": vh.material("paint", 0xf4f4f1, 0.3, 0.12),
    "under": vh.material("under", 0x2a2b2d, 0.85, 0.0),
    "well": vh.material("well", 0x0d0d0e, 0.95, 0.0),
    "trim": vh.material("trim", 0x18191b, 0.6, 0.1),  # black rubber and plastic
    "gap": vh.material("gap", 0x3a3c40, 0.7, 0.0),
    "glass": vh.material("glass", 0x0d1626, 0.08, 0.9),
    "lamp": vh.material("lamp", 0xfff4d6, 0.2, 0.0, emit=(0xfff4d6, 1.4)),
    "amber": vh.material("amber", 0xff8a1a, 0.2, 0.0, emit=(0xff8a1a, 1.0)),
    "tail": vh.material("tail", 0xd01818, 0.2, 0.0, emit=(0xd01818, 1.6)),
    "reverse": vh.material("reverse", 0xf2f2ea, 0.2, 0.0, emit=(0xf2f2ea, 0.5)),
    "chrome": vh.material("chrome", 0xdedfe3, 0.18, 1.0),
    "hubcap": vh.material("hubcap", 0xc9ccd1, 0.32, 0.65),
    "rim": vh.material("rim", 0x2a2c30, 0.55, 0.3),
    "rubber": vh.material("rubber", 0x1b1b1d, 0.88, 0.0),
    "plate": vh.material("plate", 0xf6f3e8, 0.5, 0.0),
    "platetext": vh.material("platetext", 0x1c2a5a, 0.5, 0.0),
    "accent": vh.material("accent", 0xffffff, 0.5, 0.0, emit=(0xffffff, 1.0)),
}

# ======================================================================== the shell

FRONT, BACK = 2.19, -2.19
WHEEL_Y = (1.3, -1.17)  # front, rear axle
WHEEL_R, WHEEL_X = 0.3, 0.74

W = lambda y: keys([(2.19, 0.6), (2.175, 0.7), (2.14, 0.775), (2.06, 0.818), (1.9, 0.838), (1.5, 0.848), (0.5, 0.852), (-1.0, 0.852), (-1.7, 0.844), (-2.0, 0.824), (-2.12, 0.785), (-2.17, 0.73), (-2.19, 0.64)], y)  # noqa: E731
ZB = lambda y: keys([(2.19, 0.6), (2.17, 0.64), (2.12, 0.685), (2.0, 0.72), (1.7, 0.76), (1.2, 0.8), (0.74, 0.835), (0.0, 0.86), (-1.0, 0.88), (-1.6, 0.895), (-1.95, 0.9), (-2.1, 0.885), (-2.17, 0.84), (-2.19, 0.79)], y)  # noqa: E731
ZBOT = lambda y: keys([(2.19, 0.35), (2.175, 0.31), (2.13, 0.285), (2.0, 0.272), (1.8, 0.28), (-1.9, 0.28), (-2.08, 0.29), (-2.16, 0.32), (-2.19, 0.4)], y)  # noqa: E731

WS0, WS1 = 0.74, 0.08  # windscreen base and top (y)
RW0, RW1 = -0.78, -1.52  # rear window top and base


def cabin(y):
    """0 over the hood and trunk, 1 under the roof, easing along the windscreen and rear glass."""
    if y >= WS0 or y <= RW1:
        return 0.0
    if y >= WS1:
        return _s((WS0 - y) / (WS0 - WS1))
    if y >= RW0:
        return 1.0
    return _s((y - RW1) / (RW0 - RW1))


def _s(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def ztop_raw(y):
    if y >= WS0:
        return ZB(y) + 0.03
    if y >= WS1:
        t = (WS0 - y) / (WS0 - WS1)
        return ZB(WS0) + 0.03 + (1.355 - ZB(WS0) - 0.03) * (t + 0.18 * t * (1 - t))
    if y >= RW0:
        return 1.355 + 0.028 * math.sin(math.pi * (WS1 - y) / (WS1 - RW0))
    if y >= RW1:
        t = (RW0 - y) / (RW0 - RW1)
        return 1.355 - (1.355 - ZB(RW1) - 0.03) * (t + 0.22 * t * (1 - t))
    return ZB(y) + 0.03


def ZTOP(y):
    return sum(ztop_raw(y + d) for d in (-0.05, -0.025, 0, 0.025, 0.05)) / 5


RS, RBOT = 0.045, 0.07


def XG1(y):
    g = cabin(y)
    return (W(y) - RS - 0.06) * (1 - g) + 0.635 * g


def RR(y):
    return 0.026 + 0.05 * cabin(y)


def ring(y):
    w, zb, zbot, zt, xg, rr = W(y), ZB(y), ZBOT(y), ZTOP(y), XG1(y), RR(y)
    crown = 0.02 + 0.012 * cabin(y)
    a = vh.seg((0, zbot), (w - RBOT, zbot), 5)
    b = vh.arc(w - RBOT, zbot + RBOT, RBOT, -math.pi / 2, 0, 4)
    c = vh.seg((w, zbot + RBOT), (w, zb - RS), 9, lambda t: (-0.03 * (1 - t) ** 2 + 0.006 * math.sin(math.pi * t), 0))
    d = vh.arc(w - RS, zb - RS, RS, 0, math.pi / 2, 4)
    e = vh.seg((w - RS, zb), (xg, zt - rr), 9)
    f = vh.arc(xg - rr, zt - rr, rr, 0, math.pi / 2, 5)
    g = [(x, zt + crown * (1 - (x / (xg - rr)) ** 2)) for x, _ in vh.seg((xg - rr, zt), (0, zt), 9)]
    return vh.chain(a, b, c, d, e, f, g)


ys = [2.19, 2.186, 2.178, 2.165, 2.145, 2.118, 2.085, 2.045, 2.0]
y = 1.97
while y > -1.97:
    ys.append(y)
    y -= 0.04
ys += [-2.0, -2.045, -2.085, -2.118, -2.145, -2.165, -2.178, -2.186, -2.19]
bm = bmesh.new()
vh.shell(bm, ys, ring)
body = vh.part("shell", bm, [M["paint"], M["under"]], smooth_angle=75)

# Wheel arches: cylinders through the car, leaving dark wells.
for wy in WHEEL_Y:
    bm = bmesh.new()
    vh.cyl(bm, (-1.2, wy, WHEEL_R), (1.2, wy, WHEEL_R), 0.375, 0.375, 48)
    vh.cut(body, vh.solid_bm_object("arch", bm), M["well"])
    bpy.data.objects.remove(bpy.data.objects["arch"])
vh.face_materials(body, lambda c, n: 1 if n.z < -0.6 and c.z < 0.4 else None, keep={body.data.materials.find("well")})
vh._only(body)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(75), keep_sharp_edges=True)

surf = vh.Surface(body)


def side(s):
    """Rays onto the right (s = 1) or left (s = -1) flank: (u, v) = (y, z)."""
    return (lambda u, v: V((s * 2.0, u, v))), V((-s, 0, 0))


TOP = (lambda u, v: V((u, v, 3.0))), V((0, 0, -1))  # (u, v) = (x, y)
NOSE = (lambda u, v: V((u, 3.5, v))), V((0, -1, 0))  # (u, v) = (x, z)
TAIL = (lambda u, v: V((u, -3.5, v))), V((0, 1, 0))


def lay(name, poly, aim, mat, lift, thick=None, group="body"):
    bm = vh.panel(surf, poly, aim[0], aim[1], lift, lift if thick is None else thick)
    return vh.part(name, bm, mat, smooth_angle=60, group=group, weld=False)


def P(*pts):
    return [V(p) for p in pts]


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
    zl = lambda y: ZB(y) + 0.028  # noqa: E731
    front = vh.outline(P((0.6, zl(0.6)), (0.12, 1.268), (-0.3, 1.275), (-0.3, zl(-0.3))), 4, 2)
    rear = vh.outline(P((-0.41, zl(-0.41)), (-0.41, 1.275), (-0.8, 1.262), (-1.05, zl(-1.05))), 4, 2)
    for tag, poly in (("front", front), ("rear", rear)):
        lay(f"frame_{tag}{s}", vh.grow(poly, 0.024), aim, M["trim"], 0.004)
        lay(f"glass_{tag}{s}", poly, aim, M["glass"], 0.007)
    # Black B-pillar and the mirror sail.
    lay(f"bpillar{s}", vh.outline(P((-0.29, zl(-0.29)), (-0.29, 1.28), (-0.42, 1.28), (-0.42, zl(-0.42))), 3, 1), aim, M["trim"], 0.005)
    lay(f"sail{s}", vh.outline(P((0.6, zl(0.6)), (0.74, zl(0.74) - 0.005), (0.6, 0.99)), 3, 1), aim, M["trim"], 0.005)

ws = vh.outline(P((-0.67, 0.71), (0.67, 0.71), (0.54, 0.13), (-0.54, 0.13)), 5, 2)
lay("frame_ws", vh.grow(ws, 0.026), TOP, M["trim"], 0.004)
lay("glass_ws", ws, TOP, M["glass"], 0.007)
rw = vh.outline(P((-0.58, -0.84), (0.58, -0.84), (0.66, -1.47), (-0.66, -1.47)), 5, 2)
lay("frame_rw", vh.grow(rw, 0.026), TOP, M["trim"], 0.004)
lay("glass_rw", rw, TOP, M["glass"], 0.007)

# ======================================================================== lamps and grille

for s in (-1, 1):
    hl = vh.outline(P((s * 0.24, 0.575), (s * 0.73, 0.585), (s * 0.73, 0.675), (s * 0.24, 0.665)), 4, 1)
    lay(f"hlbezel{s}", vh.grow(hl, 0.012), NOSE, M["trim"], 0.004)
    lay(f"headlamp{s}", hl, NOSE, M["lamp"], 0.008)
    lay(f"corner{s}", vh.outline(P((1.95, 0.585), (2.1, 0.59), (2.1, 0.67), (1.95, 0.675)), 4, 1), side(s), M["amber"], 0.006)
    tl = vh.outline(P((s * 0.32, 0.64), (s * 0.79, 0.645), (s * 0.79, 0.8), (s * 0.32, 0.8)), 4, 1)
    lay(f"tlbezel{s}", vh.grow(tl, 0.01), TAIL, M["trim"], 0.004)
    lay(f"taillamp{s}", tl, TAIL, M["tail"], 0.008)
    lay(f"tamber{s}", vh.outline(P((s * 0.21, 0.645), (s * 0.31, 0.645), (s * 0.31, 0.795), (s * 0.21, 0.795)), 3, 1), TAIL, M["amber"], 0.008)
    lay(f"reverse{s}", vh.outline(P((s * 0.135, 0.645), (s * 0.2, 0.645), (s * 0.2, 0.795), (s * 0.135, 0.795)), 3, 1), TAIL, M["reverse"], 0.008)
    lay(f"tside{s}", vh.outline(P((-2.06, 0.66), (-2.15, 0.665), (-2.15, 0.79), (-2.06, 0.79)), 3, 1), side(s), M["tail"], 0.006)
lay("garnish", vh.outline(P((-0.125, 0.65), (0.125, 0.65), (0.125, 0.79), (-0.125, 0.79)), 3, 1), TAIL, M["trim"], 0.005)
lay("grille", vh.outline(P((-0.22, 0.585), (0.22, 0.585), (0.22, 0.645), (-0.22, 0.645)), 4, 1), NOSE, M["trim"], 0.006)
loc, nor = surf.hit((0, 3.5, 0.615), (0, -1, 0))
bm = bmesh.new()
vh.torus(bm, loc + nor * 0.012, 1.0, 0.009, rx=0.05, ry=0.034, segs=24, around=6, rot=Matrix.Rotation(math.pi / 2, 4, "X"))
vh.part("emblem", bm, M["chrome"])
lay("intake", vh.outline(P((-0.36, 0.33), (0.36, 0.33), (0.38, 0.4), (-0.38, 0.4)), 4, 1), NOSE, M["trim"], 0.004)

# ======================================================================== strips, gaps and fittings

# Rub strips wrapping the bumpers, and along the doors with the player's line on them.
for end, z, y0 in (("front", 0.465, 1.85), ("rear", 0.42, -1.75)):
    sy = 1 if y0 > 0 else -1
    angles = [math.radians(-80 + 160 * i / 40) for i in range(41)]  # from behind the arches' reach
    rays = [(V((0, y0, z)), V((math.sin(a), sy * math.cos(a), 0))) for a in angles]
    vh.part(f"rub_{end}", vh.strip(surf, rays, 0.006, 0.014, 0.03), M["trim"], smooth_angle=50)
for s in (-1, 1):
    rays = [(V((0, 0.84 - 1.6 * i / 30, 0.55)), V((s, 0, 0))) for i in range(31)]
    vh.part(f"rub_side{s}", vh.strip(surf, rays, 0.004, 0.014, 0.032), M["trim"], smooth_angle=50)
    vh.part(f"accent{s}", vh.strip(surf, rays, -0.016, 0.006, 0.005, around=6, ex=1.0), M["accent"])

# Panel gaps: doors, hood, trunk, fuel flap.
for s in (-1, 1):
    aim = side(s)
    line(f"gap_door1{s}", [(0.8, 0.31), (0.8, ZB(0.8) - 0.025)], aim)
    line(f"gap_door2{s}", [(-0.33, 0.3), (-0.33, ZB(-0.33) - 0.02)], aim)
    line(f"gap_door3{s}", [(-0.82, 0.3), (-0.82, 0.66), (-0.92, 0.76), (-1.06, ZB(-1.06) - 0.02)], aim)
    line(f"gap_sill{s}", [(0.8, 0.32), (-0.82, 0.32)], aim)
    line(f"gap_hood{s}", [(s * 0.715, 0.77), (s * 0.722, 1.6), (s * 0.69, 2.06)], TOP)
    line(f"gap_trunk{s}", [(s * 0.74, -1.58), (s * 0.73, -2.0), (s * 0.66, -2.12)], TOP)
line("gap_hood", [(-0.72, 0.77), (0.72, 0.77)], TOP)
line("gap_hoodfront", [(-0.69, 2.06), (0.69, 2.06)], TOP)
line("gap_trunk", [(-0.74, -1.58), (0.74, -1.58)], TOP)
line("gap_trunkback", [(-0.7, 0.825), (0.7, 0.825)], TAIL)
lay("fuel", vh.outline(P((-1.6, 0.66), (-1.6, 0.8), (-1.75, 0.8), (-1.75, 0.66)), 3, 1), side(1), M["gap"], 0.001, 0.001)
lay("fuelpaint", vh.outline(P((-1.607, 0.667), (-1.607, 0.793), (-1.743, 0.793), (-1.743, 0.667)), 3, 1), side(1), M["paint"], 0.0025, 0.0025)

# Door handles.
for s in (-1, 1):
    for y in (-0.12, -0.6):
        lay(f"handle{s}{y}", vh.outline(P((y + 0.07, 0.76), (y + 0.07, 0.79), (y - 0.07, 0.79), (y - 0.07, 0.76)), 3, 1), side(s), M["trim"], 0.012)

# Mirrors: a black housing on a short arm off the sail.
for s in (-1, 1):
    loc, nor = surf.hit((s * 2, 0.66, 0.93), (-s, 0, 0))
    bm = bmesh.new()
    vh.box(bm, loc + V((s * 0.04, 0, 0)), (0.08, 0.05, 0.035))
    vh.part(f"mirrorarm{s}", bm, M["trim"], bevel=0.008)
    bm = bmesh.new()
    vh.ball(bm, loc + V((s * 0.11, -0.01, 0.025)), (0.075, 0.045, 0.06), 16)
    vh.part(f"mirror{s}", bm, M["trim"], smooth_angle=70)

# Wipers parked along the foot of the windscreen.
for x0, x1 in ((-0.6, -0.08), (-0.02, 0.5)):
    rays = [(V((x0 + (x1 - x0) * i / 10, 0.64 - 0.06 * i / 10, 3.0)), V((0, 0, -1))) for i in range(11)]
    bm = vh.strip(surf, rays, -0.006, 0.006, 0.009, around=6, ex=0.8)
    vh.part(f"wiper{x0}", bm, M["trim"], smooth_angle=60)

# Aerial on the right front wing.
loc, _ = surf.hit((0.7, 1.05, 3), (0, 0, -1))
bm = bmesh.new()
vh.cyl(bm, loc, loc + V((0, -0.18, 0.62)), 0.005, 0.003, 6)
vh.cyl(bm, loc - V((0, 0, 0.01)), loc + V((0, 0, 0.02)), 0.018, 0.014, 10)
vh.part("aerial", bm, M["trim"])

# Rear number plate and the tailpipe.
plate = vh.outline(P((-0.17, 0.448), (0.17, 0.448), (0.17, 0.612), (-0.17, 0.612)), 4, 1)
lay("platerecess", vh.grow(plate, 0.012), TAIL, M["trim"], 0.003)
lay("plate", plate, TAIL, M["plate"], 0.006)
loc, nor = surf.hit((0, -3.5, 0.53), (0, 1, 0))
vh.text("platetext", "3XR 95", 0.09, Matrix.Translation(loc + nor * 0.007), M["platetext"])
bm = bmesh.new()
vh.lathe(bm, [(-2.05, 0.034), (-2.24, 0.034), (-2.245, 0.03), (-2.1, 0.028)], 16, Matrix.Translation((0.5, 0, 0.25)), cap1=True)
vh.part("tailpipe", bm, M["chrome"], smooth_angle=50)
vh.marker("exhaust", (0.5, -2.25, 0.25))

# ======================================================================== wheels


def hubcap(group, m):
    bm = bmesh.new()
    vh.lathe(bm, [(0.0, 0.188), (0.01, 0.182), (0.018, 0.16), (0.026, 0.11), (0.03, 0.05), (0.031, 0.0)], 40, m)
    vh.part(f"{group}_cap", bm, M["hubcap"], smooth_angle=35, group=group)
    bm = bmesh.new()
    for k in range(8):
        a = k / 8 * TAU
        vh.box(bm, m @ V((0.105 * math.cos(a), 0.026, 0.105 * math.sin(a))), (0.05, 0.008, 0.018), m.to_3x3().to_4x4() @ Matrix.Rotation(-a, 4, "Y"))
    vh.part(f"{group}_slots", bm, M["rim"], bevel=0.004, group=group)
    bm = bmesh.new()
    vh.lathe(bm, [(0.03, 0.035), (0.036, 0.03), (0.04, 0.0)], 20, m)
    vh.part(f"{group}_centre", bm, M["chrome"], group=group)


for name, wy, s in (("wheel_FL", WHEEL_Y[0], -1), ("wheel_FR", WHEEL_Y[0], 1), ("wheel_RL", WHEEL_Y[1], -1), ("wheel_RR", WHEEL_Y[1], 1)):
    vh.wheel(name, (s * WHEEL_X, wy, WHEEL_R), s, WHEEL_R, 0.2, 0.185, {"rubber": M["rubber"], "rim": M["rim"]}, cap=hubcap)

# ======================================================================== bake, join, export


def tint(o, co, n):
    """A little road dust low on the flanks and behind the wheels."""
    if o["group"] != "body" or o.data.materials[0].name != "paint":
        return (1, 1, 1)
    dust = max(0.0, 1 - (co.z - 0.28) / 0.3) * 0.12
    return (1 - dust, 1 - dust * 1.05, 1 - dust * 1.15)


vh.bake_ao(ground=0.0, samples=96, distance=0.6, floor=0.42, tint=tint, pct=0.8)
nodes = vh.join_groups()
print("RESULT tris", vh.stats(), "nodes", sorted(nodes))
size = vh.export(OUT)
print(f"RESULT {OUT} {size // 1024} KB")

if PREVIEW:
    vh.preview(
        PREVIEW,
        "corolla",
        [("front", 35, 15, 8.5), ("side", 90, 5, 8.5), ("rear", 145, 18, 8.5), ("top", 0.01, 80, 9), ("nose", 15, 8, 3.2, (0, 1.9, 0.6)), ("wheel", 75, 3, 2.2, (0.8, 1.3, 0.35))],
        target=(0, 0, 0.7),
    )
