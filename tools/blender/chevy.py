"""Grandpa's early-1990s Chevrolet C1500 pickup (GMT400: regular cab, long bed), in sky blue.

    python tools/blender/chevy.py -- apps/game/src/render/models/chevy.glb [--preview DIR]

The same truck that sits in the farm's wooden garage, built to the real one's measurements
(a 1988-93 C/K 1500 regular cab long bed: 131.5 in wheelbase, about 5.55 m long, 1.95 m wide
and 1.79 m tall). A slab-sided body with the GMT400's crisp body line running from the
headlamps to the tail lamps just over the wheel openings, the upper flank leaning in above it;
a long flat hood level with the fenders, a raked windscreen, a square cab with a sliding rear
window, and an eight-foot bed with a gap between it and the cab.

Laid on it: the 1988-93 Chevy face (a chrome-framed egg-crate grille with a bold crossbar and
the gold bow tie, four rectangular composite headlamps in a row, parking lamps under them),
a wrap-round chrome bumper with its black rub strip and air dam, cowl vent and wipers, the
mirror sails and big black mirrors, door, hood and fuel-door seams, handles and locks, amber
and red side markers, SILVERADO badges, the fender antenna, black rockers and wheel-opening
trim, and the player's colour along the body line. At the back: tall red tail lamps with
their reverse lamps, CHEVROLET across the tailgate with its handle, a chrome step bumper with
the plate in its notch. In the bed: ribbed floor, wheel housings, stake pockets. Underneath:
frame, axles, spare tyre and the tailpipe. Chrome-ringed styled wheels on road tyres.
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
OUT = argv[0] if argv else "chevy.glb"
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None

vh.reset()

M = {
    "paint": vh.material("paint", 0x86c0ea, 0.32, 0.25),
    "under": vh.material("under", 0x1a1b1c, 0.85, 0.1),
    "well": vh.material("well", 0x0d0d0e, 0.95, 0.0),
    "trim": vh.material("trim", 0x18191b, 0.6, 0.1),  # black plastic and rubber
    "gap": vh.material("gap", 0x16222c, 0.7, 0.0),
    "glass": vh.material("glass", 0x0d1626, 0.08, 0.9),
    "lamp": vh.material("lamp", 0xfff4d6, 0.2, 0.0, emit=(0xfff4d6, 1.3)),
    "amber": vh.material("amber", 0xff8a1a, 0.2, 0.0, emit=(0xff8a1a, 1.0)),
    "tail": vh.material("tail", 0xd01818, 0.2, 0.0, emit=(0xd01818, 1.6)),
    "reverse": vh.material("reverse", 0xf2f2ea, 0.2, 0.0),
    "chrome": vh.material("chrome", 0xdedfe3, 0.18, 1.0),
    "gold": vh.material("gold", 0xd9ad48, 0.3, 0.9),
    "wheel": vh.material("wheel", 0xc3c6cc, 0.35, 0.65),
    "rim": vh.material("rim", 0x4a4d52, 0.45, 0.5),
    "rubber": vh.material("rubber", 0x1b1b1d, 0.9, 0.0),
    "plate": vh.material("plate", 0xf6f3e8, 0.5, 0.0),
    "platetext": vh.material("platetext", 0x1c2a5a, 0.5, 0.0),
    "accent": vh.material("accent", 0xffffff, 0.5, 0.0, emit=(0xffffff, 1.0)),
}

# ======================================================================== the shell

WHEEL_Y = (1.84, -1.5)  # 131.5 in apart
WHEEL_R, WHEEL_X, WHEEL_W = 0.37, 0.815, 0.235  # P235/75R15 on a 1.63 m track
NOSE_Y, TAIL_Y = 2.66, -2.68
WS0, WS1 = 1.22, 0.6  # windscreen base and top (y)
CB = -0.06  # back of the cab
SLOT = (-0.066, -0.09)  # the gap between cab and bed
BED = (-0.14, -2.62)  # inside of the bed, front wall to tailgate
ZC = 0.95  # the body line
ZR = 1.785  # roof

W = lambda y: keys([(2.66, 0.94), (2.652, 0.958), (2.63, 0.97), (2.56, 0.975), (-2.6, 0.975), (-2.665, 0.972), (-2.68, 0.952)], y)  # noqa: E731
ZB = lambda y: keys([(2.66, 1.085), (2.65, 1.115), (2.62, 1.13), (2.4, 1.14), (1.3, 1.2), (WS0, 1.205), (-2.66, 1.205), (-2.68, 1.19)], y)  # noqa: E731
ZBOT = lambda y: keys([(2.66, 0.68), (2.64, 0.6), (2.55, 0.56), (2.3, 0.54), (-0.06, 0.52), (-0.1, 0.6), (-2.6, 0.6), (-2.66, 0.63), (-2.68, 0.66)], y)  # noqa: E731
ROOF = lambda y: keys([(WS1, ZR - 0.012), (WS1 - 0.08, ZR), (CB + 0.06, ZR - 0.004), (CB + 0.02, ZR - 0.02), (CB + 0.004, ZR - 0.045), (CB, ZR - 0.07)], y)  # noqa: E731


def _s(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def cabin(y):
    if y >= WS0 or y < CB:
        return 0.0
    if y >= WS1:
        return _s((WS0 - y) / (WS0 - WS1))
    return 1.0


def ztop(y):
    if y >= WS0 or y < CB:
        return ZB(y) + 0.012
    if y >= WS1:
        t = (WS0 - y) / (WS0 - WS1)
        t = t * t * 0.08 + t * 0.92 if t < 1 else 1.0  # a hint of curve into the roof
        z0 = ZB(WS0) + 0.012
        return z0 + (ROOF(WS1) - z0) * t
    return ROOF(y)


def ring(y):
    g = cabin(y)
    w, zb, zbot, zt = W(y), ZB(y), ZBOT(y), ztop(y)
    # Near the nose and tail the body line fades into the rounded ends.
    crease = 0.006 * _s((NOSE_Y - y) / 0.06) * _s((y - TAIL_Y) / 0.05)
    zc = min(ZC, zb - 0.06)
    rbot, rs = 0.04, 0.022
    wl, wu = w - 0.012, w - 0.032  # flank at the rocker and at the waist
    rr = 0.012 + 0.05 * g
    xg = (wu - rs - 0.015) * (1 - g) + 0.86 * g
    a = vh.seg((0, zbot), (wl - rbot, zbot), 5)
    b = vh.arc(wl - rbot, zbot + rbot, rbot, -math.pi / 2, 0, 4)
    c = vh.seg((wl, zbot + rbot), (w, zc - 0.01), 5)
    d = [(w, zc - 0.01), (w + crease, zc)]
    e = vh.seg((w + crease, zc), (wu, zb - rs), 6)
    f = vh.arc(wu - rs, zb - rs, rs, 0, math.pi / 2, 4)
    h = vh.seg((wu - rs, zb), (xg, zt - rr), 9)
    k = vh.arc(xg - rr, zt - rr, rr, 0, math.pi / 2, 5)
    crown = 0.018 * g + 0.01 * (1 - g) * (y > WS0)
    top = [(x, zt + crown * (1 - (x / (xg - rr)) ** 2)) for x, _ in vh.seg((xg - rr, zt), (0, zt), 9)]
    return vh.chain(a, b, c, d, e, f, h, k, top)


ys = [2.66, 2.657, 2.652, 2.645, 2.635, 2.62, 2.6, 2.575]
y = 2.54
while y > WS0 + 0.01:
    ys.append(y)
    y -= 0.05
y = WS0
while y > WS1:
    ys.append(y)
    y -= 0.03
ys.append(WS1)
y = WS1 - 0.04
while y > CB + 0.07:
    ys.append(y)
    y -= 0.05
ys += [CB + 0.06, CB + 0.04, CB + 0.025, CB + 0.012, CB + 0.004, CB, CB - 0.0005, SLOT[1] - 0.002]
y = -0.12
while y > -2.6:
    ys.append(y)
    y -= 0.05
ys += [-2.62, -2.64, -2.655, -2.665, -2.672, -2.677, -2.68]
bm = bmesh.new()
rows = vh.shell(bm, ys, ring)
# The flat nose and tailgate shade on their own, not blended into the rounded edges.
for end in (set(rows[0]), set(rows[-1])):
    for e in bm.edges:
        if e.verts[0] in end and e.verts[1] in end:
            e.smooth = False
body = vh.part("shell", bm, [M["paint"], M["under"]], smooth_angle=60)

# The gap between the cab and the bed, right through.
bm = bmesh.new()
vh.box(bm, (0, (SLOT[0] + SLOT[1]) / 2, 1.0), (2.4, SLOT[0] - SLOT[1], 2.0))
vh.cut(body, vh.solid_bm_object("slot", bm), M["gap"])
bpy.data.objects.remove(bpy.data.objects["slot"])
# The bed, down to its floor.
FLOOR = 0.74
bm = bmesh.new()
vh.box(bm, (0, (BED[0] + BED[1]) / 2, FLOOR + 1.0), (1.76, BED[0] - BED[1], 2.0))
vh.cut(body, vh.solid_bm_object("bed", bm), M["paint"])
bpy.data.objects.remove(bpy.data.objects["bed"])


def opening(u):
    """The wheel opening's top edge above the axle, u along the car from the axle: a broad
    arch, squarer than a circle, like the GMT400's."""
    a, h, p = 0.5, 0.465, 2.6
    q = 1 - abs(u / a) ** p
    return h * q ** (1 / p) if q > 0 else 0.0


