"""1989 Toyota Land Cruiser wagon (FJ62), in dark green, modelled in Blender.

    python tools/blender/landcruiser.py -- apps/game/src/render/models/landcruiser.glb [--preview DIR]

A tall, square-shouldered body shell with a flat hood level with the waist, an upright
glasshouse on thin pillars running right back to the tailgate, rain gutters along the roof,
and big arches with black fender flares. Laid on it: glass in black surrounds, a chrome-edged
grille with horizontal bars and the maker's name, four stacked rectangular headlamps in chrome
bezels, amber indicators and side markers, upright tail lamps, panel gaps round the doors,
hood and two-piece tailgate, handles and mirrors, a line in the player's colour along the
flanks, and a snorkel up the right-hand A-pillar. A heavy chrome front bumper, a black
wrap-round rear one, the plate and the tailpipe. Underneath: the ladder frame, both axles with
their differentials, and the fuel tank. On the roof: a black steel rack (rails, slats and a low
fence) carrying a strapped duffel and a jerry can. Big all-terrain tyres with chunky tread on
silver six-hole wheels.

Real proportions: 4.68 m long, 1.8 m wide, 1.8 m tall (2.1 m over the rack); the same
footprint, wheel positions and exhaust point as the code-built wagon it replaces.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402  isort: skip
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import kit  # noqa: E402
import vehicle as vh  # noqa: E402
from vehicle import TAU, V, keys  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[0] if argv else "landcruiser.glb"
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None

vh.reset()

M = {
    "paint": vh.material("paint", 0x1f3b2a, 0.36, 0.28),
    "under": vh.material("under", 0x1a1b1c, 0.85, 0.1),
    "well": vh.material("well", 0x0d0d0e, 0.95, 0.0),
    "trim": vh.material("trim", 0x141516, 0.65, 0.1),  # black rubber, plastic, flares
    "steel": vh.material("steel", 0x1c1d1f, 0.45, 0.6),  # black steel: rack, rear bumper
    "gap": vh.material("gap", 0x0c1610, 0.7, 0.0),
    "glass": vh.material("glass", 0x0d1626, 0.08, 0.9),
    "lamp": vh.material("lamp", 0xfff4d6, 0.2, 0.0, emit=(0xfff4d6, 1.3)),
    "amber": vh.material("amber", 0xff8a1a, 0.2, 0.0, emit=(0xff8a1a, 1.0)),
    "tail": vh.material("tail", 0xd01818, 0.2, 0.0, emit=(0xd01818, 1.6)),
    "chrome": vh.material("chrome", 0xdedfe3, 0.18, 1.0),
    "wheel": vh.material("wheel", 0xb9bcc2, 0.35, 0.6),
    "rim": vh.material("rim", 0x5d6066, 0.45, 0.5),
    "rubber": vh.material("rubber", 0x1b1b1d, 0.9, 0.0),
    "plate": vh.material("plate", 0xf6f3e8, 0.5, 0.0),
    "platetext": vh.material("platetext", 0x1c2a5a, 0.5, 0.0),
    "canvas": vh.material("canvas", 0x8a7448, 0.92, 0.0),
    "can": vh.material("can", 0x4b5a2e, 0.55, 0.25),
    "accent": vh.material("accent", 0xffffff, 0.5, 0.0, emit=(0xffffff, 1.0)),
}

# ======================================================================== the shell

WHEEL_Y = (1.42, -1.31)
WHEEL_R, WHEEL_X, ARCH_R = 0.4, 0.77, 0.52

W = lambda y: keys([(2.34, 0.85), (2.325, 0.882), (2.29, 0.898), (2.2, 0.902), (-2.2, 0.902), (-2.3, 0.895), (-2.34, 0.87)], y)  # noqa: E731
ZB = lambda y: keys([(2.34, 1.04), (2.325, 1.075), (2.29, 1.095), (2.2, 1.105), (0.95, 1.12), (-2.3, 1.13), (-2.34, 1.12)], y)  # noqa: E731
ZBOT = lambda y: keys([(2.34, 0.6), (2.32, 0.54), (2.27, 0.52), (2.1, 0.51), (-2.15, 0.51), (-2.3, 0.53), (-2.34, 0.58)], y)  # noqa: E731
ROOF = lambda y: keys([(0.62, 1.8), (-1.0, 1.812), (-2.2, 1.81), (-2.29, 1.8), (-2.325, 1.775), (-2.34, 1.74)], y)  # noqa: E731

WS0, WS1 = 0.95, 0.62  # windscreen base and top (y)


def _s(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def cabin(y):
    if y >= WS0:
        return 0.0
    if y >= WS1:
        return _s((WS0 - y) / (WS0 - WS1))
    return 1.0


def ztop_raw(y):
    if y >= WS0:
        return ZB(y) + 0.02
    if y >= WS1:
        t = (WS0 - y) / (WS0 - WS1)
        z0 = ZB(WS0) + 0.02
        return z0 + (ROOF(WS1) - z0) * (t + 0.06 * t * (1 - t))
    return ROOF(y)


def ZTOP(y):
    return sum(ztop_raw(y + d) for d in (-0.03, -0.015, 0, 0.015, 0.03)) / 5


RS, RBOT = 0.03, 0.05


def XG1(y):
    g = cabin(y)
    return (W(y) - RS - 0.04) * (1 - g) + 0.848 * g


def ring(y):
    g = cabin(y)
    return vh.car_ring(W(y), ZB(y), ZBOT(y), ZTOP(y), XG1(y), 0.02 + 0.035 * g, RS, RBOT, 0.012 + 0.012 * g, tuck=0.01, bulge=0.0)


ys = [2.34, 2.337, 2.33, 2.32, 2.305, 2.285, 2.26, 2.23]
y = 2.19
while y > -2.2:
    ys.append(y)
    y -= 0.04
ys += [-2.23, -2.26, -2.285, -2.305, -2.32, -2.33, -2.337, -2.34]
bm = bmesh.new()
vh.shell(bm, ys, ring)
body = vh.part("shell", bm, [M["paint"], M["under"]], smooth_angle=75)
for wy in WHEEL_Y:
    bm = bmesh.new()
    vh.cyl(bm, (-1.2, wy, WHEEL_R), (1.2, wy, WHEEL_R), ARCH_R, ARCH_R, 48)
    vh.cut(body, vh.solid_bm_object("arch", bm), M["well"])
    bpy.data.objects.remove(bpy.data.objects["arch"])
vh.face_materials(body, lambda c, n: 1 if n.z < -0.6 and c.z < 0.62 else None, keep={body.data.materials.find("well")})
vh._only(body)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(75), keep_sharp_edges=True)

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


def rect(u0, v0, u1, v1, per=3, rnd=1):
    return vh.outline(P((u0, v0), (u1, v0), (u1, v1), (u0, v1)), per, rnd)


def line(name, pts2, aim, width=0.005, lift=0.0015, mat=None):
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


# ======================================================================== glass, gutters, flares

ZW0, ZW1 = 1.165, 1.745  # side glass: bottom and top


def a_pillar(z):
    """y of the windscreen's side edge at height z (the side glass starts behind it)."""
    t = (z - ZB(WS0) - 0.02) / (ROOF(WS1) - ZB(WS0) - 0.02)
    return WS0 - (WS0 - WS1) * max(0.0, min(1.0, t))


