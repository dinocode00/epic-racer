"""The DeLorean time machine (DMC-12), in brushed stainless steel, modelled in Blender.

    python tools/blender/delorean.py -- apps/game/src/render/models/delorean.glb [--preview DIR]

One wedge-shaped shell: the sharp, low nose rising along a flat hood to a steep windscreen, a
flat roof, and the fastback falling to the high rear deck, with crisp creases at the waist.
On it: tinted glass in black surrounds (the windscreen and the small gull-wing door windows),
the doors' seams running up the flanks and across the roof, black louvres over the fastback,
the black front band with its four rectangular headlamps and the slatted grille with its
lettering, amber indicators, black wrap-round bumpers, a black rubbing strip low on the flanks
and the driver's mirror. At the back, the black tail panel with louvred red lamps and the
OUTATIME plate. The time-machine kit: the reactor and Mr. Fusion on the rear deck, the two big
vents at the rear corners with glowing throats (the boost flames come out of them) and the
conduits along the flanks between the wheels, lit in the player's colour. Grey turbine wheels with ten slots;
wider tyres at the back.

Real proportions: 4.27 m long, 1.86 m wide, 1.14 m tall; the same footprint, wheel positions
and exhaust points as the code-built car it replaces.
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
OUT = argv[0] if argv else "delorean.glb"
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None

vh.reset()

M = {
    "paint": vh.material("paint", 0xb4b8bd, 0.36, 0.9),  # brushed stainless
    "under": vh.material("under", 0x2a2b2d, 0.85, 0.0),
    "well": vh.material("well", 0x0d0d0e, 0.95, 0.0),
    "trim": vh.material("trim", 0x161719, 0.7, 0.1),  # black plastic and rubber
    "dark": vh.material("dark", 0x3a3d42, 0.45, 0.7),  # the time machine's hardware
    "gap": vh.material("gap", 0x2c2e32, 0.7, 0.0),
    "glass": vh.material("glass", 0x0d1626, 0.08, 0.9),
    "lamp": vh.material("lamp", 0xfff4d6, 0.2, 0.0, emit=(0xfff4d6, 1.4)),
    "amber": vh.material("amber", 0xff8a1a, 0.2, 0.0, emit=(0xff8a1a, 1.0)),
    "tail": vh.material("tail", 0xd01818, 0.2, 0.0, emit=(0xd01818, 1.6)),
    "chrome": vh.material("chrome", 0xdedfe3, 0.18, 1.0),
    "fusion": vh.material("fusion", 0xf2f2ec, 0.4, 0.1),
    "rim": vh.material("rim", 0x3a3d42, 0.45, 0.7),
    "hub": vh.material("hub", 0xc3c6cb, 0.35, 0.8),
    "rubber": vh.material("rubber", 0x1b1b1d, 0.88, 0.0),
    "plate": vh.material("plate", 0xf4f2ea, 0.5, 0.0),
    "platetext": vh.material("platetext", 0x1c2a5a, 0.5, 0.0),
    "accent": vh.material("accent", 0xffffff, 0.5, 0.0, emit=(0xffffff, 1.0)),
}

# ======================================================================== the shell

FRONT, BACK = 2.13, -2.13
WHEEL_Y = (1.24, -1.22)
WHEEL_R, WHEEL_X, ARCH_R = 0.33, 0.76, 0.41

W = lambda y: keys([(2.13, 0.68), (2.115, 0.75), (2.05, 0.85), (1.8, 0.9), (0.8, 0.93), (-1.6, 0.93), (-2.05, 0.9), (-2.115, 0.86), (-2.13, 0.8)], y)  # noqa: E731
ZB = lambda y: keys([(2.13, 0.56), (2.08, 0.63), (1.9, 0.67), (1.2, 0.77), (0.82, 0.85), (0.3, 0.88), (-0.5, 0.9), (-1.45, 0.93), (-1.95, 0.94), (-2.08, 0.9), (-2.13, 0.82)], y)  # noqa: E731
ZBOT = lambda y: keys([(2.13, 0.35), (2.1, 0.3), (2.0, 0.275), (-2.0, 0.275), (-2.1, 0.29), (-2.13, 0.33)], y)  # noqa: E731

WS0, WS1 = 0.82, 0.3  # windscreen base and top (y)
RF, FB = -0.18, -1.52  # roof's back edge; foot of the fastback


def _s(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def cabin(y):
    if y >= WS0 or y <= FB:
        return 0.0
    if y >= WS1:
        return _s((WS0 - y) / (WS0 - WS1))
    if y >= RF:
        return 1.0
    return _s((y - FB) / (RF - FB))


def ztop_raw(y):
    if y >= WS0:
        return ZB(y) + 0.02
    if y >= WS1:
        t = (WS0 - y) / (WS0 - WS1)
        z0 = ZB(WS0) + 0.02
        return z0 + (1.14 - z0) * (t + 0.12 * t * (1 - t))
    if y >= RF:
        return 1.14 + 0.012 * math.sin(math.pi * (WS1 - y) / (WS1 - RF))
    if y >= FB:
        t = (RF - y) / (RF - FB)
        z1 = ZB(FB) + 0.02
        return 1.14 - (1.14 - z1) * t
    return ZB(y) + 0.02


def ZTOP(y):
    return sum(ztop_raw(y + d) for d in (-0.04, -0.02, 0, 0.02, 0.04)) / 5


RS, RBOT = 0.022, 0.045


def XG1(y):
    g = cabin(y)
    return (W(y) - RS - 0.05) * (1 - g) + 0.72 * g


def ring(y):
    g = cabin(y)
    return vh.car_ring(W(y), ZB(y), ZBOT(y), ZTOP(y), XG1(y), 0.02 + 0.03 * g, RS, RBOT, 0.008 + 0.008 * g, tuck=0.035, bulge=0.0)


ys = [2.13, 2.127, 2.12, 2.11, 2.095, 2.075, 2.05]
y = 2.01
while y > -2.02:
    ys.append(y)
    y -= 0.04
ys += [-2.05, -2.075, -2.095, -2.11, -2.12, -2.127, -2.13]
bm = bmesh.new()
vh.shell(bm, ys, ring)
body = vh.part("shell", bm, [M["paint"], M["under"]], smooth_angle=50)

# Wheel arches, a short cylinder per wheel (the hood sits low over the front ones).
for wy in WHEEL_Y:
    for s in (-1, 1):
        bm = bmesh.new()
        vh.cyl(bm, (s * 0.42, wy, WHEEL_R), (s * 1.3, wy, WHEEL_R), ARCH_R, ARCH_R, 48)
        vh.cut(body, vh.solid_bm_object("arch", bm), M["well"])
        bpy.data.objects.remove(bpy.data.objects["arch"])
vh.face_materials(body, lambda c, n: 1 if n.z < -0.6 and c.z < 0.4 else None, keep={body.data.materials.find("well")})
vh._only(body)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50), keep_sharp_edges=True)

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


def lettering(name, string, size, at, normal, up, mat, depth=0.003):
    """Raised letters on the body at `at`, facing `normal`, their top towards `up`."""
    n = V(normal).normalized()
    u = (V(up) - n * V(up).dot(n)).normalized()
    r = u.cross(n)
    rot = Matrix((r, -n, u)).transposed().to_4x4()
    return vh.text(name, string, size, Matrix.Translation(V(at) + n * (depth + 0.004)) @ rot, mat, depth)


# ======================================================================== glass

ws = vh.outline(P((-0.72, 0.8), (0.72, 0.8), (0.62, 0.32), (-0.62, 0.32)), 5, 2)
lay("frame_ws", vh.grow(ws, 0.03), TOP, M["trim"], 0.004)
lay("glass_ws", ws, TOP, M["glass"], 0.007)
for s in (-1, 1):
    aim = side(s)
    zl = lambda y: ZB(y) + 0.02  # noqa: E731
    # The gull-wing door's window, with the small lower pane ahead of it.
    win = vh.outline(P((0.66, zl(0.66)), (0.3, 1.1), (-0.2, 1.11), (-0.4, 1.0), (-0.4, zl(-0.4))), 4, 2)
    lay(f"frame_win{s}", vh.grow(win, 0.024), aim, M["trim"], 0.004)
    lay(f"glass_win{s}", win, aim, M["glass"], 0.007)
    lay(f"sail{s}", vh.outline(P((-0.5, zl(-0.5)), (-0.5, 1.03), (-0.9, zl(-0.9) + 0.06)), 3, 1), aim, M["trim"], 0.004)

# Louvres over the fastback.
for k in range(8):
    yk = -0.42 - k * 0.135
    half = 0.6 - 0.012 * k
    rays = [(V((-half + 2 * half * i / 20, yk, 3.0)), V((0, 0, -1))) for i in range(21)]
    vh.part(f"louvre{k}", vh.strip(surf, rays, 0.024, 0.04, 0.012, around=6, ex=0.4), M["trim"], smooth_angle=50)

# ======================================================================== front

lay("frontband", rect(-0.82, 0.43, 0.82, 0.575, 6, 1), NOSE, M["trim"], 0.004)
for s in (-1, 1):
    for x in (0.43, 0.66):
        lay(f"headlamp{s}{x}", rect(s * x - 0.1, 0.455, s * x + 0.1, 0.545, 3, 1), NOSE, M["lamp"], 0.009)
    lay(f"indicator{s}", rect(s * 0.6 - 0.07, 0.345, s * 0.6 + 0.07, 0.385, 3, 1), NOSE, M["amber"], 0.03)
for k in range(4):
    z = 0.46 + k * 0.025
    rays = [(V((-0.26 + 0.52 * i / 10, 3.5, z)), V((0, -1, 0))) for i in range(11)]
    vh.part(f"grillebar{k}", vh.strip(surf, rays, 0.0, 0.008, 0.005, around=6), M["dark"], smooth_angle=50)
loc, nor = surf.hit((0, 3.5, 0.51), (0, -1, 0))
lettering("dmc", "DMC", 0.07, loc + nor * 0.014, nor, (0, 0, 1), M["chrome"])

# Black bumpers wrapping both ends, and a rubbing strip low on each flank.
for end, z, y0 in (("front", 0.34, 1.6), ("rear", 0.34, -1.6)):
    sy = 1 if y0 > 0 else -1
    angles = [math.radians(-82 + 164 * i / 40) for i in range(41)]
    rays = [(V((0, y0, z)), V((math.sin(a), sy * math.cos(a), 0))) for a in angles]
    vh.part(f"bumper_{end}", vh.strip(surf, rays, 0.01, 0.035, 0.07), M["trim"], smooth_angle=50)
for s in (-1, 1):
    rays = [(V((0, 0.82 - 1.6 * i / 30, 0.36)), V((s, 0, 0))) for i in range(31)]
    vh.part(f"rub{s}", vh.strip(surf, rays, 0.005, 0.016, 0.04), M["trim"], smooth_angle=50)

# Door seams: up each flank and across the roof (the doors hinge at its middle), the hood.
for s in (-1, 1):
    aim = side(s)
    line(f"gap_door1{s}", [(0.8, 0.31), (0.8, ZB(0.8) - 0.01)], aim)
    line(f"gap_door2{s}", [(-0.5, 0.31), (-0.5, ZB(-0.5) - 0.01)], aim)
    line(f"gap_sill{s}", [(0.8, 0.31), (-0.5, 0.31)], aim)
    line(f"gap_roof{s}", [(s * 0.12, 0.32), (s * 0.12, RF + 0.02)], TOP)
    line(f"gap_hood{s}", [(s * 0.8, 0.86), (s * 0.78, 1.95)], TOP)
line("gap_hoodfront", [(-0.78, 1.95), (0.78, 1.95)], TOP)
line("gap_cowl", [(-0.8, 0.86), (0.8, 0.86)], TOP)

# The driver's mirror, and the door handle slots.
loc, nor = surf.hit((-2, 0.68, 0.92), (1, 0, 0))
bm = bmesh.new()
vh.box(bm, loc + V((-0.05, 0, 0.01)), (0.1, 0.05, 0.04))
vh.part("mirrorarm", bm, M["trim"], bevel=0.008)
bm = bmesh.new()
vh.box(bm, loc + V((-0.13, -0.01, 0.04)), (0.14, 0.09, 0.08))
vh.part("mirror", bm, M["trim"], bevel=0.02, segments=3)
for s in (-1, 1):
    lay(f"handle{s}", rect(-0.36, 0.8, -0.2, 0.825, 3, 1), side(s), M["trim"], 0.004)

# ======================================================================== back

lay("tailpanel", rect(-0.82, 0.55, 0.82, 0.82, 6, 1), TAIL, M["trim"], 0.004)
for s in (-1, 1):
    lay(f"taillamp{s}", rect(s * 0.56 - 0.21, 0.575, s * 0.56 + 0.21, 0.795, 4, 1), TAIL, M["tail"], 0.008)
    for k in range(4):
        z = 0.6 + k * 0.055
        rays = [(V((s * 0.56 - 0.22 + 0.44 * i / 10, -3.5, z)), V((0, 1, 0))) for i in range(11)]
        vh.part(f"tlouvre{s}{k}", vh.strip(surf, rays, -0.004, 0.009, 0.006, around=6), M["trim"], smooth_angle=50)
plate = rect(-0.17, 0.4, 0.17, 0.5, 3, 1)
lay("platerecess", vh.grow(plate, 0.012), TAIL, M["trim"], 0.006)
lay("plate", plate, TAIL, M["plate"], 0.01)
loc, nor = surf.hit((0, -3.5, 0.445), (0, 1, 0))
lettering("platetext", "OUTATIME", 0.05, loc + nor * 0.008, nor, (0, 0, 1), M["platetext"], 0.002)

# ======================================================================== the time machine

deck = lambda x, y: surf.hit((x, y, 3), (0, 0, -1))[0].z  # noqa: E731
DZ = deck(0, -1.8)
# The reactor, ribbed, across the rear deck.
bm = bmesh.new()
vh.box(bm, (0, -1.78, DZ + 0.08), (0.84, 0.44, 0.16))
vh.part("reactor", bm, M["dark"], bevel=0.02, segments=2)
for k in range(4):
    bm = bmesh.new()
    vh.box(bm, (0, -1.64 - k * 0.09, DZ + 0.165), (0.78, 0.03, 0.02))
    vh.part(f"rib{k}", bm, M["trim"], bevel=0.006)
# Mr. Fusion on its own pedestal.
bm = bmesh.new()
vh.lathe(bm, [(DZ + 0.16, 0.0), (DZ + 0.16, 0.13), (DZ + 0.4, 0.11), (DZ + 0.42, 0.085), (DZ + 0.5, 0.06), (DZ + 0.53, 0.0)], 24, Matrix.Translation((0, -1.88, 0)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
vh.part("fusion", bm, M["fusion"], smooth_angle=40)
bm = bmesh.new()
vh.ball(bm, (0, -1.88, DZ + 0.42), (0.1, 0.1, 0.06), 20)
vh.part("fusiontop", bm, M["chrome"], smooth_angle=60)
# The two vents at the rear corners, banded, with glowing throats, and the coil between.
for s in (-1, 1):
    vx = s * 0.62
    bm = bmesh.new()
    vh.lathe(bm, [(-1.66, 0.12), (-2.2, 0.14), (-2.24, 0.155), (-2.255, 0.15), (-2.24, 0.11), (-2.12, 0.1)], 24, Matrix.Translation((vx, 0, 1.04)), cap0=True)
    vh.part(f"vent{s}", bm, M["dark"], smooth_angle=45)
    for k in range(3):
        bm = bmesh.new()
        vh.torus(bm, (vx, -1.76 - k * 0.17, 1.04), 0.13 + 0.006 * k, 0.016, segs=24, around=6, rot=Matrix.Rotation(math.pi / 2, 4, "X"))
        vh.part(f"band{s}{k}", bm, M["trim"], smooth_angle=60)
    bm = bmesh.new()
    vh.cyl(bm, (vx, -2.14, 1.04), (vx, -2.2, 1.04), 0.1, 0.1, 20)
    vh.part(f"throat{s}", bm, M["amber"])
    # Support down to the deck.
    bm = bmesh.new()
    vh.box(bm, (vx, -1.85, (deck(vx, -1.85) + 0.95) / 2), (0.08, 0.16, 0.95 - deck(vx, -1.85) + 0.02))
    vh.part(f"ventfoot{s}", bm, M["trim"], bevel=0.01)
    vh.marker("exhaust_L" if s < 0 else "exhaust_R", (vx, -2.3, 1.04))
bm = bmesh.new()
vh.cyl(bm, (-0.5, -2.02, 1.0), (0.5, -2.02, 1.0), 0.026, 0.026, 10)
vh.part("coil", bm, M["trim"])
# The conduits down both flanks, lit in the player's colour.
for s in (-1, 1):
    pts = []
    for i in range(25):
        yy = 0.78 - 1.52 * i / 24
        loc, nor = surf.hit((s * 2, yy, 0.68), (-s, 0, 0))
        pts.append(loc + nor * 0.04)
    bm = bmesh.new()
    vh.sweep(bm, pts, 0.035, around=10)
    vh.part(f"conduit{s}", bm, M["dark"], smooth_angle=50)
    bm = bmesh.new()
    vh.sweep(bm, [p + V((s * 0.033, 0, 0)) for p in pts[1:-1]], 0.007, around=6)
    vh.part(f"accent{s}", bm, M["accent"])

# ======================================================================== wheels


def turbine(group, m):
    """A grey dish with ten slots round a silver centre."""
    bm = bmesh.new()
    vh.lathe(bm, [(0.0, 0.2), (0.01, 0.195), (0.018, 0.17), (0.024, 0.1), (0.026, 0.0)], 40, m)
    vh.part(f"{group}_dish", bm, M["hub"], smooth_angle=35, group=group)
    bm = bmesh.new()
    for k in range(10):
        a = k / 10 * TAU
        vh.box(bm, m @ V((0.12 * math.cos(a), 0.022, 0.12 * math.sin(a))), (0.07, 0.008, 0.026), m.to_3x3().to_4x4() @ Matrix.Rotation(-a, 4, "Y"))
    vh.part(f"{group}_slots", bm, M["rim"], bevel=0.006, group=group)
    bm = bmesh.new()
    vh.lathe(bm, [(0.024, 0.05), (0.034, 0.045), (0.04, 0.0)], 20, m)
    vh.part(f"{group}_centre", bm, M["chrome"], group=group)


for name, wy, s, wd in (("wheel_FL", WHEEL_Y[0], -1, 0.2), ("wheel_FR", WHEEL_Y[0], 1, 0.2), ("wheel_RL", WHEEL_Y[1], -1, 0.26), ("wheel_RR", WHEEL_Y[1], 1, 0.26)):
    vh.wheel(name, (s * WHEEL_X, wy, WHEEL_R), s, WHEEL_R, wd, 0.205, {"rubber": M["rubber"], "rim": M["rim"]}, cap=turbine)

# ======================================================================== bake, join, export


def tint(o, co, n):
    if o["group"] != "body" or o.data.materials[0].name != "paint":
        return (1, 1, 1)
    dust = max(0.0, 1 - (co.z - 0.27) / 0.3) * 0.12
    return (1 - dust, 1 - dust * 1.05, 1 - dust * 1.15)


vh.bake_ao(ground=0.0, samples=96, distance=0.6, floor=0.42, tint=tint, pct=0.8)
nodes = vh.join_groups()
print("RESULT tris", vh.stats(), "nodes", sorted(nodes))
size = vh.export(OUT)
print(f"RESULT {OUT} {size // 1024} KB")

if PREVIEW:
    vh.preview(
        PREVIEW,
        "delorean",
        [("front", 35, 15, 8.5), ("side", 90, 5, 8.5), ("rear", 145, 18, 8.5), ("top", 0.01, 80, 9), ("nose", 15, 8, 3.2, (0, 1.9, 0.5)), ("back", 165, 12, 3.4, (0, -2.0, 0.8))],
        target=(0, 0, 0.6),
    )