ARCH = [(-0.5 + i / 30, opening(-0.5 + i / 30)) for i in range(31)]
for wy in WHEEL_Y:
    for s in (-1, 1):
        bm = bmesh.new()
        poly = [(u, v) for u, v in ARCH] + [(0.5, -0.6), (-0.5, -0.6)]
        vh.plate(bm, list(reversed(poly)), 0.7, Matrix.Translation((s * 0.95, wy, WHEEL_R)) @ Matrix.Rotation(-math.pi / 2, 4, "Z"))
        vh.cut(body, vh.solid_bm_object("arch", bm), M["well"])
        bpy.data.objects.remove(bpy.data.objects["arch"])
vh.face_materials(body, lambda c, n: 1 if n.z < -0.6 and c.z < 0.7 else None, keep={body.data.materials.find("well"), body.data.materials.find("gap")})
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


def badge(name, string, size, at, face, mat, depth=0.004):
    """Raised lettering standing on a flat panel: at a point, facing `face` (+x, -x or -y)."""
    turn = {(1, 0): math.pi / 2, (-1, 0): -math.pi / 2, (0, -1): 0.0}[(round(face[0]), round(face[1]))]
    return vh.text(name, string, size, Matrix.Translation(at) @ Matrix.Rotation(turn, 4, "Z"), mat, depth=depth)