for s in (-1, 1):
    aim = side(s)
    wins = [
        vh.outline(P((a_pillar(ZW0) - 0.07, ZW0), (a_pillar(ZW1) - 0.07, ZW1), (-0.27, ZW1), (-0.27, ZW0)), 4, 1),
        rect(-0.38, ZW0, -1.24, ZW1),
        rect(-1.37, ZW0, -2.17, ZW1),
    ]
    for i, poly in enumerate(wins):
        lay(f"frame{i}{s}", vh.grow(poly, 0.022), aim, M["trim"], 0.004)
        lay(f"glass{i}{s}", poly, aim, M["glass"], 0.007)
    # Rain gutter along the roof edge.
    rays = [(V((0, 0.6 - 2.88 * i / 40, 1.775)), V((s, 0, 0))) for i in range(41)]
    vh.part(f"gutter{s}", vh.strip(surf, rays, 0.004, 0.012, 0.01), M["paint"], smooth_angle=50)
    # Black flares over the arches.
    for wy in WHEEL_Y:
        pts = []
        for i in range(25):
            a = math.radians(8 + 164 * i / 24)
            pts.append(V((s * 0.915, wy + (ARCH_R + 0.03) * math.cos(a), WHEEL_R + (ARCH_R + 0.03) * math.sin(a))))
        bm = bmesh.new()
        kit.tube(bm, pts, [{"t": 0, "w": 0.035, "h": 0.06, "ex": 0.5}, {"t": 1, "w": 0.035, "h": 0.06, "ex": 0.5}], segs=32, around=10, up=(s, 0, 0))
        vh.part(f"flare{s}{wy}", bm, M["trim"], smooth_angle=50)

