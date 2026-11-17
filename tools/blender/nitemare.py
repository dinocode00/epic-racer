"""Westley's Hot Wheel: a candy-red widebody race coupe, modelled in Blender after a die-cast toy.

    python tools/blender/nitemare.py -- apps/game/src/render/models/nitemare.glb [--preview DIR]

A long, low muscle-car fastback on a race kit: one shell from nose to tail, the fenders flared
out over wide wheels, a long hood with a raised power dome, two louvred vents and a pair of
hood pins, a trapezoid grille between slim angular headlamps and a big black splitter jutting
out under the nose. A small scoop rides on the roof. The roof runs down in one sweep to a short
deck carrying a tall wing on two uprights, with end plates. At the back: three-bar tail lamps
either side of a black panel and a black diffuser with an exhaust in each corner (the boost
flames come out of them). Black side skirts with a line in the player's colour on top. On each
flank, white claw slashes rake up and back from the doors, with red tears through them and
TEAM NITEMARE along the bottom. Wheels: chrome five-double-spoke rims on low tyres.
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
OUT = argv[0] if argv else "nitemare.glb"
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None

vh.reset()

M = {
    "paint": vh.material("paint", 0xa8101a, 0.24, 0.45),  # candy-apple metallic red
    "under": vh.material("under", 0x2a2b2d, 0.85, 0.0),
    "well": vh.material("well", 0x0d0d0e, 0.95, 0.0),
    "trim": vh.material("trim", 0x161719, 0.65, 0.1),  # black plastic, carbon and rubber
    "gap": vh.material("gap", 0x3a1014, 0.7, 0.0),
    "glass": vh.material("glass", 0x0d1626, 0.08, 0.9),
    "livery": vh.material("livery", 0xf4f4f1, 0.35, 0.05),
    "tear": vh.material("tear", 0xb8121c, 0.35, 0.2),
    "ink": vh.material("ink", 0x141416, 0.5, 0.0),
    "lamp": vh.material("lamp", 0xfff4d6, 0.2, 0.0, emit=(0xfff4d6, 1.4)),
    "tail": vh.material("tail", 0xd01818, 0.2, 0.0, emit=(0xd01818, 1.6)),
    "chrome": vh.material("chrome", 0xdedfe3, 0.18, 1.0),
    "rim": vh.material("rim", 0x232427, 0.5, 0.4),
    "rubber": vh.material("rubber", 0x1b1b1d, 0.88, 0.0),
    "accent": vh.material("accent", 0xffffff, 0.5, 0.0, emit=(0xffffff, 1.0)),
}

# ======================================================================== the shell

FRONT, BACK = 2.4, -2.32
WHEEL_Y = (1.46, -1.36)  # front, rear axle
WHEEL_R, WHEEL_X, WHEEL_W = 0.34, 0.8, 0.32
ARCH_R = 0.39

# Half width: flared out over each wheel, pulled in a little along the doors.
W = lambda y: keys([(2.4, 0.62), (2.385, 0.72), (2.34, 0.82), (2.22, 0.9), (1.9, 0.955), (1.46, 0.975), (1.0, 0.955), (0.5, 0.925), (-0.4, 0.925), (-0.9, 0.955), (-1.36, 0.985), (-1.8, 0.965), (-2.1, 0.92), (-2.25, 0.86), (-2.3, 0.8), (-2.32, 0.72)], y)  # noqa: E731
# Waist: a long hood rising to the cowl, the deck high and square at the tail.
ZB = lambda y: keys([(2.4, 0.5), (2.37, 0.56), (2.3, 0.62), (2.1, 0.68), (1.46, 0.79), (0.6, 0.86), (0.0, 0.88), (-1.0, 0.9), (-1.7, 0.93), (-2.1, 0.94), (-2.25, 0.92), (-2.31, 0.86), (-2.32, 0.8)], y)  # noqa: E731
ZBOT = lambda y: keys([(2.4, 0.28), (2.37, 0.24), (2.3, 0.215), (2.1, 0.2), (-2.0, 0.2), (-2.2, 0.22), (-2.29, 0.26), (-2.32, 0.32)], y)  # noqa: E731

WS0, WS1 = 0.6, -0.22  # windscreen base and top (y)
RF, FB = -0.66, -1.78  # roof's back edge; foot of the fastback
ROOF = 1.26


def _s(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def cabin(y):
    """0 over the hood and deck, 1 under the roof, easing along the windscreen and fastback."""
    if y >= WS0 or y <= FB:
        return 0.0
    if y >= WS1:
        return _s((WS0 - y) / (WS0 - WS1))
    if y >= RF:
        return 1.0
    return _s((y - FB) / (RF - FB))


def ztop_raw(y):
    if y >= WS0:
        return ZB(y) + 0.03
    if y >= WS1:
        t = (WS0 - y) / (WS0 - WS1)
        z0 = ZB(WS0) + 0.03
        return z0 + (ROOF - z0) * (t + 0.2 * t * (1 - t))
    if y >= RF:
        return ROOF + 0.015 * math.sin(math.pi * (WS1 - y) / (WS1 - RF))
    if y >= FB:
        t = (RF - y) / (RF - FB)
        z1 = ZB(FB) + 0.03
        return ROOF - (ROOF - z1) * (t + 0.18 * t * (1 - t))
    return ZB(y) + 0.03


def ZTOP(y):
    return sum(ztop_raw(y + d) for d in (-0.05, -0.025, 0, 0.025, 0.05)) / 5


RS, RBOT = 0.05, 0.05


def XG1(y):
    g = cabin(y)
    return (W(y) - RS - 0.07) * (1 - g) + 0.64 * g


def ring(y):
    g = cabin(y)
    return vh.car_ring(W(y), ZB(y), ZBOT(y), ZTOP(y), XG1(y), 0.03 + 0.05 * g, RS, RBOT, 0.02 + 0.012 * g, tuck=0.04, bulge=0.004)


ys = [2.4, 2.396, 2.388, 2.375, 2.355, 2.328, 2.295, 2.255, 2.21]
y = 2.17
while y > -2.13:
    ys.append(y)
    y -= 0.04
ys += [-2.16, -2.2, -2.235, -2.26, -2.28, -2.295, -2.307, -2.315, -2.32]
bm = bmesh.new()
vh.shell(bm, ys, ring)
body = vh.part("shell", bm, [M["paint"], M["under"]], smooth_angle=72)

# Wheel arches: a short cylinder per wheel (the hood sits lower than a cut right through would
# allow), leaving dark wells.
for wy in WHEEL_Y:
    for s in (-1, 1):
        bm = bmesh.new()
        vh.cyl(bm, (s * 0.5, wy, WHEEL_R), (s * 1.4, wy, WHEEL_R), ARCH_R, ARCH_R, 48)
        vh.cut(body, vh.solid_bm_object("arch", bm), M["well"])
        bpy.data.objects.remove(bpy.data.objects["arch"])
vh.face_materials(body, lambda c, n: 1 if n.z < -0.6 and c.z < 0.35 else None, keep={body.data.materials.find("well")})
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
    # One long side window tapering into the fastback, split by a thin black pillar.
    front = vh.outline(P((0.48, zl(0.48)), (-0.12, 1.19), (-0.58, 1.2), (-0.58, zl(-0.58))), 4, 2)
    rear = vh.outline(P((-0.68, zl(-0.68)), (-0.68, 1.18), (-0.9, 1.13), (-1.3, zl(-1.3))), 4, 2)
    for tag, poly in (("front", front), ("rear", rear)):
        lay(f"frame_{tag}{s}", vh.grow(poly, 0.022), aim, M["trim"], 0.004)
        lay(f"glass_{tag}{s}", poly, aim, M["glass"], 0.007)

ws = vh.outline(P((-0.7, 0.56), (0.7, 0.56), (0.55, -0.17), (-0.55, -0.17)), 5, 2)
lay("frame_ws", vh.grow(ws, 0.028), TOP, M["trim"], 0.004)
lay("glass_ws", ws, TOP, M["glass"], 0.007)
rw = vh.outline(P((-0.52, -0.74), (0.52, -0.74), (0.62, -1.62), (-0.62, -1.62)), 5, 2)
lay("frame_rw", vh.grow(rw, 0.028), TOP, M["trim"], 0.004)
lay("glass_rw", rw, TOP, M["glass"], 0.007)

# ======================================================================== nose

# Trapezoid grille, wide at the bottom, between slim headlamps that sweep back at the corners.
grille = vh.outline(P((-0.5, 0.29), (0.5, 0.29), (0.42, 0.47), (-0.42, 0.47)), 4, 1)
lay("grillesurround", vh.grow(grille, 0.018), NOSE, M["trim"], 0.004)
lay("grille", grille, NOSE, M["ink"], 0.007)
for s in (-1, 1):
    hl = vh.outline(P((s * 0.47, 0.5), (s * 0.78, 0.47), (s * 0.82, 0.53), (s * 0.5, 0.55)), 3, 1)
    lay(f"hlbezel{s}", vh.grow(hl, 0.014), NOSE, M["trim"], 0.008)
    lay(f"headlamp{s}", hl, NOSE, M["lamp"], 0.014)
    # Brake-cooling inlets in the corners of the bumper.
    lay(f"inlet{s}", vh.outline(P((s * 0.58, 0.26), (s * 0.8, 0.26), (s * 0.8, 0.36), (s * 0.62, 0.36)), 3, 1), NOSE, M["ink"], 0.008)

# The splitter: a broad black blade under the nose, out past the bumper and the flares.
bm = bmesh.new()
pts = [V((-0.98, 2.04)), V((0.98, 2.04)), V((0.99, 2.3)), V((0.86, 2.47)), V((-0.86, 2.47)), V((-0.99, 2.3))]
vh.plate(bm, [(p.x, -p.y) for p in pts], 0.035, Matrix.Translation((0, 0, 0.17)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
vh.part("splitter", bm, M["trim"], bevel=0.008)
for s in (-1, 1):  # little end fences
    bm = bmesh.new()
    vh.box(bm, (s * 0.97, 2.22, 0.23), (0.02, 0.4, 0.09))
    vh.part(f"canard{s}", bm, M["trim"], bevel=0.006)

# ======================================================================== hood and roof

# Power dome: a raised panel down the middle of the hood, in body colour.
dome = vh.outline(P((-0.3, 0.68), (0.3, 0.68), (0.24, 2.0), (-0.24, 2.0)), 6, 2)
lay("dome", dome, TOP, M["paint"], 0.035, 0.05, rings=4)
# Louvred vents either side of it, and the hood pins near the front.
for s in (-1, 1):
    vent = vh.outline(P((s * 0.36, 1.25), (s * 0.66, 1.3), (s * 0.62, 1.78), (s * 0.38, 1.76)), 4, 1)
    lay(f"vent{s}", vent, TOP, M["ink"], 0.003)
    for k in range(5):
        yy = 1.33 + k * 0.095
        rays = [(V((s * (0.38 + 0.26 * i / 6), yy + 0.01 * i / 6, 3.0)), V((0, 0, -1))) for i in range(7)]
        vh.part(f"louvre{s}{k}", vh.strip(surf, rays, -0.004, 0.012, 0.008, around=6, ex=0.8), M["paint"], smooth_angle=60)
    loc, nor = surf.hit((s * 0.5, 2.08, 3), (0, 0, -1))
    bm = bmesh.new()
    vh.cyl(bm, loc - nor * 0.01, loc + nor * 0.025, 0.028, 0.026, 14)
    vh.part(f"pin{s}", bm, M["chrome"], smooth_angle=50)

# Roof scoop: a low hump along the middle of the roof with a dark mouth facing forward.
lay("roofscoop", vh.outline(P((-0.15, -0.16), (0.15, -0.16), (0.11, -0.66), (-0.11, -0.66)), 5, 2), TOP, M["paint"], 0.045, 0.06, rings=4)
loc, _ = surf.hit((0, -0.17, 3), (0, 0, -1))
bm = bmesh.new()
vh.box(bm, (0, -0.152, loc.z + 0.03), (0.24, 0.012, 0.03))
vh.part("scoopmouth", bm, M["ink"], bevel=0.006)

# Panel gaps: doors, hood, deck lid.
for s in (-1, 1):
    aim = side(s)
    line(f"gap_door1{s}", [(0.86, 0.3), (0.86, ZB(0.86) - 0.03)], aim)
    line(f"gap_door2{s}", [(-0.66, 0.3), (-0.66, ZB(-0.66) - 0.025)], aim)
    line(f"gap_hood{s}", [(s * 0.72, 0.66), (s * 0.78, 1.6), (s * 0.7, 2.24)], TOP)
    line(f"gap_deck{s}", [(s * 0.74, -1.8), (s * 0.72, -2.24)], TOP)
line("gap_hood", [(-0.72, 0.66), (0.72, 0.66)], TOP)
line("gap_deck", [(-0.74, -1.8), (0.74, -1.8)], TOP)

# Door handles and mirrors.
for s in (-1, 1):
    aim = side(s)
    lay(f"handle{s}", vh.outline(P((-0.36, 0.76), (-0.36, 0.785), (-0.52, 0.785), (-0.52, 0.76)), 3, 1), aim, M["ink"], 0.008)
    loc, nor = surf.hit((s * 2, 0.5, 0.92), (-s, 0, 0))
    bm = bmesh.new()
    vh.box(bm, loc + V((s * 0.04, 0, 0)), (0.08, 0.05, 0.03))
    vh.part(f"mirrorarm{s}", bm, M["trim"], bevel=0.008)
    bm = bmesh.new()
    vh.ball(bm, loc + V((s * 0.11, -0.02, 0.03)), (0.075, 0.05, 0.05), 16)
    vh.part(f"mirror{s}", bm, M["paint"], smooth_angle=70)

# ======================================================================== the livery

# White claw slashes on each flank, raking up and back from the doors; red tears through them.
# (u, v) = (y, z) on the side; the arches are kept clear.
SLASHES = [
    # The broad white sweep along the bottom of the doors.
    [(0.98, 0.28), (-0.92, 0.28), (-0.92, 0.42), (0.2, 0.46), (0.78, 0.38)],
    # Claws rising from it, leaning back.
    [(0.66, 0.4), (0.4, 0.44), (-0.02, 0.66), (0.03, 0.665)],
    [(0.36, 0.45), (0.1, 0.46), (-0.38, 0.79), (-0.33, 0.8)],
    [(0.04, 0.46), (-0.24, 0.45), (-0.66, 0.74), (-0.6, 0.75)],
    [(-0.3, 0.44), (-0.6, 0.43), (-0.9, 0.79), (-0.86, 0.8)],
    [(-0.66, 0.42), (-0.9, 0.42), (-0.96, 0.58), (-0.93, 0.6)],
    # Shards on the rear quarter behind the wheel, and on the front fender.
    [(-1.84, 0.34), (-1.98, 0.34), (-2.24, 0.68), (-2.2, 0.7)],
    [(-1.86, 0.52), (-1.96, 0.5), (-2.2, 0.83), (-2.16, 0.84)],
    [(1.06, 0.6), (0.96, 0.58), (0.84, 0.8), (0.87, 0.81)],
    [(0.98, 0.42), (0.9, 0.42), (0.8, 0.62), (0.83, 0.63)],
]
TEARS = [
    [(0.5, 0.45), (0.44, 0.46), (0.06, 0.64), (0.08, 0.64)],
    [(0.2, 0.48), (0.14, 0.48), (-0.3, 0.76), (-0.28, 0.76)],
    [(-0.12, 0.47), (-0.18, 0.47), (-0.58, 0.72), (-0.56, 0.72)],
    [(-0.48, 0.45), (-0.53, 0.45), (-0.84, 0.76), (-0.82, 0.76)],
    [(0.7, 0.33), (-0.4, 0.3), (-0.4, 0.315), (0.68, 0.345)],
]
for s in (-1, 1):
    aim = side(s)
    for i, poly in enumerate(SLASHES):
        lay(f"slash{s}_{i}", vh.outline(P(*poly), 3, 1), aim, M["livery"], 0.003, rings=3)
    for i, poly in enumerate(TEARS):
        lay(f"tear{s}_{i}", vh.outline(P(*poly), 3, 1), aim, M["tear"], 0.0045, rings=2)


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
            v.co = loc + n * (0.0045 + depth + off)
    return obj


for s in (-1, 1):
    loc, nor = surf.hit((s * 2, 0.02, 0.37), (-s, 0, 0))
    letter(f"team{s}", "TEAM NITEMARE", 0.085, loc, nor, (0, 0, 1), M["ink"])

# Side skirts, with the player's colour along the top.
for s in (-1, 1):
    bm = bmesh.new()
    vh.box(bm, (s * 0.93, -0.06, 0.23), (0.09, 1.86, 0.07))
    vh.part(f"skirt{s}", bm, M["trim"], bevel=0.015)
    bm = bmesh.new()
    vh.box(bm, (s * 0.972, -0.06, 0.272), (0.012, 1.8, 0.014))
    vh.part(f"accent{s}", bm, M["accent"], bevel=0.004)

# ======================================================================== tail

# Black panel across the tail with three-bar lamps either side.
lay("tailpanel", vh.outline(P((-0.82, 0.6), (0.82, 0.6), (0.8, 0.82), (-0.8, 0.82)), 5, 1), TAIL, M["ink"], 0.004)
for s in (-1, 1):
    for k in range(3):
        x0 = s * (0.38 + k * 0.13)
        bar = vh.outline(P((x0 - 0.045, 0.63), (x0 + 0.045, 0.63), (x0 + 0.045, 0.79), (x0 - 0.045, 0.79)), 3, 1)
        lay(f"tailbar{s}{k}", bar, TAIL, M["tail"], 0.008)
# A strip of red across the lip of the deck, under the wing.
lay("ducktail", vh.outline(P((-0.6, 0.86), (0.6, 0.86), (0.6, 0.89), (-0.6, 0.89)), 4, 1), TAIL, M["trim"], 0.006)

# Diffuser and exhausts.
bm = bmesh.new()
vh.box(bm, (0, -2.25, 0.26), (1.7, 0.2, 0.14))
vh.part("diffuser", bm, M["trim"], bevel=0.02)
for k in range(5):
    bm = bmesh.new()
    vh.box(bm, (-0.36 + k * 0.18, -2.35, 0.24), (0.015, 0.12, 0.1))
    vh.part(f"strake{k}", bm, M["trim"], bevel=0.004)
for s in (-1, 1):
    bm = bmesh.new()
    vh.lathe(bm, [(-2.05, 0.05), (-2.4, 0.05), (-2.405, 0.045), (-2.25, 0.04)], 18, Matrix.Translation((s * 0.66, 0, 0.25)), cap1=True)
    vh.part(f"tip{s}", bm, M["chrome"], smooth_angle=50)
    vh.marker("exhaust_L" if s < 0 else "exhaust_R", (s * 0.66, -2.41, 0.25))

# The wing: two uprights off the deck, a broad blade and end plates.
deck = surf.hit((0, -2.05, 3), (0, 0, -1))[0].z
WING_Z, WING_Y = 1.2, -2.08
for s in (-1, 1):
    bm = bmesh.new()
    vh.box(bm, (s * 0.46, WING_Y + 0.02, (deck + WING_Z) / 2), (0.04, 0.2, WING_Z - deck + 0.02), Matrix.Rotation(-0.12, 4, "X"))
    vh.part(f"upright{s}", bm, M["paint"], bevel=0.01)
bm = bmesh.new()
vh.box(bm, (0, WING_Y, WING_Z + 0.02), (1.88, 0.38, 0.045), Matrix.Rotation(-0.1, 4, "X"))
vh.part("wing", bm, M["paint"], bevel=0.018, segments=3)
bm = bmesh.new()
vh.box(bm, (0, WING_Y - 0.17, WING_Z + 0.06), (1.86, 0.03, 0.05))
vh.part("gurney", bm, M["paint"], bevel=0.008)
for s in (-1, 1):
    bm = bmesh.new()
    vh.box(bm, (s * 0.955, WING_Y - 0.02, WING_Z + 0.03), (0.035, 0.48, 0.24))
    vh.part(f"endplate{s}", bm, M["paint"], bevel=0.012)

# ======================================================================== wheels


def face(group, m):
    """Chrome five-double-spoke face over a dark barrel, with a chrome lip and centre cap."""
    bm = bmesh.new()
    vh.lathe(bm, [(-0.05, 0.255), (-0.03, 0.25), (-0.03, 0.0)], 40, m)
    vh.part(f"{group}_back", bm, M["rim"], smooth_angle=35, group=group)
    rot = m.to_3x3().to_4x4()
    bm = bmesh.new()
    for k in range(5):
        a = k / 5 * TAU
        r, t = V((math.cos(a), 0, math.sin(a))), V((-math.sin(a), 0, math.cos(a)))
        for d in (-0.032, 0.032):  # each spoke a pair of parallel bars
            c = r * 0.16 + t * d + V((0, 0.006, 0))
            vh.box(bm, m @ c, (0.2, 0.034, 0.04), rot @ Matrix.Rotation(-a, 4, "Y"))
    vh.part(f"{group}_spokes", bm, M["chrome"], bevel=0.009, group=group)
    bm = bmesh.new()
    vh.lathe(bm, [(-0.02, 0.272), (0.008, 0.272), (0.014, 0.262), (0.008, 0.245), (-0.02, 0.24)], 48, m)
    vh.part(f"{group}_lip", bm, M["chrome"], smooth_angle=50, group=group)
    bm = bmesh.new()
    vh.lathe(bm, [(-0.01, 0.07), (0.02, 0.065), (0.03, 0.045), (0.034, 0.0)], 24, m)
    vh.part(f"{group}_cap", bm, M["chrome"], group=group)


for name, wy, s in (("wheel_FL", WHEEL_Y[0], -1), ("wheel_FR", WHEEL_Y[0], 1), ("wheel_RL", WHEEL_Y[1], -1), ("wheel_RR", WHEEL_Y[1], 1)):
    vh.wheel(name, (s * WHEEL_X, wy, WHEEL_R), s, WHEEL_R, WHEEL_W, 0.27, {"rubber": M["rubber"], "rim": M["rim"]}, cap=face)

# ======================================================================== bake, join, export


def tint(o, co, n):
    """A little road dust low on the flanks."""
    if o["group"] != "body" or o.data.materials[0].name != "paint":
        return (1, 1, 1)
    dust = max(0.0, 1 - (co.z - 0.2) / 0.25) * 0.1
    return (1 - dust, 1 - dust * 1.05, 1 - dust * 1.15)


vh.bake_ao(ground=0.0, samples=96, distance=0.6, floor=0.42, tint=tint, pct=0.8)
nodes = vh.join_groups()
print("RESULT tris", vh.stats(), "nodes", sorted(nodes))
size = vh.export(OUT)
print(f"RESULT {OUT} {size // 1024} KB")

if PREVIEW:
    vh.preview(
        PREVIEW,
        "nitemare",
        [("front", 35, 15, 9), ("side", 270, 4, 9), ("rear", 150, 18, 9), ("top", 0.01, 80, 9.5), ("nose", 0, 6, 6), ("tail", 180, 8, 6), ("wheel", 75, 3, 2.4, (0.85, 1.46, 0.35))],
        target=(0, 0, 0.6),
    )