# ======================================================================== glass

ZW0, ZW1 = 1.27, 1.71  # side glass: bottom and top


def a_pillar(z):
    """y of the windscreen's side edge at height z."""
    t = (z - ZB(WS0) - 0.012) / (ROOF(WS1) - ZB(WS0) - 0.012)
    return WS0 - (WS0 - WS1) * max(0.0, min(1.0, t))


SAIL = 0.17  # the mirror sail, the black triangle at the door glass's front corner
for s in (-1, 1):
    aim = side(s)
    yf0, yf1 = a_pillar(ZW0) - 0.07, a_pillar(ZW1) - 0.07
    apex = (a_pillar(ZW0 + 0.16) - 0.07, ZW0 + 0.16)
    win = vh.outline(P((yf0 - SAIL, ZW0), apex, (yf1, ZW1), (0.17, ZW1), (0.17, ZW0)), 4, 1)
    lay(f"frame{s}", vh.grow(win, 0.024), aim, M["trim"], 0.004)
    lay(f"glass{s}", win, aim, M["glass"], 0.007)
    sail = vh.outline(P((yf0, ZW0 - 0.01), (yf0 - SAIL - 0.01, ZW0 - 0.01), (apex[0] - 0.01, apex[1] - 0.015)), 3, 1)
    lay(f"sail{s}", sail, aim, M["trim"], 0.009)

ws = vh.outline(P((-0.8, 1.245), (0.8, 1.245), (0.74, 1.735), (-0.74, 1.735)), 5, 2)
lay("frame_ws", vh.grow(ws, 0.03), NOSE, M["trim"], 0.004)
lay("glass_ws", ws, NOSE, M["glass"], 0.007)
# Sliding rear window: two fixed panes either side of the sliding one.
rw = vh.outline(P((-0.72, 1.29), (0.72, 1.29), (0.71, 1.69), (-0.71, 1.69)), 5, 2)
lay("frame_rw", vh.grow(rw, 0.03), TAIL, M["trim"], 0.004)
lay("glass_rw", rw, TAIL, M["glass"], 0.007)
for x in (-0.24, 0.24):
    lay(f"slider{x}", rect(x - 0.014, 1.29, x + 0.014, 1.69, 2), TAIL, M["trim"], 0.012)
