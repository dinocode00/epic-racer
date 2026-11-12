"""The pod racer, modelled in Blender: two long turbine engines towing a little open cockpit.

    python tools/blender/podracer.py -- apps/game/src/render/models/podracer.glb [--preview DIR]

Engines: orange nacelles flaring to a big intake cowl with a lip, a spinning fan and spinner
inside, raised panel bands, a dorsal fairing with a scoop, slatted cooling vents, a ring in
the player's colour, a ribbed exhaust nozzle glowing blue, swept air-brake fins top and bottom,
and emitter prongs carrying the energy binder that arcs between the engines. Steel cables run
back to the cockpit.

Cockpit: a streamlined ochre tub with a blue stripe and a sunken seat, a blue rim round the
opening, a small curved windscreen, twin control levers, side scoops, tail fins and glowing
repulsor pads underneath. The pilot (flying cap, goggles, leather jacket) holds the levers.

Same footprint as the code-built pod it replaces: engines at x = +-1.0, 0.45 m up, intakes
3.4 m ahead of their nozzles; the game floats the whole thing on top of that.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402  isort: skip
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import vehicle as vh  # noqa: E402
from vehicle import TAU, V  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[0] if argv else "podracer.glb"
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None

vh.reset()

M = {
    "paint": vh.material("paint", 0xf0a22e, 0.36, 0.4),  # engine orange
    "cowl": vh.material("cowl", 0xd88e2a, 0.38, 0.45),  # intake cowl, a shade darker
    "hull": vh.material("hull", 0xd9a441, 0.35, 0.4),  # cockpit ochre
    "trim": vh.material("trim", 0x3f6fb0, 0.35, 0.45),  # blue
    "metal": vh.material("metal", 0x8a8f99, 0.38, 0.75),
    "dark": vh.material("dark", 0x161719, 0.7, 0.3),
    "chrome": vh.material("chrome", 0xdedfe3, 0.18, 1.0),
    "cable": vh.material("cable", 0x2a2a2a, 0.6, 0.3),
    "accent": vh.material("accent", 0xffffff, 0.5, 0.0, emit=(0xffffff, 1.0)),
    "glow": vh.material("glow", 0x000000, 0.5, 0.0, emit=(0x6fd0ff, 2.5)),
    "binder": vh.material("binder", 0x9fe6ff, 0.5, 0.0, emit=(0x9fe6ff, 3.0)),
    "glass": vh.material("glass", 0x0d1626, 0.08, 0.9),
    "seat": vh.material("seat", 0x3a2a20, 0.75, 0.05),
    "suit": vh.material("suit", 0x8a6a48, 0.9, 0.0),
    "leather": vh.material("leather", 0x7a5232, 0.75, 0.0),
    "glove": vh.material("glove", 0x6b4a2a, 0.7, 0.0),
    "skin": vh.material("skin", 0xe8b98f, 0.7, 0.0),
    "hair": vh.material("hair", 0x8a6a3a, 0.9, 0.0),
    "lens": vh.material("lens", 0x1a2a3a, 0.05, 0.9),
}

EX, EZ = 1.0, 0.45  # engine axis: x = +-EX, z = EZ
REAR = -0.3  # nozzle exit (y); the engine runs forward from here


def S(s):
    """Position along an engine (0 = nozzle exit) -> y."""
    return REAR + s


# ======================================================================== engines


def engine(side):
    x0 = side * EX
    at = Matrix.Translation((x0, 0, EZ))
    tag = "L" if side < 0 else "R"

    # Nacelle: the shell, the cowl flaring to a rounded lip and back inside to the fan.
    shell = [
        (0.0, 0.236), (0.05, 0.252), (0.16, 0.268), (0.4, 0.284), (0.8, 0.295), (1.2, 0.3),
        (1.6, 0.302), (2.0, 0.305), (2.3, 0.31), (2.5, 0.318),
    ]
    cowl = [
        (2.5, 0.318), (2.75, 0.33), (3.0, 0.35), (3.2, 0.372), (3.38, 0.39), (3.5, 0.398),
        (3.56, 0.4),
    ]
    lip = [
        (3.54, 0.392), (3.56, 0.412), (3.64, 0.418), (3.7, 0.414), (3.735, 0.4), (3.74, 0.382),
        (3.72, 0.366), (3.62, 0.352), (3.45, 0.34), (3.3, 0.336),
    ]
    rib = lambda th, i: 1.0 + (0.035 * max(0.0, math.cos(th * 12)) ** 3 if i < 3 else 0.0)  # noqa: E731
    bm = bmesh.new()
    vh.lathe(bm, [(S(s), r) for s, r in shell], 40, at, wobble=rib)
    vh.part(f"shell_{tag}", bm, M["paint"], smooth_angle=50, subdiv=0.18)
    bm = bmesh.new()
    vh.lathe(bm, [(S(s), r) for s, r in cowl], 40, at)
    vh.part(f"cowl_{tag}", bm, M["cowl"], smooth_angle=50)
    bm = bmesh.new()
    vh.lathe(bm, [(S(s), r) for s, r in lip], 40, at)
    vh.part(f"lip_{tag}", bm, M["metal"], smooth_angle=50)

    # Nozzle: ribbed petals curling in to the glowing core.
    bm = bmesh.new()
    vh.lathe(
        bm,
        [(S(0.0), 0.236), (S(-0.02), 0.226), (S(0.04), 0.205), (S(0.22), 0.19)],
        40,
        at,
        cap1=True,
        wobble=lambda th, i: 1.0 + 0.04 * math.cos(th * 12),
    )
    vh.part(f"nozzle_{tag}", bm, M["metal"], smooth_angle=60)
    bm = bmesh.new()
    vh.lathe(bm, [(S(0.12), 0.0), (S(0.12), 0.19)], 32, at)
    vh.part(f"core_{tag}", bm, M["glow"])
    bm = bmesh.new()
    vh.lathe(bm, [(S(0.15), 0.12), (S(-0.04), 0.05), (S(-0.06), 0.0)], 20, at)
    vh.part(f"cone_{tag}", bm, M["dark"])

    # Raised panel bands, and the band in the player's colour.
    for s in (0.62, 1.35, 2.05):
        bm = bmesh.new()
        vh.lathe(bm, [(S(s - 0.035), 0.299), (S(s - 0.03), 0.311), (S(s + 0.03), 0.311), (S(s + 0.035), 0.299)], 40, at)
        vh.part(f"band_{tag}{s}", bm, M["metal"], smooth_angle=40)
    bm = bmesh.new()
    vh.lathe(bm, [(S(2.36), 0.31), (S(2.37), 0.326), (S(2.45), 0.33), (S(2.46), 0.314)], 40, at)
    vh.part(f"accent_{tag}", bm, M["accent"])

    # Fan in the intake (its own node, so the game can spin it) and the dark duct behind it.
    vh.pivot(f"fan_{tag}", (x0, S(3.3), EZ))
    bm = bmesh.new()
    vh.lathe(bm, [(S(3.2), 0.0), (S(3.2), 0.336)], 40, at)
    vh.part(f"duct_{tag}", bm, M["dark"])
    bm = bmesh.new()
    vh.lathe(bm, [(S(3.24), 0.13), (S(3.32), 0.13), (S(3.42), 0.11), (S(3.52), 0.07), (S(3.58), 0.03), (S(3.6), 0.0)], 24, at, cap0=True)
    vh.part(f"spinner_{tag}", bm, M["chrome"], group=f"fan_{tag}", smooth_angle=60)
    bm = bmesh.new()
    n = 15
    for k in range(n):
        a0 = k / n * TAU
        quad = []
        for r, tw in ((0.12, 0.75), (0.33, 0.42)):
            for dy in (-0.045, 0.045):
                a = a0 + dy * math.tan(tw) / r * side
                quad.append(V((x0 + r * math.cos(a), S(3.3) + dy, EZ + r * math.sin(a))))
        vs = [bm.verts.new(p) for p in (quad[0], quad[1], quad[3], quad[2])]
        bm.faces.new(vs)
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.008)
    vh.part(f"blades_{tag}", bm, M["metal"], group=f"fan_{tag}", smooth_angle=30, weld=False)

    # Dorsal fairing with a scoop at its front.
    bm = bmesh.new()
    secs = []
    for s, w, h in ((0.55, 0.02, 0.0), (0.75, 0.07, 0.045), (1.3, 0.085, 0.07), (1.9, 0.085, 0.085), (2.25, 0.08, 0.09), (2.32, 0.075, 0.085)):
        secs.append({"y": S(s), "w": w, "top": EZ + 0.29 + h, "bottom": EZ + 0.22, "ex": 0.6, "x": x0})
    vh.loft(bm, secs, around=24)
    vh.part(f"spine_{tag}", bm, M["paint"], smooth_angle=45)
    bm = bmesh.new()
    vh.box(bm, (x0, S(2.33), EZ + 0.335), (0.12, 0.02, 0.06))
    vh.part(f"scoop_{tag}", bm, M["dark"], bevel=0.006)

    # Slatted cooling vent on the outer flank.
    xo = x0 + side * 0.3
    bm = bmesh.new()
    vh.box(bm, (xo, S(1.75), EZ + 0.02), (0.05, 0.5, 0.2))
    vh.part(f"ventbox_{tag}", bm, M["metal"], bevel=0.015)
    bm = bmesh.new()
    vh.box(bm, (xo + side * 0.023, S(1.75), EZ + 0.02), (0.012, 0.44, 0.15))
    vh.part(f"venthole_{tag}", bm, M["dark"])
    bm = bmesh.new()
    for k in range(6):
        vh.box(bm, (xo + side * 0.027, S(1.56 + k * 0.075), EZ + 0.02), (0.014, 0.02, 0.15), Matrix.Rotation(side * 0.5, 4, "Z"))
    vh.part(f"slats_{tag}", bm, M["metal"], bevel=0.003)

    # Swept air-brake fins above and below the tail, hinged on a small fairing.
    for up in (1, -1):
        outline = [(0.0, 0.0), (0.95, 0.0), (0.72, 0.24), (0.32, 0.4), (0.06, 0.42), (-0.06, 0.32)]
        m = Matrix.Translation((x0, S(0.05), EZ + up * 0.27)) @ Matrix.Rotation(-math.pi / 2, 4, "Z") @ Matrix.Diagonal((1, 1, up, 1))
        bm = bmesh.new()
        vh.plate(bm, [(-u, v) for u, v in outline], 0.035, m @ Matrix.Rotation(0.0, 4, "X"))
        # (the outline's u runs forward along the engine; rotate so u -> +y)
        vh.part(f"fin_{tag}{up}", bm, M["paint"], bevel=0.012, segments=2)
        bm = bmesh.new()
        vh.plate(bm, [(-u, v) for u, v in [(0.0, 0.0), (0.95, 0.0), (0.88, 0.05), (0.02, 0.05)]], 0.045, m)
        vh.part(f"finroot_{tag}{up}", bm, M["metal"], bevel=0.01)
        bm = bmesh.new()
        vh.plate(bm, [(-u, v) for u, v in [(-0.06, 0.32), (0.06, 0.42), (0.1, 0.415), (-0.02, 0.31)]], 0.04, m)
        vh.part(f"fintip_{tag}{up}", bm, M["trim"], bevel=0.006)

    # Emitter prong on the inner side near the front, carrying the binder.
    xi = x0 - side * 0.3
    tip = V((x0 - side * 0.5, S(3.0), EZ + 0.12))
    bm = bmesh.new()
    vh.cyl(bm, (xi + side * 0.02, S(3.0), EZ + 0.1), tip, 0.04, 0.03, 12)
    vh.cyl(bm, (xi + side * 0.02, S(2.88), EZ + 0.1), (xi + side * 0.02, S(3.12), EZ + 0.1), 0.06, 0.06, 12)
    vh.part(f"prong_{tag}", bm, M["metal"], bevel=0.006)
    bm = bmesh.new()
    vh.ball(bm, tip, (0.045, 0.045, 0.045), 12)
    vh.part(f"emitter_{tag}", bm, M["binder"])

    # Cable lugs at the back of the inner flank.
    bm = bmesh.new()
    for dz in (-0.05, 0.05):
        vh.box(bm, (x0 - side * 0.29, S(0.45), EZ + dz), (0.06, 0.12, 0.035))
    vh.part(f"lugs_{tag}", bm, M["metal"], bevel=0.008)

    # Repulsor pad under the engine.
    bm = bmesh.new()
    vh.lathe(bm, [(-0.02, 0.0), (-0.02, 0.16), (0.02, 0.18), (0.04, 0.0)], 24, Matrix.Translation((x0, S(1.7), EZ - 0.3)) @ Matrix.Rotation(math.pi / 2, 4, "X") @ Matrix.Diagonal((1.6, 1, 1, 1)))
    vh.part(f"padrim_{tag}", bm, M["metal"])
    bm = bmesh.new()
    vh.lathe(bm, [(-0.03, 0.0), (-0.03, 0.13)], 24, Matrix.Translation((x0, S(1.7), EZ - 0.3)) @ Matrix.Rotation(math.pi / 2, 4, "X") @ Matrix.Diagonal((1.6, 1, 1, 1)))
    vh.part(f"pad_{tag}", bm, M["glow"])

    vh.marker(f"exhaust_{tag}", (x0, S(-0.05), EZ))


for side in (-1, 1):
    engine(side)

# Energy binder: a bright arc between the emitters, and a fainter strand winding round it.
arc = lambda t: V((-0.5 + t, S(3.0) + 0.06 * math.sin(t * math.pi), EZ + 0.12 + 0.3 * math.sin(t * math.pi)))  # noqa: E731
bm = bmesh.new()
vh.sweep(bm, [arc(i / 24) for i in range(25)], 0.028, 8)
vh.part("binder", bm, M["binder"])
bm = bmesh.new()
strand = []
for i in range(61):
    t = i / 60
    a = t * TAU * 3.5
    k = math.sin(t * math.pi) ** 0.5
    strand.append(arc(t) + V((0, 0.045 * k * math.sin(a), 0.045 * k * math.cos(a))))
vh.sweep(bm, strand, 0.009, 6)
vh.part("binder2", bm, M["binder"])

# ======================================================================== cockpit

PY = -1.9  # cockpit centre (y)
hull_secs = [
    (-0.93, 0.03, 0.43, 0.37),
    (-1.0, 0.11, 0.48, 0.3),
    (-1.1, 0.19, 0.53, 0.25),
    (-1.25, 0.27, 0.58, 0.2),
    (-1.42, 0.335, 0.615, 0.175),
    (-1.62, 0.385, 0.64, 0.16),
    (-1.85, 0.41, 0.65, 0.155),
    (-2.1, 0.415, 0.65, 0.16),
    (-2.32, 0.4, 0.64, 0.175),
    (-2.5, 0.36, 0.62, 0.2),
    (-2.64, 0.29, 0.59, 0.24),
    (-2.75, 0.2, 0.555, 0.29),
    (-2.82, 0.1, 0.52, 0.34),
    (-2.85, 0.03, 0.5, 0.38),
]
bm = bmesh.new()
vh.loft(bm, [{"y": y, "w": w, "top": t, "bottom": b, "ex": 0.75, "exb": 0.9} for y, w, t, b in hull_secs], around=48)
hull = vh.part("hull", bm, [M["hull"], M["trim"], M["metal"]], smooth_angle=60, subdiv=0.12)
# The cockpit opening: an ellipsoid sunk into the top (its inside becomes the tub).
bm = bmesh.new()
vh.ball(bm, (0, -2.0, 0.7), (0.3, 0.52, 0.33), 40)
cut = vh.part("cut", bm, M["seat"], smooth_angle=80)
vh.PARTS.remove(cut)
mod = hull.modifiers.new("Tub", "BOOLEAN")
mod.operation = "DIFFERENCE"
mod.object = cut
mod.solver = "EXACT"
mod.material_mode = "TRANSFER"  # the faces it cuts take the seat's dark leather
vh._only(hull)
bpy.ops.object.modifier_apply(modifier="Tub")
bpy.data.objects.remove(cut)
SEAT = hull.data.materials.find("seat")


def hull_paint(c, n):
    if c.y > -1.08:
        return 2  # nose cone
    if 0.4 < c.z < 0.46 and n.z < 0.5:
        return 1  # stripe
    return 0


vh.face_materials(hull, hull_paint, keep={SEAT})
for p in hull.data.polygons:
    p.use_smooth = True
vh._only(hull)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(55), keep_sharp_edges=True)

# Rim round the opening.
bm = bmesh.new()
vh.torus(bm, (0, -2.0, 0.615), 1.0, 0.028, rx=0.272, ry=0.47, segs=48, around=8)
vh.part("rim", bm, M["trim"])

# Windscreen: a curved, raked sheet across the front of the opening.
bm = bmesh.new()
rows = []
for j in range(3):
    h = j / 2
    row = []
    for i in range(13):
        a = math.radians(-70 + 140 * i / 12)
        rx, ry = 0.27 - 0.03 * h, 0.47 - 0.03 * h
        row.append(bm.verts.new((rx * math.sin(a) * (1 - 0.15 * h), -2.0 + ry * math.cos(a) - 0.1 * h, 0.625 + 0.15 * h)))
    rows.append(row)
for a, b in zip(rows, rows[1:]):
    for i in range(12):
        bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.01)
vh.part("screen", bm, M["glass"], smooth_angle=60, weld=False)

# Seat back and headrest.
bm = bmesh.new()
vh.box(bm, (0, -2.4, 0.5), (0.36, 0.08, 0.34), Matrix.Rotation(-0.25, 4, "X"))
vh.box(bm, (0, -2.44, 0.7), (0.2, 0.07, 0.12), Matrix.Rotation(-0.25, 4, "X"))
vh.part("seatback", bm, M["seat"], bevel=0.03, segments=3)

# Twin control levers.
for s in (-1, 1):
    bm = bmesh.new()
    vh.cyl(bm, (s * 0.15, -1.62, 0.38), (s * 0.16, -1.74, 0.63), 0.016, 0.014, 10)
    vh.part(f"lever_{s}", bm, M["metal"])
    bm = bmesh.new()
    vh.cyl(bm, (s * 0.12, -1.76, 0.64), (s * 0.21, -1.73, 0.64), 0.026, 0.026, 12)
    vh.part(f"grip_{s}", bm, M["dark"], bevel=0.008)

# Side scoops, tail fin and winglets.
for s in (-1, 1):
    bm = bmesh.new()
    vh.loft(
        bm,
        [
            {"y": -2.05, "w": 0.01, "top": 0.47, "bottom": 0.43, "x": s * 0.4},
            {"y": -2.15, "w": 0.06, "top": 0.5, "bottom": 0.36, "x": s * 0.42, "ex": 0.6},
            {"y": -2.55, "w": 0.055, "top": 0.48, "bottom": 0.34, "x": s * 0.37, "ex": 0.6},
            {"y": -2.65, "w": 0.03, "top": 0.45, "bottom": 0.37, "x": s * 0.33, "ex": 0.6},
        ],
        around=20,
    )
    vh.part(f"scoop_{s}", bm, M["metal"], smooth_angle=45)
    bm = bmesh.new()
    vh.box(bm, (s * 0.46, -2.155, 0.43), (0.05, 0.02, 0.09))
    vh.part(f"scoophole_{s}", bm, M["dark"])
    bm = bmesh.new()
    m = Matrix.Translation((s * 0.22, -2.62, 0.52)) @ Matrix.Rotation(-math.pi / 2, 4, "Z") @ Matrix.Rotation(-s * 0.5, 4, "X")
    vh.plate(bm, [(0.0, 0.0), (0.3, 0.0), (0.32, 0.05), (0.18, 0.2), (0.08, 0.2)], 0.025, m)
    vh.part(f"wing_{s}", bm, M["trim"], bevel=0.008)
bm = bmesh.new()
m = Matrix.Translation((0, -2.5, 0.6)) @ Matrix.Rotation(-math.pi / 2, 4, "Z")
vh.plate(bm, [(0.0, 0.0), (0.38, 0.0), (0.4, 0.04), (0.3, 0.26), (0.2, 0.27)], 0.03, m)
vh.part("tailfin", bm, M["hull"], bevel=0.01)

# Repulsor pads under the cockpit.
for y in (-1.45, -2.4):
    mm = Matrix.Translation((0, y, 0.15)) @ Matrix.Rotation(math.pi / 2, 4, "X") @ Matrix.Diagonal((1.5, 1, 1, 1))
    bm = bmesh.new()
    vh.lathe(bm, [(-0.02, 0.0), (-0.02, 0.13), (0.03, 0.15), (0.05, 0.0)], 24, mm)
    vh.part(f"cpadrim_{y}", bm, M["metal"])
    bm = bmesh.new()
    vh.lathe(bm, [(-0.03, 0.0), (-0.03, 0.105)], 24, mm)
    vh.part(f"cpad_{y}", bm, M["glow"])

# Cables from the engines' lugs to the cockpit nose, sagging a little.
for s in (-1, 1):
    for dz in (-0.05, 0.05):
        a = V((s * (EX - 0.32), S(0.45), EZ + dz))
        b = V((s * 0.17, -1.12, 0.4 + dz * 0.8))
        pts = []
        for i in range(9):
            t = i / 8
            p = a.lerp(b, t)
            p.z -= 0.09 * math.sin(t * math.pi)
            pts.append(p)
        bm = bmesh.new()
        vh.sweep(bm, pts, 0.02, 8)
        vh.part(f"cable_{s}{dz}", bm, M["cable"])
    bm = bmesh.new()
    vh.box(bm, (s * 0.17, -1.1, 0.4), (0.05, 0.08, 0.15))
    vh.part(f"clamp_{s}", bm, M["metal"], bevel=0.012)

# ======================================================================== pilot

import kit  # noqa: E402

PX, PY0, PZ = 0.0, -2.12, 0.36  # hips


def pilot():
    bm = bmesh.new()
    kit.tube(
        bm,
        [(0, PY0 - 0.02, PZ), (0, PY0 + 0.02, PZ + 0.18), (0, PY0 + 0.03, PZ + 0.34)],
        [{"t": 0, "w": 0.14, "h": 0.1}, {"t": 0.65, "w": 0.165, "h": 0.1}, {"t": 1, "w": 0.1, "h": 0.07}],
        segs=10,
        around=16,
        up=(0, 1, 0),
    )
    vh.part("torso", bm, M["suit"], smooth_angle=80)
    # Leather jacket collar.
    bm = bmesh.new()
    vh.torus(bm, (0, PY0 + 0.03, PZ + 0.33), 1.0, 0.025, rx=0.09, ry=0.07, segs=20, around=6)
    vh.part("collar", bm, M["leather"], smooth_angle=80)
    for s in (-1, 1):
        sh = V((s * 0.15, PY0 + 0.02, PZ + 0.3))
        el = V((s * 0.22, PY0 + 0.2, PZ + 0.17))
        ha = V((s * 0.165, -1.745, 0.64))
        bm = bmesh.new()
        kit.tube(bm, [sh, el, ha], [{"t": 0, "w": 0.05, "h": 0.05}, {"t": 0.5, "w": 0.042, "h": 0.042}, {"t": 1, "w": 0.034, "h": 0.034}], segs=12, around=10, up=(0, 0, 1))
        vh.part(f"arm_{s}", bm, M["suit"], smooth_angle=80)
        bm = bmesh.new()
        vh.ball(bm, ha + V((0, 0.0, 0.005)), (0.04, 0.045, 0.04), 12)
        vh.part(f"glove_{s}", bm, M["glove"], smooth_angle=80)
        bm = bmesh.new()
        vh.ball(bm, sh + V((0, 0, 0.01)), (0.06, 0.06, 0.05), 12)
        vh.part(f"shoulder_{s}", bm, M["leather"], smooth_angle=80)
    hz = PZ + 0.48
    hy = PY0 + 0.06
    bm = bmesh.new()
    vh.cyl(bm, (0, hy - 0.01, PZ + 0.33), (0, hy, hz - 0.06), 0.045, 0.04, 10)
    vh.part("neck", bm, M["skin"])
    bm = bmesh.new()
    vh.ball(bm, (0, hy + 0.01, hz), (0.088, 0.095, 0.105), 20)
    vh.part("head", bm, M["skin"], smooth_angle=80)
    # Flying cap with ear flaps; goggles pushed up on the brow; a tuft of hair at the nape.
    bm = bmesh.new()
    vh.ball(bm, (0, hy - 0.005, hz + 0.012), (0.096, 0.104, 0.1), 20)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < hz - 0.005 and (v.co.y > hy + 0.02 or v.co.z < hz - 0.07)], context="VERTS")
    vh.part("cap", bm, M["leather"], smooth_angle=80, weld=False)
    for s in (-1, 1):
        bm = bmesh.new()
        vh.ball(bm, (s * 0.088, hy - 0.005, hz - 0.045), (0.022, 0.045, 0.06), 10)
        vh.part(f"flap_{s}", bm, M["leather"], smooth_angle=80)
        bm = bmesh.new()
        c = V((s * 0.042, hy + 0.088, hz + 0.045))
        vh.cyl(bm, c - V((0, 0.012, 0)), c + V((0, 0.02, 0.006)), 0.032, 0.03, 14)
        vh.part(f"goggle_{s}", bm, M["metal"], bevel=0.004)
        bm = bmesh.new()
        vh.cyl(bm, c + V((0, 0.02, 0.006)), c + V((0, 0.024, 0.007)), 0.024, 0.024, 14)
        vh.part(f"lens_{s}", bm, M["lens"])
    bm = bmesh.new()
    vh.ball(bm, (0, hy - 0.075, hz - 0.06), (0.055, 0.03, 0.035), 10)
    vh.part("hair", bm, M["hair"], smooth_angle=80)


pilot()

# ======================================================================== bake, join, export


def tint(o, co, n):
    """Paint detail: soot round the nozzles, road grime underneath, a cleaner top."""
    soot = 0.0
    for sx in (-EX, EX):
        d = (co - V((sx, S(0.0), EZ))).length
        soot = max(soot, max(0.0, 1 - d / 0.55))
    under = max(0.0, -n.z) * 0.12
    k = 1 - 0.45 * soot**1.5 - under
    return (k, k, k)


vh.bake_ao(ground=-0.7, samples=96, distance=0.5, floor=0.45, tint=tint, pct=0.8)
nodes = vh.join_groups()
print("RESULT tris", vh.stats(), "nodes", sorted(nodes))
size = vh.export(OUT)
print(f"RESULT {OUT} {size // 1024} KB")

if PREVIEW:
    for o in bpy.context.scene.objects:
        o.location.z += 0.7  # hovering, as in the game
    vh.preview(
        PREVIEW,
        "pod",
        [("front", 35, 18, 9.5), ("side", 90, 8, 9), ("rear", 150, 22, 9), ("top", 0.01, 80, 9.5), ("cockpit", 200, 28, 2.6, (0, -2.0, 1.25)), ("intake", 20, 8, 3.0, (1.0, 3.2, 1.15))],
        target=(0, 0.3, 1.1),
    )