ws = vh.outline(P((-0.8, 1.2), (0.8, 1.2), (0.77, 1.75), (-0.77, 1.75)), 5, 2)
lay("frame_ws", vh.grow(ws, 0.022), NOSE, M["trim"], 0.004)
lay("glass_ws", ws, NOSE, M["glass"], 0.007)
rw = vh.outline(P((-0.74, 1.2), (0.74, 1.2), (0.72, 1.71), (-0.72, 1.71)), 5, 2)
lay("frame_rw", vh.grow(rw, 0.024), TAIL, M["trim"], 0.004)
lay("glass_rw", rw, TAIL, M["glass"], 0.007)

# ======================================================================== front and back

# Grille: black, framed in chrome, four chrome bars, the maker's name in the middle.
lay("grille", rect(-0.47, 0.69, 0.47, 1.03, 4), NOSE, M["trim"], 0.006)
for i in range(4):
    z = 0.735 + i * 0.087
    lay(f"bar{i}", rect(-0.46, z - 0.012, 0.46, z + 0.012, 4), NOSE, M["chrome"], 0.012)
for u0, v0, u1, v1 in ((-0.49, 1.025, 0.49, 1.05), (-0.49, 0.67, 0.49, 0.695), (-0.49, 0.67, -0.465, 1.05), (0.465, 0.67, 0.49, 1.05)):
    lay(f"gframe{u0}{v0}", rect(u0, v0, u1, v1, 2), NOSE, M["chrome"], 0.014)
loc, nor = surf.hit((0, 3.5, 0.86), (0, -1, 0))
lay("badge", rect(-0.2, 0.83, 0.2, 0.89, 3), NOSE, M["trim"], 0.016)
vh.text("name", "TOYOTA", 0.055, Matrix.Translation(loc + nor * 0.018) @ Matrix.Rotation(math.pi, 4, "Z"), M["chrome"], depth=0.003)
# Four stacked headlamps in chrome bezels, amber indicators below.
for s in (-1, 1):
    for z in (0.93, 0.79):
        lay(f"bezel{s}{z}", rect(s * 0.5, z - 0.07, s * 0.79, z + 0.07, 3), NOSE, M["chrome"], 0.008)
        lay(f"lamp{s}{z}", rect(s * 0.515, z - 0.055, s * 0.775, z + 0.055, 3), NOSE, M["lamp"], 0.013)
    lay(f"turn{s}", rect(s * 0.6, 0.61, s * 0.8, 0.68, 3), NOSE, M["amber"], 0.008)
    lay(f"marker{s}", rect(2.08, 0.84, 2.2, 0.9, 2), side(s), M["amber"], 0.005)
    lay(f"rmarker{s}", rect(-2.08, 0.84, -2.2, 0.9, 2), side(s), M["tail"], 0.005)
    # Upright tail lamps in the rear corners.
    lay(f"tailbezel{s}", rect(s * 0.72, 0.62, s * 0.86, 1.08, 3), TAIL, M["trim"], 0.004)
    lay(f"tail{s}", rect(s * 0.735, 0.72, s * 0.845, 1.065, 3), TAIL, M["tail"], 0.009)
    lay(f"tamber{s}", rect(s * 0.735, 0.635, s * 0.845, 0.71, 3), TAIL, M["amber"], 0.009)

# Bumpers: a heavy chrome channel in front on black brackets, black steel wrapping the back.
bm = bmesh.new()
vh.box(bm, (0, 2.43, 0.5), (1.92, 0.15, 0.2))
vh.part("bumper", bm, M["chrome"], bevel=0.035, segments=3)
bm = bmesh.new()
vh.box(bm, (0, 2.36, 0.5), (1.6, 0.06, 0.12))
for s in (-1, 1):
    vh.box(bm, (s * 0.45, 2.3, 0.47), (0.08, 0.2, 0.08))