lay("latch", rect(-0.03, 1.47, 0.03, 1.52, 2), TAIL, M["chrome"], 0.016)

# Cowl vent at the foot of the screen, and the wipers resting on it.
lay("cowl", vh.outline(P((-0.8, WS0 + 0.035), (0.8, WS0 + 0.035), (0.8, WS0 - 0.04), (-0.8, WS0 - 0.04)), 4, 1), TOP, M["trim"], 0.004)
for i in range(16):
    x = -0.75 + i * 0.1
    line(f"vent{i}", [(x, WS0 + 0.02), (x + 0.05, WS0 + 0.02)], TOP, width=0.006, lift=0.006, mat=M["under"])
for x0 in (-0.62, 0.08):
    rays = [(V((x0 + 0.5 * i / 10, 3.5, 1.27 + 0.04 * i / 10)), V((0, -1, 0))) for i in range(11)]
    vh.part(f"wiper{x0}", vh.strip(surf, rays, -0.004, 0.008, 0.006), M["trim"], smooth_angle=50)

# ======================================================================== the face

FZ0, FZ1 = 0.79, 1.07  # grille surround: bottom and top
# Chrome surround round the whole face, black inside.
lay("grilleframe", rect(-0.905, FZ0, 0.905, FZ1, 4), NOSE, M["chrome"], 0.008)
lay("grille", rect(-0.88, FZ0 + 0.02, 0.88, FZ1 - 0.02, 4), NOSE, M["trim"], 0.012)
# Four rectangular composite headlamps in a row, chrome bezels, parking lamps under them.
for s in (-1, 1):
    for x0 in (0.52, 0.7):
        lay(f"bezel{s}{x0}", rect(s * x0, 0.935, s * (x0 + 0.17), 1.045, 2), NOSE, M["chrome"], 0.015)
        lay(f"lamp{s}{x0}", rect(s * (x0 + 0.012), 0.946, s * (x0 + 0.158), 1.034, 2), NOSE, M["lamp"], 0.02)
    lay(f"park{s}", rect(s * 0.53, 0.87, s * 0.86, 0.915, 2), NOSE, M["amber"], 0.016)
    lay(f"parkbar{s}", rect(s * 0.52, 0.915, s * 0.875, 0.93, 2), NOSE, M["chrome"], 0.017)
    lay(f"lowbar{s}", rect(s * 0.52, 0.845, s * 0.875, 0.865, 2), NOSE, M["chrome"], 0.017)
    # The surround's divider between the lamps and the grille.
    lay(f"divider{s}", rect(s * 0.495, FZ0 + 0.02, s * 0.515, FZ1 - 0.02, 2), NOSE, M["chrome"], 0.018)
# Egg-crate grille: chrome bars across and up, and the bold crossbar with the bow tie.
for z in (0.84, 1.0):
    lay(f"gbar{z}", rect(-0.49, z - 0.008, 0.49, z + 0.008, 4), NOSE, M["chrome"], 0.016)
for i in range(1, 8):
    x = -0.49 + i * 0.98 / 8
    for z0, z1 in ((FZ0 + 0.02, 0.89), (0.95, FZ1 - 0.02)):
        lay(f"gpost{i}{z0}", rect(x - 0.007, z0, x + 0.007, z1, 2), NOSE, M["chrome"], 0.016)
lay("crossbar", rect(-0.49, 0.892, 0.49, 0.948, 4), NOSE, M["chrome"], 0.022)
BOWTIE = [(-0.5, 0.075), (-0.16, 0.075), (-0.13, 0.19), (0.19, 0.19), (0.16, 0.075), (0.5, 0.075), (0.46, -0.075), (0.16, -0.075), (0.13, -0.19), (-0.19, -0.19), (-0.16, -0.075), (-0.46, -0.075)]
lay("bowtie_rim", [V((u * 0.19, 0.92 + v * 0.19)) for u, v in vh.grow([V(p) for p in BOWTIE], 0.035)], NOSE, M["chrome"], 0.027)
lay("bowtie", [V((u * 0.19, 0.92 + v * 0.19)) for u, v in BOWTIE], NOSE, M["gold"], 0.031)
# Front corners: amber markers wrapping onto the fenders.
for s in (-1, 1):
    lay(f"marker{s}", rect(2.4, 0.99, 2.57, 1.04, 2), side(s), M["amber"], 0.005)

# Bumper: chrome, wrapping round the corners, a black rub strip, the air dam under it.
BZ0, BZ1 = 0.52, 0.76


def bumper_path(y0, wrap, half):
    pts = []
    for i in range(13):
        t = i / 12
        x = -half + 2 * half * t
        pts.append((x, y0 + 0.012 * (1 - (x / half) ** 2), 0))
    out = []
    for s in (-1, 1):
        ends = [(s * (half + 0.03 * math.sin(a)), y0 - wrap * (1 - math.cos(a)), 0) for a in (math.radians(d) for d in (30, 60, 90))]
        if s < 0:
            out = list(reversed(ends)) + pts
        else:
            out = out + ends
    return out


def bumper(name, y0, z0, z1, half, wrap, mat, depth=0.08, segs=60):
    path = [V((x, y, (z0 + z1) / 2)) for x, y, _ in bumper_path(y0, wrap, half)]
    bm = bmesh.new()
    kit.tube(bm, path, [{"t": 0, "w": depth / 2, "h": (z1 - z0) / 2, "ex": 0.35}, {"t": 1, "w": depth / 2, "h": (z1 - z0) / 2, "ex": 0.35}], segs=segs, around=24, up=(0, 0, 1))
    return vh.part(name, bm, mat, smooth_angle=50)


bumper("bumper", NOSE_Y + 0.07, BZ0, BZ1, 0.93, 0.16, M["chrome"], depth=0.1)
bumper("rubstrip", NOSE_Y + 0.12, 0.6, 0.66, 0.92, 0.16, M["trim"], depth=0.03)
bumper("airdam", NOSE_Y - 0.02, 0.4, 0.52, 0.86, 0.1, M["trim"], depth=0.08)
for s in (-1, 1):
    bm = bmesh.new()
    vh.box(bm, (s * 0.5, NOSE_Y - 0.08, 0.6), (0.08, 0.3, 0.1))
    vh.part(f"bumperbracket{s}", bm, M["under"], bevel=0.01)

# ======================================================================== hood, doors, sides