vh.part("bumperback", bm, M["steel"], bevel=0.01)
bm = bmesh.new()
vh.box(bm, (0, -2.42, 0.5), (1.84, 0.14, 0.17))
for s in (-1, 1):
    vh.box(bm, (s * 0.895, -2.29, 0.5), (0.1, 0.36, 0.17))
vh.part("rearbumper", bm, M["steel"], bevel=0.025, segments=2)

# Plate and tailpipe.
plate = rect(-0.17, 0.7, 0.17, 0.865, 2)
lay("platerecess", vh.grow(plate, 0.015), TAIL, M["trim"], 0.003)
lay("plate", plate, TAIL, M["plate"], 0.006)
loc, nor = surf.hit((0, -3.5, 0.782), (0, 1, 0))
vh.text("platetext", "FJ62 89", 0.085, Matrix.Translation(loc + nor * 0.007), M["platetext"])
bm = bmesh.new()
vh.lathe(bm, [(-2.1, 0.04), (-2.38, 0.04), (-2.385, 0.035), (-2.2, 0.033)], 16, Matrix.Translation((0.55, 0, 0.4)), cap1=True)
vh.part("tailpipe", bm, M["chrome"], smooth_angle=50)
vh.marker("exhaust", (0.55, -2.46, 0.4))

# ======================================================================== sides

for s in (-1, 1):
    aim = side(s)
    # Doors: front, rear, and the two-piece tailgate at the back.
    line(f"gapA{s}", [(0.9, 0.56), (0.9, 1.1)], aim)
    line(f"gapB{s}", [(-0.32, 0.53), (-0.32, 1.1)], aim)
    line(f"gapC{s}", [(-1.22, 0.53), (-1.22, 0.86), (-1.3, 0.95), (-1.3, 1.1)], aim)
    line(f"gapsill{s}", [(0.9, 0.55), (-0.82, 0.55)], aim)
    line(f"hood{s}", [(s * 0.83, 0.96), (s * 0.835, 2.28)], TOP)
    for y in (0.5, -0.65):
        lay(f"handle{s}{y}", rect(y + 0.08, 0.985, y - 0.08, 1.025, 2), aim, M["trim"], 0.014)
    # The player's line along the flank, above the flares.
    line(f"accent{s}", [(2.25, 1.06), (-2.27, 1.06)], aim, width=0.007, lift=0.003, mat=M["accent"])
    # Mirrors on short arms at the front of the doors.
    loc, _ = surf.hit((s * 2, 0.86, 1.22), (-s, 0, 0))
    bm = bmesh.new()
    vh.box(bm, loc + V((s * 0.06, 0, 0)), (0.12, 0.03, 0.03))
    vh.part(f"mirrorarm{s}", bm, M["trim"], bevel=0.008)
    bm = bmesh.new()
    vh.box(bm, loc + V((s * 0.13, -0.02, 0.06)), (0.05, 0.12, 0.2))
    vh.part(f"mirror{s}", bm, M["trim"], bevel=0.015)
line("hoodfront", [(-0.83, 2.28), (0.83, 2.28)], TOP)
line("cowl", [(-0.83, 0.97), (0.83, 0.97)], TOP)
line("tailgate", [(-0.86, 1.12), (0.86, 1.12)], TAIL)
for s in (-1, 1):
    line(f"tailgate{s}", [(s * 0.7, 0.6), (s * 0.7, 1.11)], TAIL)

# Snorkel up the right-hand A-pillar, with its ram head facing forward.
bm = bmesh.new()
pts = [V((0.925, 1.3, 0.98)), V((0.95, 1.06, 1.06)), V((0.955, 0.95, 1.2)), V((0.955, 0.8, 1.55)), V((0.955, 0.72, 1.82))]
kit.tube(bm, pts, [{"t": 0, "w": 0.055, "h": 0.05}, {"t": 1, "w": 0.055, "h": 0.05}], segs=24, around=12, up=(1, 0, 0))
vh.part("snorkel", bm, M["trim"], smooth_angle=50)
bm = bmesh.new()
vh.box(bm, (0.955, 0.75, 1.88), (0.12, 0.16, 0.14))
vh.part("snorkelhead", bm, M["trim"], bevel=0.035, segments=3)
bm = bmesh.new()
vh.box(bm, (0.955, 0.832, 1.88), (0.085, 0.01, 0.08))
vh.part("snorkelmouth", bm, M["gap"], bevel=0.004)