line("hoodfront", [(-0.86, NOSE_Y - 0.04), (0.86, NOSE_Y - 0.04)], TOP)
for s in (-1, 1):
    aim = side(s)
    line(f"hood{s}", [(s * 0.86, WS0 + 0.05), (s * 0.86, NOSE_Y - 0.04)], TOP)
    # Door: front and back edges, the sill, and the seam round the window frame.
    line(f"doorA{s}", [(1.3, 0.56), (1.3, 1.2)], aim)
    line(f"doorB{s}", [(0.2, 0.56), (0.2, 1.2)], aim)
    line(f"doorsill{s}", [(1.3, 0.56), (0.2, 0.56)], aim)
    line(f"fender{s}", [(1.3, 1.2), (1.38, 1.2)], aim)
    # Handle (a chrome pull in a black cup) and the lock under it.
    lay(f"handlecup{s}", rect(0.26, 1.105, 0.43, 1.15, 2), aim, M["trim"], 0.006)
    lay(f"handle{s}", rect(0.28, 1.115, 0.41, 1.14, 2), aim, M["chrome"], 0.014)
    loc, nor = surf.hit((s * 2, 0.34, 1.07), (-s, 0, 0))
    bm = bmesh.new()
    vh.cyl(bm, loc, loc + nor * 0.008, 0.013, 0.013, 12)
    vh.part(f"lock{s}", bm, M["chrome"])
    # SILVERADO on the front fender, behind the wheel.
    loc, nor = surf.hit((s * 2, 1.53, 1.06), (-s, 0, 0))
    badge(f"silverado{s}", "SILVERADO", 0.05, loc + nor * 0.002, (s, 0), M["chrome"], 0.004)
    # Red markers at the back of the bed.
    lay(f"rmarker{s}", rect(-2.4, 0.99, -2.55, 1.04, 2), aim, M["tail"], 0.005)
    # The player's colour along the body line, nose to tail.
    line(f"accent{s}", [(NOSE_Y - 0.04, ZC - 0.022), (-0.06, ZC - 0.022)], aim, width=0.006, lift=0.0025, mat=M["accent"])
    line(f"accentb{s}", [(SLOT[1] - 0.01, ZC - 0.022), (TAIL_Y + 0.04, ZC - 0.022)], aim, width=0.006, lift=0.0025, mat=M["accent"])
    # Black rockers under the cab and the bed (the lower tone).
    for y0, y1 in ((1.36, 0.0), (-0.12, -1.0), (-2.0, -2.62)):
        lay(f"rocker{s}{y0}", rect(y0, ZBOT(y0) + 0.01, y1, ZBOT(y0) + 0.11, 3), aim, M["trim"], 0.006)
    lay(f"rockerf{s}", rect(2.6, 0.58, 2.34, 0.68, 2), aim, M["trim"], 0.006)
    # Wheel opening trim: a thin black lip round each arch.
    for wy in WHEEL_Y:
        pts = []
        for i in range(31):
            u = -0.52 + 1.04 * i / 30
            pts.append(V((s * 0.955, wy - u, WHEEL_R + opening(u * 0.5 / 0.52) + 0.02)))
        pts = [V((s * 0.955, wy + 0.52, ZBOT(wy + 0.52) + 0.02))] + pts + [V((s * 0.955, wy - 0.52, ZBOT(wy - 0.52) + 0.02))]
        bm = bmesh.new()
        kit.tube(bm, pts, [{"t": 0, "w": 0.026, "h": 0.022, "ex": 0.5}, {"t": 1, "w": 0.026, "h": 0.022, "ex": 0.5}], segs=40, around=10, up=(s, 0, 0))
        vh.part(f"lip{s}{wy}", bm, M["trim"], smooth_angle=50)
    # Mirror: a big black rectangle on an arm off the sail.
    yf0 = a_pillar(ZW0) - 0.07 - SAIL * 0.55
    loc, _ = surf.hit((s * 2, yf0, ZW0 + 0.04), (-s, 0, 0))
    bm = bmesh.new()
    vh.box(bm, loc + V((s * 0.07, 0, 0)), (0.14, 0.035, 0.035))
    vh.part(f"mirrorarm{s}", bm, M["trim"], bevel=0.01)
    bm = bmesh.new()
    vh.box(bm, loc + V((s * 0.19, -0.02, 0.07)), (0.17, 0.06, 0.25))
    vh.part(f"mirror{s}", bm, M["trim"], bevel=0.02, segments=3)
    bm = bmesh.new()
    vh.box(bm, loc + V((s * 0.19, -0.052, 0.07)), (0.145, 0.006, 0.22))
    vh.part(f"mirrorglass{s}", bm, M["glass"], bevel=0.004)
    # Cab-to-bed gap seen from above, and the stake pockets in the rails.
    for y0 in (-0.3, -1.04, -2.48):
        lay(f"stake{s}{y0}", rect(s * 0.889, y0 - 0.045, s * 0.913, y0 + 0.045, 2), TOP, M["well"], 0.001)

# Fuel door on the left of the bed, ahead of the wheel.
fd = rect(-0.56, 0.99, -0.76, 1.12, 3, 1)
line("fueldoor", [*fd, fd[0]], side(-1), width=0.004)
# Fender antenna, right side.
loc, nor = surf.hit((0.86, 1.48, 3.0), (0, 0, -1))
bm = bmesh.new()
vh.cyl(bm, loc - V((0, 0, 0.01)), loc + V((0, 0, 0.02)), 0.02, 0.016, 12)
vh.cyl(bm, loc, loc + V((0, -0.12, 0.78)), 0.0045, 0.003, 6)
vh.part("antenna", bm, M["chrome"])

# ======================================================================== the bed

# Ribbed floor, wheel housings, and the inside of the tailgate.
for i in range(9):
    x = -0.72 + i * 0.18
    bm = bmesh.new()
    vh.box(bm, (x, (BED[0] + BED[1]) / 2, FLOOR + 0.008), (0.05, BED[0] - BED[1] - 0.02, 0.016))
    vh.part(f"rib{i}", bm, M["paint"], bevel=0.006)
for s in (-1, 1):
    bm = bmesh.new()
    prof = [(u, opening(u) + 0.04) for u, _ in ARCH]
    poly = [(u * 1.05, v) for u, v in prof] + [(0.53, FLOOR - WHEEL_R - 0.05), (-0.53, FLOOR - WHEEL_R - 0.05)]
    vh.plate(bm, list(reversed(poly)), 0.3, Matrix.Translation((s * 0.73, WHEEL_Y[1], WHEEL_R)) @ Matrix.Rotation(-math.pi / 2, 4, "Z"))
    vh.part(f"tub{s}", bm, M["paint"], bevel=0.02, segments=3)