# ======================================================================== underneath

bm = bmesh.new()
for s in (-1, 1):
    vh.box(bm, (s * 0.46, 0.0, 0.45), (0.09, 4.5, 0.13))
for y in (2.0, 0.4, -0.9, -2.1):
    vh.box(bm, (0, y, 0.45), (0.9, 0.08, 0.1))
vh.part("frame", bm, M["under"], bevel=0.01)
for wy in WHEEL_Y:
    bm = bmesh.new()
    vh.cyl(bm, (-0.66, wy, WHEEL_R), (0.66, wy, WHEEL_R), 0.055, 0.055, 12)
    vh.ball(bm, (0.12, wy, WHEEL_R), (0.16, 0.17, 0.15), 16)
    vh.part(f"axle{wy}", bm, M["under"], smooth_angle=50)
bm = bmesh.new()
vh.box(bm, (-0.15, -1.85, 0.47), (0.7, 0.5, 0.2))
vh.part("tank", bm, M["under"], bevel=0.03)

# ======================================================================== roof rack and load

RACK = 1.97
bm = bmesh.new()
rail = lambda pts: kit.tube(bm, pts, [{"t": 0, "w": 0.022, "h": 0.022, "ex": 0.6}, {"t": 1, "w": 0.022, "h": 0.022, "ex": 0.6}], segs=max(2, int((V(pts[-1]) - V(pts[0])).length / 0.15)), around=8, up=(0, 0, 1))  # noqa: E731
for s in (-1, 1):
    rail([(s * 0.75, 0.42, RACK), (s * 0.75, -2.05, RACK)])
    rail([(s * 0.75, 0.42, RACK + 0.11), (s * 0.75, -2.05, RACK + 0.11)])
    for y in (0.42, -0.4, -1.23, -2.05):
        rail([(s * 0.75, y, RACK - 0.01), (s * 0.75, y, RACK + 0.12)])
    for y in (0.3, -0.85, -1.95):
        rail([(s * 0.76, y, 1.81), (s * 0.75, y, RACK)])
for y in (0.42, -2.05):
    rail([(-0.75, y, RACK), (0.75, y, RACK)])
    rail([(-0.75, y, RACK + 0.11), (0.75, y, RACK + 0.11)])
for i in range(1, 7):
    y = 0.42 - 2.47 * i / 7
    rail([(-0.75, y, RACK - 0.01), (0.75, y, RACK - 0.01)])
vh.part("rack", bm, M["steel"], smooth_angle=50)

# Duffel bag: a soft roll, slightly squashed, with two straps over it.
bm = bmesh.new()
kit.tube(
    bm,
    [(-0.55, -0.1, RACK + 0.2), (-0.15, -0.12, RACK + 0.21), (0.25, -0.1, RACK + 0.2)],
    [{"t": 0, "w": 0.1, "h": 0.1}, {"t": 0.06, "w": 0.2, "h": 0.17}, {"t": 0.5, "w": 0.23, "h": 0.185}, {"t": 0.94, "w": 0.2, "h": 0.17}, {"t": 1, "w": 0.1, "h": 0.1}],
    segs=20,
    around=20,
    up=(0, 0, 1),
)
vh.part("duffel", bm, M["canvas"], smooth_angle=70)
for x in (-0.38, 0.08):
    pts = [(x, -0.1 + 0.25 * math.cos(a), RACK + 0.02 + 0.2 * max(0.0, math.sin(a)) + 0.01) for a in (math.radians(d) for d in range(-10, 191, 10))]
    bm = bmesh.new()
    kit.tube(bm, pts, [{"t": 0, "w": 0.025, "h": 0.004}, {"t": 1, "w": 0.025, "h": 0.004}], segs=24, around=6, up=(1, 0, 0))
    vh.part(f"strap{x}", bm, M["trim"], smooth_angle=60)

# Jerry can: pressed X on the sides, three handles on top, the spout cap.
JC = V((0.45, -1.5, RACK + 0.25))
bm = bmesh.new()
vh.box(bm, JC, (0.17, 0.34, 0.46))
vh.part("can", bm, M["can"], bevel=0.025, segments=3)
for s in (-1, 1):
    bm = bmesh.new()
    for a in (0.94, -0.94):
        vh.box(bm, JC + V((s * 0.087, 0, -0.02)), (0.01, 0.46, 0.03), Matrix.Rotation(a, 4, "X"))
    vh.part(f"canx{s}", bm, M["can"], bevel=0.004)