# ======================================================================== the back

# Tailgate: its seams, CHEVROLET across it, the handle at the top.
for s in (-1, 1):
    line(f"tailgate{s}", [(s * 0.84, 0.66), (s * 0.84, 1.2)], TAIL)
    # Tall tail lamps on the ends of the bed sides: red, the reverse lamp, red.
    lay(f"tailbezel{s}", rect(s * 0.852, 0.7, s * 0.952, 1.17, 2), TAIL, M["trim"], 0.004)
    lay(f"tail{s}", rect(s * 0.862, 0.94, s * 0.942, 1.16, 2), TAIL, M["tail"], 0.01)
    lay(f"reverse{s}", rect(s * 0.862, 0.84, s * 0.942, 0.93, 2), TAIL, M["reverse"], 0.01)
    lay(f"taillow{s}", rect(s * 0.862, 0.71, s * 0.942, 0.83, 2), TAIL, M["tail"], 0.01)
line("tailgatelow", [(-0.84, 0.66), (0.84, 0.66)], TAIL)
lay("tgband", rect(-0.8, 1.115, 0.8, 1.125, 3), TAIL, M["paint"], 0.006)
lay("tghandlecup", rect(-0.11, 1.135, 0.11, 1.185, 2), TAIL, M["trim"], 0.004)
lay("tghandle", rect(-0.09, 1.145, 0.09, 1.172, 2), TAIL, M["chrome"], 0.012)
loc, nor = surf.hit((0, -3.5, 0.98), (0, 1, 0))
badge("chevrolet", "CHEVROLET", 0.12, loc + nor * 0.002, (0, -1), M["chrome"], 0.006)

# Step bumper: chrome, black step pads on top, the plate in its centre notch.
bumper("rearbumper", TAIL_Y - 0.075, 0.48, 0.66, 0.94, 0.1, M["chrome"], depth=0.13)
for x in (-0.6, 0.6):
    bm = bmesh.new()
    vh.box(bm, (x, TAIL_Y - 0.075, 0.665), (0.42, 0.1, 0.012))
    vh.part(f"steppad{x}", bm, M["trim"], bevel=0.004)
bm = bmesh.new()
vh.box(bm, (0, TAIL_Y - 0.135, 0.585), (0.36, 0.03, 0.16))
vh.part("platenotch", bm, M["trim"], bevel=0.01)
bm = bmesh.new()
vh.box(bm, (0, TAIL_Y - 0.152, 0.585), (0.31, 0.006, 0.15))
vh.part("plate", bm, M["plate"], bevel=0.004)
vh.text("platetext", "FARM 93", 0.075, Matrix.Translation((0, TAIL_Y - 0.157, 0.578)), M["platetext"])

# ======================================================================== underneath

bm = bmesh.new()
for s in (-1, 1):
    vh.box(bm, (s * 0.46, -0.1, 0.42), (0.08, 4.9, 0.16))
for y in (2.3, 0.6, -0.9, -2.5):
    vh.box(bm, (0, y, 0.42), (0.92, 0.07, 0.1))
vh.part("frame", bm, M["under"], bevel=0.01)
for wy in WHEEL_Y:
    bm = bmesh.new()
    vh.cyl(bm, (-0.7, wy, WHEEL_R), (0.7, wy, WHEEL_R), 0.05, 0.05, 12)
    if wy < 0:
        vh.ball(bm, (0.0, wy, WHEEL_R), (0.17, 0.18, 0.16), 16)
    vh.part(f"axle{wy}", bm, M["under"], smooth_angle=50)
bm = bmesh.new()
vh.cyl(bm, (0, 1.6, 0.4), (0, -1.45, 0.42), 0.04, 0.04, 10)
vh.part("driveshaft", bm, M["under"])
bm = bmesh.new()
vh.cyl(bm, (0.05, -2.28, 0.36), (0.05, -2.28, 0.6), 0.37, 0.37, 24)
vh.part("spare", bm, M["rubber"], bevel=0.05, segments=3)
bm = bmesh.new()
vh.box(bm, (-0.62, -0.75, 0.42), (0.3, 0.7, 0.25))
vh.part("tank", bm, M["under"], bevel=0.03)
# Exhaust: under the bed to the right rear corner, the tip just under the bumper.
bm = bmesh.new()
vh.sweep(bm, [(0.25, 0.9, 0.3), (0.3, -0.6, 0.32), (0.55, -1.0, 0.33), (0.6, -1.95, 0.36), (0.62, -2.62, 0.36)], 0.032, around=10)
vh.part("pipe", bm, M["under"], smooth_angle=50)
bm = bmesh.new()
vh.lathe(bm, [(-2.45, 0.036), (-2.7, 0.036), (-2.705, 0.03), (-2.5, 0.028)], 16, Matrix.Translation((0.62, 0, 0.36)), cap1=True)
vh.part("tailpipe", bm, M["chrome"], smooth_angle=50)
vh.marker("exhaust", (0.62, -2.74, 0.36))