bm = bmesh.new()
for y in (-0.1, 0.0, 0.1):
    vh.box(bm, JC + V((0, y, 0.255)), (0.03, 0.02, 0.05))
vh.box(bm, JC + V((0, 0, 0.275)), (0.03, 0.24, 0.02))
vh.part("canhandles", bm, M["can"], bevel=0.006)
bm = bmesh.new()
vh.cyl(bm, JC + V((0, 0.13, 0.22)), JC + V((0, 0.16, 0.28)), 0.025, 0.025, 12)
vh.part("canspout", bm, M["trim"], bevel=0.005)

# ======================================================================== wheels


def six_hole(group, m):
    bm = bmesh.new()
    vh.lathe(bm, [(-0.01, 0.2), (0.0, 0.195), (0.012, 0.17), (0.02, 0.12), (0.028, 0.075), (0.03, 0.0)], 40, m)
    vh.part(f"{group}_face", bm, M["wheel"], smooth_angle=35, group=group)
    bm = bmesh.new()
    for k in range(6):
        a = k / 6 * TAU + TAU / 12
        c = m @ V((0.13 * math.cos(a), 0.024, 0.13 * math.sin(a)))
        n = (m.to_3x3() @ V((0, 1, 0))).normalized()
        vh.cyl(bm, c - n * 0.004, c + n * 0.004, 0.026, 0.026, 12)
    vh.part(f"{group}_holes", bm, M["rim"], group=group)
    bm = bmesh.new()
    for k in range(6):
        a = k / 6 * TAU
        c = m @ V((0.072 * math.cos(a), 0.03, 0.072 * math.sin(a)))
        n = (m.to_3x3() @ V((0, 1, 0))).normalized()
        vh.cyl(bm, c, c + n * 0.018, 0.011, 0.009, 6)
    vh.lathe(bm, [(0.03, 0.045), (0.05, 0.04), (0.058, 0.0)], 20, m)
    vh.part(f"{group}_hub", bm, M["chrome"], group=group)


for name, wy, s in (("wheel_FL", WHEEL_Y[0], -1), ("wheel_FR", WHEEL_Y[0], 1), ("wheel_RL", WHEEL_Y[1], -1), ("wheel_RR", WHEEL_Y[1], 1)):
    vh.wheel(name, (s * WHEEL_X, wy, WHEEL_R), s, WHEEL_R, 0.3, 0.2, {"rubber": M["rubber"], "rim": M["rim"]}, cap=six_hole, blocks=22)

# ======================================================================== bake, join, export


def tint(o, co, n):
    """Trail dust low on the body, thickest behind the wheels."""
    if o["group"] != "body" or o.data.materials[0].name not in ("paint", "trim"):
        return (1, 1, 1)
    dust = max(0.0, 1 - (co.z - 0.5) / 0.45) * 0.22
    for wy in WHEEL_Y:
        dust += 0.15 * max(0.0, 1 - abs(co.y - (wy - 0.6)) / 0.4) * max(0.0, 1 - (co.z - 0.5) / 0.5)
    dust = min(dust, 0.35)
    # Dust is lighter and warmer than dark green paint: lift it towards tan.
    return (1 + dust * 1.4, 1 + dust * 1.0, 1 + dust * 0.5)


vh.bake_ao(ground=0.0, samples=96, distance=0.7, floor=0.42, tint=tint, pct=0.8)
nodes = vh.join_groups()
print("RESULT tris", vh.stats(), "nodes", sorted(nodes))
size = vh.export(OUT)
print(f"RESULT {OUT} {size // 1024} KB")

if PREVIEW:
    vh.preview(
        PREVIEW,
        "landcruiser",
        [("front", 35, 15, 9.5), ("side", 90, 5, 9.5), ("rear", 145, 18, 9.5), ("top", 0.01, 80, 10), ("nose", 15, 6, 3.6, (0, 2.0, 0.9)), ("wheel", 75, 3, 2.4, (0.85, 1.42, 0.5))],
        target=(0, 0, 0.95),
    )