# ======================================================================== wheels


def styled(group, m):
    """The Silverado's styled steel wheel: chrome trim ring, a silver face with six oblong
    windows, five lug nuts round a chrome centre cap."""
    n = (m.to_3x3() @ V((0, 1, 0))).normalized()
    bm = bmesh.new()
    vh.lathe(bm, [(-0.01, 0.205), (0.006, 0.2), (0.012, 0.185), (0.006, 0.168)], 48, m)
    vh.part(f"{group}_ring", bm, M["chrome"], smooth_angle=35, group=group)
    bm = bmesh.new()
    vh.lathe(bm, [(0.004, 0.17), (0.012, 0.14), (0.016, 0.1), (0.022, 0.07), (0.026, 0.0)], 40, m)
    vh.part(f"{group}_face", bm, M["wheel"], smooth_angle=35, group=group)
    bm = bmesh.new()
    for k in range(6):
        a = k / 6 * TAU
        r = Matrix.Rotation(a, 4, "Y")
        c = m @ r @ V((0.123, 0.018, 0))
        vh.box(bm, c, (0.05, 0.01, 0.022), (m @ r).to_3x3().to_4x4() @ Matrix.Rotation(math.pi / 2, 4, "Y"))
    vh.part(f"{group}_slots", bm, M["rim"], bevel=0.008, group=group)
    bm = bmesh.new()
    for k in range(5):
        a = k / 5 * TAU
        c = m @ V((0.072 * math.cos(a), 0.026, 0.072 * math.sin(a)))
        vh.cyl(bm, c, c + n * 0.016, 0.011, 0.009, 6)
    vh.lathe(bm, [(0.026, 0.048), (0.042, 0.044), (0.05, 0.03), (0.052, 0.0)], 24, m)
    vh.part(f"{group}_cap", bm, M["chrome"], group=group)


for name, wy, s in (("wheel_FL", WHEEL_Y[0], -1), ("wheel_FR", WHEEL_Y[0], 1), ("wheel_RL", WHEEL_Y[1], -1), ("wheel_RR", WHEEL_Y[1], 1)):
    vh.wheel(name, (s * WHEEL_X, wy, WHEEL_R), s, WHEEL_R, WHEEL_W, 0.205, {"rubber": M["rubber"], "rim": M["rim"]}, cap=styled)

# ======================================================================== bake, join, export


def tint(o, co, n):
    """Farm dust low on the body, thickest behind the wheels."""
    if o["group"] != "body" or o.data.materials[0].name not in ("paint", "trim"):
        return (1, 1, 1)
    dust = max(0.0, 1 - (co.z - 0.5) / 0.4) * 0.14
    for wy in WHEEL_Y:
        dust += 0.1 * max(0.0, 1 - abs(co.y - (wy - 0.6)) / 0.4) * max(0.0, 1 - (co.z - 0.5) / 0.45)
    dust = min(dust, 0.22)
    # Dust is warmer than sky-blue paint: pull it towards tan.
    return (1 + dust * 0.25, 1 - dust * 0.05, 1 - dust * 0.45)


vh.bake_ao(ground=0.0, samples=96, distance=0.7, floor=0.42, tint=tint, pct=0.8)
nodes = vh.join_groups()
print("RESULT tris", vh.stats(), "nodes", sorted(nodes))
size = vh.export(OUT)
print(f"RESULT {OUT} {size // 1024} KB")

if PREVIEW:
    vh.preview(
        PREVIEW,
        "chevy",
        [("front", 35, 15, 11), ("side", 90, 5, 11), ("rear", 145, 18, 11), ("top", 0.01, 80, 11.5), ("nose", 15, 6, 3.6, (0, 2.3, 0.9)), ("back", 165, 20, 4.2, (0, -2.4, 0.9))],
        target=(0, 0, 0.95),
    )
