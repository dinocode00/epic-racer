"""The Nazgûl (black horse and hooded wraith), built, rigged and animated in Blender.

Run headless:  python tools/blender/nazgul.py -- OUT.glb [--preview DIR]
(needs `pip install bpy`; see tools/blender/README.md)

What Blender adds over the game's code-built Nazgûl:
  * the horse is one continuous skin (parts melted together) bound to a skeleton, so the
    shoulders, haunches, neck and legs bend instead of hinging;
  * legs are placed by hoof targets (inverse kinematics), so hooves plant and push off;
  * the rider is rigged too: he rides the gallop, steadies his head, lifts the sword;
  * two keyframed clips, "Idle" and "Gallop", which the game blends by speed.

Coordinates: x = the horse's right, y = forward, z = up, metres. Rider parts are ported from
the game's model and written in its local frame (y up, -z forward), then moved into place.
"""

import math
import os
import random
import sys

import bpy  # isort: skip (must come first: it provides bmesh and mathutils)
import bmesh
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
from kit import TAU, V, bump, rx, ry, rz, smooth, wrap  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[0] if argv else "nazgul.glb"
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
rnd = random.Random(11)

MAT = {
    name: kit.material(name, colour)
    for name, colour in {
        "coat": (0.2, 0.2, 0.24),
        "hair": (0.1, 0.1, 0.12),
        "hoof": (0.07, 0.07, 0.08),
        "rag": (0.09, 0.09, 0.11),
        "eye": (1.0, 0.15, 0.05),
        "dark": (0.02, 0.02, 0.02),
        "steel": (0.42, 0.44, 0.5),
        "leather": (0.25, 0.16, 0.11),
        "trim": (0.9, 0.3, 0.2),
        "robe": (0.13, 0.13, 0.16),
        "hood": (0.11, 0.11, 0.14),
        "void": (0, 0, 0),
        "blade": (0.8, 0.83, 0.9),
        "grip": (0.06, 0.06, 0.06),
    }.items()
}

# ======================================================================== skeleton (rest)

REST = {}  # name -> (head, tail, parent)


def bone(name, head, tail, parent=None):
    REST[name] = (V(head), V(tail), parent)


def chain(names, points, parent):
    for n, a, b in zip(names, points, points[1:]):
        bone(n, a, b, parent)
        parent = n


bone("body", (0, -0.05, 1.45), (0, 0.2, 1.45))
chain(["loin", "croup"], [(0, -0.05, 1.52), (0, -0.6, 1.56), (0, -1.0, 1.62)], "body")
chain(
    ["tail1", "tail2", "tail3", "tail4"],
    [(0, -1.02, 1.74), (0, -1.12, 1.44), (0, -1.18, 1.14), (0, -1.19, 0.84), (0, -1.18, 0.5)],
    "croup",
)
chain(["ribs", "chest"], [(0, -0.05, 1.52), (0, 0.5, 1.52), (0, 0.82, 1.6)], "body")
NECK = [(0, 0.78, 1.62), (0, 1.02, 1.98), (0, 1.24, 2.34), (0, 1.40, 2.56)]
chain(["neck1", "neck2", "neck3"], NECK, "chest")
bone("head", (0, 1.40, 2.56), (0, 1.98, 2.02), "neck3")
SIDES = (("L", -1), ("R", 1))
FRONT = [(0.70, 1.55), (0.62, 1.20), (0.66, 0.70), (0.66, 0.25), (0.76, 0.03)]
HIND = [(-0.72, 1.50), (-0.50, 1.12), (-0.78, 0.72), (-0.76, 0.25), (-0.66, 0.03)]
for side, s in SIDES:
    chain(
        [f"f_arm.{side}", f"f_forearm.{side}", f"f_cannon.{side}", f"f_pastern.{side}"],
        [(s * 0.19, y, z) for y, z in FRONT],
        "chest",
    )
    chain(
        [f"h_thigh.{side}", f"h_gaskin.{side}", f"h_cannon.{side}", f"h_pastern.{side}"],
        [(s * 0.2, y, z) for y, z in HIND],
        "croup",
    )

# Rider: the game's wraith, in his own frame (y up, -z forward), hunched and a bit larger.
GAME = Matrix.Rotation(math.pi / 2, 4, "X")  # game axes -> Blender axes
RIDER = Matrix.Translation((0, 0.05, 1.9)) @ Matrix.Rotation(-0.24, 4, "X") @ Matrix.Scale(1.12, 4) @ GAME


def RB(x, y, z):
    return RIDER @ V((x, y, z))


bone("saddle", (0, -0.05, 1.84), (0, 0.2, 1.84), "body")
chain(["r_hips", "r_spine", "r_chest"], [RB(0, -0.42, 0), RB(0, -0.05, 0), RB(0, 0.3, 0), RB(0, 0.62, 0)], "saddle")
bone("r_head", RB(0, 0.66, -0.03), RB(0, 1.1, 0.07), "r_chest")
HAND = {}
for side, s in SIDES:
    sh, el, HAND[side] = RB(s * 0.27, 0.55, -0.02), RB(s * 0.33, 0.25, -0.2), RB(s * 0.18, 0.2, -0.52)
    chain([f"r_upperarm.{side}", f"r_forearm.{side}"], [sh, el, HAND[side]], "r_chest")
    bone(f"drape.{side}", (s * 0.37, -0.02, 1.84), (s * 0.43, -0.02, 1.28), "saddle")
SWORD = Matrix.Translation((0.18, 0.2, -0.52)) @ Matrix.Rotation(-1.15, 4, "X") @ Matrix.Rotation(-0.15, 4, "Y")
bone("r_hand.R", HAND["R"], RIDER @ SWORD @ V((0, 0.3, 0)), "r_forearm.R")

# Mane: one flap bone per neck bone, from the crest down the right side of the neck.
neck_pts = NECK + [(0, 1.62, 2.44), (0, 1.86, 2.20), (0, 1.98, 2.02)]
neck_pos, neck_tan = kit.spline(neck_pts, 100)
NECK_RINGS = [
    dict(t=0, w=0.28, h=0.36),
    dict(t=0.18, w=0.2, h=0.3, dy=0.02),
    dict(t=0.42, w=0.14, h=0.2, dy=0.02),
    dict(t=0.52, w=0.12, h=0.15),  # poll
    dict(t=0.6, w=0.15, h=0.18, dy=-0.04),  # cheeks and jaw
    dict(t=0.75, w=0.115, h=0.13, dy=-0.01),
    dict(t=0.9, w=0.1, h=0.105),
    dict(t=0.97, w=0.095, h=0.1),  # muzzle
    dict(t=1, w=0.04, h=0.04),
]
NECK_UP = V((0, -0.3, 1)).normalized()


def head_at(t):
    return neck_pos[round(t * 100)].copy()


def crest_at(t):
    """Top of the neck (the mane's root line) at t along the neck-and-head curve."""
    i = round(t * 100)
    side = neck_tan[i].cross(NECK_UP).normalized()
    up = side.cross(neck_tan[i]).normalized()
    _, h, dy, _ = kit._ring_at(NECK_RINGS, t)
    return neck_pos[i] + up * (h + dy - 0.02)


MANE_T = [(0.05, 0.2), (0.2, 0.35), (0.35, 0.5)]
for i, (a, b) in enumerate(MANE_T):
    root = crest_at((a + b) / 2)
    bone(f"mane{i + 1}", root, root + V((0.2, -0.05, -0.28)), f"neck{i + 1}")

ORDER = list(REST)
LEN = {n: (t - h).length for n, (h, t, _) in REST.items()}
ANG = {n: math.atan2(t.z - h.z, t.y - h.y) for n, (h, t, _) in REST.items()}  # sagittal rest angle

# ======================================================================== horse skin

bm = bmesh.new()
kit.loft(
    bm,
    [
        dict(y=-1.06, w=0.09, top=1.68, bottom=1.50),
        dict(y=-0.97, w=0.27, top=1.80, bottom=1.26),
        dict(y=-0.75, w=0.35, top=1.85, bottom=1.14),
        dict(y=-0.45, w=0.37, top=1.83, bottom=1.10),
        dict(y=-0.10, w=0.38, top=1.77, bottom=1.04),
        dict(y=0.30, w=0.37, top=1.80, bottom=1.06),
        dict(y=0.62, w=0.33, top=1.90, bottom=1.12),
        dict(y=0.85, w=0.26, top=1.86, bottom=1.20),
        dict(y=0.98, w=0.16, top=1.76, bottom=1.32),
        dict(y=1.04, w=0.07, top=1.68, bottom=1.44),
    ],
    around=32,
)
for s in (-1, 1):
    kit.ellipsoid(bm, (s * 0.22, -0.68, 1.50), (0.17, 0.38, 0.34))  # haunch
    kit.ellipsoid(bm, (s * 0.21, 0.66, 1.56), (0.13, 0.22, 0.36), rot_x=0.35)  # shoulder
    kit.ellipsoid(bm, (s * 0.1, 1.5, 2.47), (0.07, 0.13, 0.11), rot_x=-0.75)  # cheek
kit.ellipsoid(bm, (0, 0.93, 1.44), (0.21, 0.14, 0.2))  # breast
kit.tube(bm, neck_pts, NECK_RINGS, segs=48, around=20, up=NECK_UP)
for s in (-1, 1):
    base = head_at(0.53) + V((s * 0.07, -0.03, 0.1))
    kit.cone(bm, base, base + V((s * 0.04, -0.02, 0.21)), 0.05, 0.004, segs=10, squash=0.6)  # ear
    kit.tube(
        bm,
        [(s * 0.19, 0.70, 1.58)] + [(s * 0.19, y, z) for y, z in FRONT[1:4]] + [(s * 0.19, 0.76, 0.05)],
        [
            dict(t=0, w=0.11, h=0.17),
            dict(t=0.247, w=0.09, h=0.125),
            dict(t=0.4, w=0.075, h=0.1),
            dict(t=0.53, w=0.05, h=0.062),
            dict(t=0.563, w=0.056, h=0.068),  # knee
            dict(t=0.62, w=0.04, h=0.05),
            dict(t=0.8, w=0.037, h=0.045),
            dict(t=0.848, w=0.05, h=0.06),  # fetlock
            dict(t=0.93, w=0.04, h=0.046),
            dict(t=1, w=0.05, h=0.054),
        ],
        segs=44,
        around=14,
        up=(0, 1, 0),
    )
    kit.tube(
        bm,
        [(s * 0.2, -0.72, 1.52)] + [(s * 0.2, y, z) for y, z in HIND[1:4]] + [(s * 0.2, -0.66, 0.05)],
        [
            dict(t=0, w=0.15, h=0.25),
            dict(t=0.277, w=0.12, h=0.17),  # stifle
            dict(t=0.42, w=0.09, h=0.125),
            dict(t=0.55, w=0.055, h=0.078),
            dict(t=0.573, w=0.058, h=0.082),  # hock
            dict(t=0.63, w=0.042, h=0.054),
            dict(t=0.81, w=0.04, h=0.048),
            dict(t=0.858, w=0.052, h=0.062),  # fetlock
            dict(t=0.94, w=0.042, h=0.048),
            dict(t=1, w=0.05, h=0.054),
        ],
        segs=44,
        around=14,
        up=(0, 1, 0),
    )
horse = kit.to_object("Horse", bm, MAT["coat"])
kit.fuse(horse, voxel=0.013, smooth=5, target_tris=15000)
kit.unwrap(horse, scale=2.0)

# ======================================================================== everything else

PARTS = []  # (object, how to weight it)


def part(name, bm, mat, weigh, smooth_shade=True, uv=True):
    obj = kit.to_object(name, bm, MAT[mat], smooth=smooth_shade)
    if uv:
        kit.unwrap(obj)
    weigh(obj)
    PARTS.append(obj)
    return obj


def seg(name):
    return REST[name][0], REST[name][1]


def rigid(name):
    return lambda o: kit.weight_rigid(o, name)


def near(*names, power=4.0):
    return lambda o: kit.weight_near(o, names, {n: seg(n) for n in names}, power)


# ---- hooves
for side, s in SIDES:
    for pre, x, y in (("f", 0.19, 0.765), ("h", 0.2, -0.655)):
        bm = bmesh.new()
        kit.cone(bm, (s * x, y + 0.012, 0.0), (s * x, y - 0.006, 0.105), 0.072, 0.05, segs=14)
        part(f"Hoof.{pre}.{side}", bm, "hoof", rigid(f"{pre}_pastern.{side}"))

# ---- tail: a bundle of wavy strands
bm = bmesh.new()
dock = V((0, -1.02, 1.74))
for i in range(12):
    a = i / 12 * TAU
    spread = 0.05 + rnd.random() * 0.06
    ln = 1.0 + rnd.random() * 0.4
    cx = math.cos(a) * spread
    kit.tube(
        bm,
        [
            dock,
            dock + V((cx, -0.12, -ln * 0.35)),
            dock + V((cx * 2 + (rnd.random() - 0.5) * 0.1, -0.18, -ln * 0.7)),
            dock + V((cx * 2.5, -0.16, -ln)),
        ],
        [dict(t=0, w=0.035, h=0.035), dict(t=0.6, w=0.025, h=0.03), dict(t=1, w=0.004, h=0.004)],
        segs=10,
        around=6,
        up=(0, 1, 0),
    )
part("Tail", bm, "hair", near("tail1", "tail2", "tail3", "tail4", power=2.5))


# ---- rags (ragged cloth, cut out by the game's tatter texture): mane, feathers, drapes
def frame(origin, x_axis, down):
    """A card frame: top edge centred on `origin`, running along x_axis, hanging along `down`."""
    z = -V(down).normalized()
    x = V(x_axis).normalized()
    y = z.cross(x).normalized()
    x = y.cross(z)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = V(origin)
    return m


def gradient(obj, rows, top_bone, flap_bone, power=0.8):
    """Top edge follows one bone; the further down the cloth, the more it follows the flap."""
    top = obj.vertex_groups.get(top_bone) or obj.vertex_groups.new(name=top_bone)
    flap = obj.vertex_groups.get(flap_bone) or obj.vertex_groups.new(name=flap_bone)
    for j, row in enumerate(rows):
        f = (j / (len(rows) - 1)) ** power
        for i in row:
            top.add([i], 1 - f, "REPLACE")
            flap.add([i], f, "REPLACE")


def rag_part(name, build):
    """build(bm) returns a list of (rows of BMVerts, top bone, flap bone)."""
    bm = bmesh.new()
    spec = build(bm)
    bm.verts.index_update()
    spec = [([[v.index for v in row] for row in rows], a, b) for rows, a, b in spec]
    obj = kit.to_object(name, bm, MAT["rag"], fix_normals=False)
    for rows, a, b in spec:
        gradient(obj, rows, a, b)
    PARTS.append(obj)


def build_mane(bm):
    out = []
    for i in range(26):
        t = 0.06 + i / 25 * 0.42
        k = next(j for j, (a, b) in enumerate(MANE_T) if t <= b or j == 2)
        ln = 0.24 + rnd.random() * 0.22
        hang = V((0.62 + rnd.random() * 0.2, -0.22 - rnd.random() * 0.15, -0.75))
        m = frame(crest_at(t) + V((0.015, 0, 0)), neck_tan[round(t * 100)], hang)
        out.append((kit.card(bm, m, 0.085, ln, 1, 3, taper=0.7), f"neck{k + 1}", f"mane{k + 1}"))
    return out


def build_drapes(bm):
    out = []
    for side, s in SIDES:
        m = frame((s * 0.375, -0.02, 1.84), (0, s, 0), (s * 0.12, 0, -1))
        out.append((kit.card(bm, m, 1.0, 0.62, 6, 5), "saddle", f"drape.{side}"))
    return out


def build_skirts(bm):
    out = []
    for side, s in SIDES:
        m = frame(RB(s * 0.43, -0.05, 0), (0, s, 0), (s * 0.1, 0, -1))
        out.append((kit.card(bm, m, 0.62 * 1.12, 0.62 * 1.12, 4, 5), "r_hips", f"drape.{side}"))
    return out


rag_part("Mane", build_mane)
rag_part("Drapes", build_drapes)
rag_part("Skirts", build_skirts)

for side, s in SIDES:  # feathering at the fetlocks
    for pre, x, (y, z) in (("f", 0.19, FRONT[3]), ("h", 0.2, HIND[3])):
        bm = bmesh.new()
        layer = bm.loops.layers.uv.verify()
        n = 10
        top = [bm.verts.new((s * x + 0.012 * math.cos(i / n * TAU), y + 0.012 * math.sin(i / n * TAU), z + 0.07)) for i in range(n)]
        low = [bm.verts.new((s * x + 0.08 * math.cos(i / n * TAU), y + 0.02 + 0.08 * math.sin(i / n * TAU), z - 0.1)) for i in range(n)]
        for i in range(n):
            k = (i + 1) % n
            f = bm.faces.new((top[i], top[k], low[k], low[i]))
            for loop, uvc in zip(f.loops, ((i / n, 0), ((i + 1) / n, 0), ((i + 1) / n, 1), (i / n, 1))):
                loop[layer].uv = uvc
        obj = kit.to_object(f"Feather.{pre}.{side}", bm, MAT["rag"], fix_normals=False)
        kit.weight_rigid(obj, f"{pre}_cannon.{side}")
        PARTS.append(obj)


# ---- tack and armour
def torus(bm, centre, normal, R, r, arc=TAU, segs=24, around=8, scale=(1, 1, 1)):
    n = V(normal).normalized()
    a = n.orthogonal().normalized()
    b = n.cross(a)
    full = arc >= TAU - 1e-6
    rows = []
    for i in range(segs if full else segs + 1):
        th = arc * i / segs
        rad = a * math.cos(th) + b * math.sin(th)
        row = []
        for j in range(around):
            ph = j / around * TAU
            p = rad * (R + r * math.cos(ph)) + n * (r * math.sin(ph))
            row.append(bm.verts.new(V(centre) + V((p.x * scale[0], p.y * scale[1], p.z * scale[2]))))
        rows.append(row)
    for i in range(len(rows) - (0 if full else 1)):
        nxt = rows[(i + 1) % len(rows)]
        for j in range(around):
            k = (j + 1) % around
            bm.faces.new((rows[i][j], rows[i][k], nxt[k], nxt[j]))


bm = bmesh.new()
kit.tube(
    bm,
    [(0, -0.32, 1.86), (0, 0.05, 1.84), (0, 0.38, 1.90)],
    [dict(t=0, w=0.3, h=0.07, dy=0.04), dict(t=0.5, w=0.27, h=0.05), dict(t=1, w=0.2, h=0.09, dy=0.05)],
    segs=12,
    around=16,
)
torus(bm, (0, 0.25, 1.48), (0, 1, 0), 0.4, 0.025, segs=30, around=6, scale=(0.92, 1, 1))
part("Saddle", bm, "leather", rigid("saddle"))

bm = bmesh.new()
for s in (-1, 1):
    torus(bm, (s * 0.45, 0.15, 1.3), (1, 0, 0), 0.06, 0.012, arc=TAU * 0.7, segs=12, around=6)
part("Stirrups", bm, "steel", rigid("saddle"))

bm = bmesh.new()
kit.box(bm, (0, -0.42, 1.83), (0.6, 0.05, 0.02))
part("Trim", bm, "trim", rigid("saddle"), smooth_shade=False, uv=False)

bm = bmesh.new()  # spiked face plate, crest spike, bit rings
kit.tube(
    bm,
    [head_at(0.55) + V((0, 0.04, 0.12)), head_at(0.75) + V((0, 0.07, 0.1)), head_at(0.92) + V((0, 0.07, 0.07))],
    [dict(t=0, w=0.1, h=0.025), dict(t=1, w=0.07, h=0.02)],
    segs=10,
    around=10,
    up=(0, 1, 1),
)
sp = head_at(0.56) + V((0, 0.04, 0.16))
kit.cone(bm, sp, sp + V((0, 0.12, 0.2)), 0.03, 0.0, segs=8)
BIT = head_at(0.94)
for s in (-1, 1):
    torus(bm, BIT + V((s * 0.1, 0, -0.04)), (1, 0, 0), 0.03, 0.007, segs=12, around=6)
part("HeadArmour", bm, "steel", rigid("head"))

bm = bmesh.new()
for s in (-1, 1):
    kit.ellipsoid(bm, head_at(0.62) + V((s * 0.128, 0.0, 0.045)), (0.026, 0.026, 0.026), segs=10)
part("Eyes", bm, "eye", rigid("head"), uv=False)
bm = bmesh.new()
for s in (-1, 1):
    kit.ellipsoid(bm, head_at(0.97) + V((s * 0.05, 0.06, 0.02)), (0.018, 0.018, 0.018), segs=8)
part("Nostrils", bm, "dark", rigid("head"), uv=False)


# ---- the wraith (game-local coordinates, moved into place with RIDER)
def folded_lathe(bm, profile, folds, depth, segments, phi0=0.0, phi_len=TAU, scale=(1, 1, 1), rows=20):
    """A lathe around y whose surface ripples into vertical cloth folds, deeper at the hem."""
    pts, _ = kit.spline([(r, y, 0) for r, y in profile], rows)
    y0, y1 = min(p.y for p in pts), max(p.y for p in pts)
    full = phi_len >= TAU - 1e-6
    grid = []
    for p in pts:
        hem = 1 - (p.y - y0) / (y1 - y0)
        row = []
        for i in range(segments if full else segments + 1):
            phi = phi0 + phi_len * i / segments
            k = 1 + depth * hem * (math.sin(phi * folds) * 0.7 + math.sin(phi * folds * 2.3 + 1.7) * 0.3)
            row.append(bm.verts.new((p.x * math.sin(phi) * k * scale[0], p.y * scale[1], p.x * math.cos(phi) * k * scale[2])))
        grid.append(row)
    n = len(grid[0])
    for j in range(len(grid) - 1):
        for i in range(n if full else n - 1):
            k = (i + 1) % n
            bm.faces.new((grid[j][i], grid[j][k], grid[j + 1][k], grid[j + 1][i]))


bm = bmesh.new()
folded_lathe(
    bm,
    [(0.42, -0.42), (0.36, -0.18), (0.28, 0.05), (0.25, 0.3), (0.29, 0.5), (0.27, 0.6), (0.14, 0.7), (0.06, 0.73)],
    11,
    0.12,
    56,
    scale=(1.1, 1, 0.82),
)
bm.transform(RIDER)
part("Robe", bm, "robe", near("r_hips", "r_spine", "r_chest", power=3.0))

for side, s in SIDES:
    bm = bmesh.new()
    sh, el, hd = V((s * 0.27, 0.55, -0.02)), V((s * 0.33, 0.25, -0.2)), V((s * 0.18, 0.2, -0.52))
    kit.tube(
        bm,
        [sh, el, hd],
        [dict(t=0, w=0.1, h=0.1), dict(t=0.5, w=0.08, h=0.08), dict(t=0.75, w=0.1, h=0.1), dict(t=1, w=0.06, h=0.06)],
        segs=16,
        around=12,
        up=(0, 0, -1),
    )
    bm.transform(RIDER)
    part(f"Sleeve.{side}", bm, "robe", near(f"r_upperarm.{side}", f"r_forearm.{side}", power=5.0))

    bm = bmesh.new()  # vambrace and plated gauntlet
    kit.tube(bm, [el.lerp(hd, 0.35), el.lerp(hd, 0.92)], [dict(t=0, w=0.068, h=0.068), dict(t=1, w=0.055, h=0.055)], segs=6, around=14, up=(0, 1, 0))
    for k in range(4):
        kit.box(bm, hd + V((0, -k * 0.03, -0.02 - k * 0.012)), (0.11, 0.035, 0.05), Matrix.Rotation(k * 0.35, 4, "X"))
    for k in range(3):
        b = hd + V((-0.035 + k * 0.035, 0.0, 0.02))
        kit.cone(bm, b, b + V((0, 0.065, -0.027)), 0.012, 0.0, segs=6)
    bm.transform(RIDER)
    part(f"Gauntlet.{side}", bm, "steel", rigid(f"r_forearm.{side}"))

    bm = bmesh.new()  # armoured boot in the stirrup
    kit.tube(
        bm,
        [(s * 0.42, -0.3, 0.02), (s * 0.44, -0.5, -0.04), (s * 0.44, -0.55, -0.24)],
        [dict(t=0, w=0.065, h=0.065), dict(t=0.7, w=0.06, h=0.07), dict(t=1, w=0.02, h=0.03)],
        segs=12,
        around=12,
        up=(0, 0, -1),
    )
    bm.transform(RIDER)
    part(f"Boot.{side}", bm, "steel", rigid("saddle"))

HOOD = RIDER @ Matrix.Translation((0, 0.66, -0.03)) @ Matrix.Rotation(0.22, 4, "X")
bm = bmesh.new()
folded_lathe(
    bm,
    [(0.2, 0.0), (0.235, 0.12), (0.23, 0.26), (0.18, 0.38), (0.09, 0.45), (0.0, 0.47)],
    7,
    0.06,
    40,
    math.pi + 0.85,
    TAU - 1.7,
    scale=(1, 1, 1.15),
    rows=14,
)
kit.tube(
    bm,
    [(0, 0.38, 0.02), (0, 0.48, 0.16), (0, 0.44, 0.34)],
    [dict(t=0, w=0.12, h=0.09), dict(t=1, w=0.01, h=0.01)],
    segs=10,
    around=12,
    up=(0, 1, 0),
)
bm.transform(HOOD)
part("Hood", bm, "hood", rigid("r_head"))
bm = bmesh.new()
kit.ellipsoid(bm, (0, 0.22, 0), (0.18, 0.18, 0.18), segs=16)
bm.transform(HOOD)
part("Void", bm, "void", rigid("r_head"), uv=False)

SW = RIDER @ SWORD
bm = bmesh.new()  # blade: a flat, pointed bar
shape = [(-0.035, 0), (0.035, 0), (0.03, 0.95), (0, 1.12), (-0.03, 0.95)]
front = [bm.verts.new((x, y + 0.08, 0.006)) for x, y in shape]
back = [bm.verts.new((x, y + 0.08, -0.006)) for x, y in shape]
bm.faces.new(front)
bm.faces.new(reversed(back))
for i in range(5):
    k = (i + 1) % 5
    bm.faces.new((front[i], back[i], back[k], front[k]))
bm.transform(SW)
part("Blade", bm, "blade", rigid("r_hand.R"), smooth_shade=False, uv=False)
bm = bmesh.new()
kit.box(bm, (0, 0.07, 0), (0.26, 0.03, 0.05))
kit.ellipsoid(bm, (0, -0.15, 0), (0.035, 0.035, 0.035), segs=6)
bm.transform(SW)
part("Hilt", bm, "steel", rigid("r_hand.R"), smooth_shade=False)
bm = bmesh.new()
kit.cone(bm, (0, -0.13, 0), (0, 0.05, 0), 0.02, 0.02, segs=8)
bm.transform(SW)
part("Grip", bm, "grip", rigid("r_hand.R"), uv=False)

# Reins: from the left fist to both bit rings. One end follows the hand, the other the horse's
# head, so they stay attached however either moves.
bm = bmesh.new()
rein_rows = []
for s in (-1, 1):
    a, b = HAND["L"], BIT + V((s * 0.1, 0, -0.04))
    mid = a.lerp(b, 0.5) + V((s * 0.08, 0, -0.12))
    curve = [a.lerp(mid, t) .lerp(mid.lerp(b, t), t) for t in (i / 12 for i in range(13))]
    rein_rows += [kit.tube(bm, curve, [dict(t=0, w=0.01, h=0.01), dict(t=1, w=0.01, h=0.01)], segs=14, around=5)]
bm.verts.index_update()
rein_rows = [[[v.index for v in row] for row in rows] for rows in rein_rows]
reins = kit.to_object("Reins", bm, MAT["leather"])
for rows in rein_rows:
    gradient(reins, rows, "r_forearm.L", "head", power=1.0)
PARTS.append(reins)

# ======================================================================== armature and binding

arm = bpy.data.armatures.new("NazgulRig")
rig = bpy.data.objects.new("NazgulRig", arm)
scene.collection.objects.link(rig)
kit.only(rig)
bpy.ops.object.mode_set(mode="EDIT")
for name in ORDER:
    h, t, parent = REST[name]
    eb = arm.edit_bones.new(name)
    eb.head, eb.tail = h, t
    if parent:
        eb.parent = arm.edit_bones[parent]
bpy.ops.object.mode_set(mode="OBJECT")

SKIN_BONES = {n for n in ORDER if n.split(".")[0] in {"loin", "croup", "ribs", "chest", "neck1", "neck2", "neck3", "head", "f_arm", "f_forearm", "f_cannon", "f_pastern", "h_thigh", "h_gaskin", "h_cannon", "h_pastern"}}
if not kit.bind_auto(horse, rig, SKIN_BONES):
    print("WARNING automatic weights failed; falling back to nearest-bone weights")
    for g in list(horse.vertex_groups):
        horse.vertex_groups.remove(g)
    kit.weight_near(horse, sorted(SKIN_BONES), {n: seg(n) for n in SKIN_BONES}, 4.0, keep=3)
    if not horse.modifiers:
        kit.bind_manual(horse, rig)
for obj in PARTS:
    kit.bind_manual(obj, rig)

# Fewer, larger meshes: one per material.
by_mat = {}
for obj in PARTS:
    by_mat.setdefault(obj.data.materials[0].name, []).append(obj)
MESHES = [horse] + [kit.join(objs, mat.capitalize()) for mat, objs in by_mat.items()]

# ======================================================================== posing


class Pose:
    """Each bone's rotation away from rest, in the skeleton's own axes (not the parent's)."""

    def __init__(self):
        self.D = {}
        self.shift = V((0, 0, 0))

    def get(self, name):
        while name is not None:
            if name in self.D:
                return self.D[name]
            name = REST[name][2]
        return Quaternion()

    def set(self, name, q):
        self.D[name] = q

    def rel(self, name, q):
        """Rotate relative to wherever the parent has ended up."""
        self.D[name] = self.get(REST[name][2]) @ q

    def head(self, name):
        h, _, parent = REST[name]
        if parent is None:
            return h + self.shift
        return self.head(parent) + self.get(parent) @ (h - REST[parent][0])


def leg(P, names, hoof, pastern_angle, follow, knee_forward):
    """Place a leg from a hoof target (y, z in the skeleton's frame) by two-bone IK."""
    upper, mid, low, pastern = names
    R = P.head(upper)
    pd = V((0, math.cos(pastern_angle), math.sin(pastern_angle)))
    F = V((R.x, hoof[0], hoof[1])) - pd * LEN[pastern]  # fetlock
    rest_line = REST[low][1] - REST[upper][0]
    a_up = follow * wrap(math.atan2(F.z - R.z, F.y - R.y) - math.atan2(rest_line.z, rest_line.y))
    P.set(upper, rx(a_up))
    J = R + rx(a_up) @ (REST[mid][0] - REST[upper][0])
    a, b = LEN[mid], LEN[low]
    to = F - J
    d = max(abs(a - b) + 1e-3, min(a + b - 1e-4, to.length))
    base = math.atan2(to.z, to.y)
    alpha = math.acos(max(-1, min(1, (a * a + d * d - b * b) / (2 * a * d))))
    best = None
    for sign in (-1, 1):
        ang = base + sign * alpha
        K = J + V((0, math.cos(ang), math.sin(ang))) * a
        # Which side of the line the joint sits: knees fold forward, hocks back.
        off = (K - J).y * to.z - (K - J).z * to.y
        if best is None or (off > best[0]) == knee_forward:
            best = (off, ang, K)
    _, ang, K = best
    P.set(mid, rx(wrap(ang - ANG[mid])))
    Fd = J + to.normalized() * d
    P.set(low, rx(wrap(math.atan2(Fd.z - K.z, Fd.y - K.y) - ANG[low])))
    P.set(pastern, rx(wrap(pastern_angle - ANG[pastern])))


F_HOOF, H_HOOF = FRONT[4], HIND[4]
F_NAMES = lambda side: [f"{n}.{side}" for n in ("f_arm", "f_forearm", "f_cannon", "f_pastern")]  # noqa: E731
H_NAMES = lambda side: [f"{n}.{side}" for n in ("h_thigh", "h_gaskin", "h_cannon", "h_pastern")]  # noqa: E731


def hermite(s, m):
    """0 -> 1 with the same slope m at both ends (negative m: draws back before reaching)."""
    return (s**3 - 2 * s * s + s) * m + (-2 * s**3 + 3 * s * s) + (s**3 - s * s) * m


# Transverse gallop on the right lead: left hind, right hind, left fore, right fore, then air.
GALLOP_LEGS = [("h", "L", 0.00), ("h", "R", 0.10), ("f", "L", 0.36), ("f", "R", 0.48)]
STANCE = 0.25


def gallop(p):
    P = Pose()
    c = lambda at: math.cos(TAU * (p - at))  # noqa: E731
    pitch = 0.075 * c(0.03)  # forehand up as the hind feet land, down onto the forelegs
    P.shift = V((0, 0, -0.1 + 0.06 * c(0.86)))  # highest in the airborne phase
    P.set("body", rx(pitch))
    gather = c(0.88)  # +1 with the legs gathered under in the air, -1 at full stretch
    P.rel("loin", rx(0.07 * gather))
    P.rel("croup", rx(0.1 * gather))
    P.rel("ribs", rx(-0.03 * gather))
    P.rel("chest", rx(-0.06 * gather))
    nod = c(0.5)  # the neck dips as the forelegs take the weight
    P.rel("neck1", rx(-0.2 - 0.07 * nod))
    P.rel("neck2", rx(-0.15 - 0.04 * nod))
    P.rel("neck3", rx(-0.08))
    P.rel("head", rx(0.36 + 0.06 * c(0.6)))
    for kind, side, at in GALLOP_LEGS:
        q = (p - at) % 1
        front = kind == "f"
        rest = F_HOOF if front else H_HOOF
        land, off = (0.56, -0.6) if front else (0.62, -0.62)
        rest_pa = ANG[f"{kind}_pastern.{side}"]
        if q < STANCE:
            u = q / STANCE
            y, z = land + (off - land) * u, 0.0
            pa = rest_pa + 0.4 * math.sin(math.pi * u) - 0.25 * smooth((u - 0.7) / 0.3)
        else:
            s = (q - STANCE) / (1 - STANCE)
            y = off + (land - off) * hermite(s, -0.9)
            z = (0.5 if front else 0.36) * math.sin(math.pi * s**0.85) ** 1.3
            # Toe trails as the leg folds, then reaches for the ground.
            pa = rest_pa - 0.25 - (1.5 if front else 1.1) * bump(s, -0.15, 0.75) + 0.3 * bump(s, 0.7, 1.15)
        leg(P, F_NAMES(side) if front else H_NAMES(side), (rest[0] + y, rest[1] + z), pa, 0.45 if front else 0.5, front)
    for i in range(4):
        w = math.sin(TAU * 2 * p - i * 0.9)
        P.rel(f"tail{i + 1}", rz(0.08 * math.sin(TAU * p - i)) @ rx((-0.8, -0.3, -0.12, 0.05)[i] + (0.1, 0.14, 0.18, 0.22)[i] * w))
    for i in range(3):
        w = math.sin(TAU * 2 * p - i * 0.9)
        P.rel(f"mane{i + 1}", rx(-0.45 + 0.12 * w) @ ry(-0.3 + 0.22 * math.sin(TAU * 2 * p - i * 0.9 + 1)))
    for side, s in SIDES:
        P.rel(f"drape.{side}", rx(-0.3 + 0.08 * math.sin(TAU * 2 * p + s)) @ ry(-s * (0.28 + 0.2 * math.sin(TAU * 2 * p + s))))
    # The wraith: forward in the saddle, giving with the stride, head held level.
    P.rel("r_hips", rx(-0.1 + 0.05 * c(0.3)))
    P.rel("r_spine", rx(-0.09 + 0.05 * c(0.24)))
    P.rel("r_chest", rx(-0.07 + 0.04 * c(0.18)))
    P.set("r_head", rx(-0.2 + 0.02 * c(0.1)))
    P.rel("r_upperarm.L", rx(0.06 - 0.1 * nod))  # the rein hand follows the horse's mouth
    P.rel("r_forearm.L", rx(0.05 - 0.06 * nod))
    P.rel("r_upperarm.R", rx(0.3 + 0.07 * c(0.15)))  # sword raised for the charge
    P.rel("r_forearm.R", rx(0.25 + 0.06 * c(0.22)))
    P.rel("r_hand.R", rx(0.12 * c(0.3)))
    return P


def idle(u):
    """Four seconds standing: breathing, a hind leg at rest, pawing, a toss of the head."""
    P = Pose()
    breath = math.sin(TAU * 2 * u)
    P.shift = V((0, 0, 0.006 * breath))
    P.set("body", rx(0.0))
    P.rel("ribs", rx(0.006 * breath))
    toss = bump(u, 0.56, 0.74)
    dip = bump(u, 0.46, 0.6)
    P.rel("neck1", rx(0.03 * math.sin(TAU * u) + 0.16 * toss - 0.1 * dip))
    P.rel("neck2", rx(0.02 * math.sin(TAU * u + 0.6) + 0.12 * toss - 0.08 * dip))
    P.rel("neck3", rx(0.06 * toss))
    P.rel("head", rz(0.1 * math.sin(TAU * u)) @ rx(-0.05 * math.sin(TAU * u + 1) - 0.28 * bump(u, 0.6, 0.8) + 0.1 * dip))
    paw_up = 0.2 * bump(u, 0.08, 0.24) + 0.17 * bump(u, 0.22, 0.38)
    paw_y = 0.22 * bump(u, 0.06, 0.2) - 0.06 * bump(u, 0.16, 0.3) + 0.2 * bump(u, 0.2, 0.34) - 0.05 * bump(u, 0.3, 0.42)
    for side, _ in SIDES:
        fy, fz, fpa = 0.0, 0.0, ANG[f"f_pastern.{side}"]
        hy, hz, hpa = 0.0, 0.0, ANG[f"h_pastern.{side}"]
        if side == "R":
            fy, fz = paw_y, paw_up
            fpa -= 3.5 * paw_up
        else:
            hy, hz, hpa = 0.06, 0.035, hpa - 0.55  # left hind resting on its toe
        leg(P, F_NAMES(side), (F_HOOF[0] + fy, F_HOOF[1] + fz), fpa, 0.45, True)
        leg(P, H_NAMES(side), (H_HOOF[0] + hy, H_HOOF[1] + hz), hpa, 0.5, False)
    flick = bump(u, 0.78, 0.97)
    for i in range(4):
        P.rel(f"tail{i + 1}", rz((0.05 + 0.35 * flick) * math.sin(TAU * (u * 2 + flick * 1.5) - i * 0.8)) @ rx(0.02 * math.sin(TAU * u - i)))
    for i in range(3):
        P.rel(f"mane{i + 1}", ry(0.05 * math.sin(TAU * 2 * u - i) - 0.25 * toss))
    for side, s in SIDES:
        P.rel(f"drape.{side}", ry(-s * 0.03 * (1 + math.sin(TAU * 2 * u + s))))
    P.rel("r_spine", rx(0.012 * breath))
    P.rel("r_chest", rx(0.012 * breath))
    P.rel("r_head", rz(0.3 * math.sin(TAU * u)) @ rx(0.04 * math.sin(TAU * 2 * u)))  # scanning
    P.rel("r_upperarm.L", rx(0.04 * toss))
    P.rel("r_upperarm.R", rx(0.05 * math.sin(TAU * u + 2)))
    P.rel("r_hand.R", rx(0.06 * math.sin(TAU * u + 1)))
    return P


REST_Q = {b.name: b.matrix_local.to_quaternion() for b in arm.bones}
LAST = {}
for pb in rig.pose.bones:
    pb.rotation_mode = "QUATERNION"


def apply(P):
    for name in ORDER:
        parent = REST[name][2]
        Rb = REST_Q[name]
        q = Rb.inverted() @ (P.get(parent).inverted() if parent else Quaternion()) @ P.get(name) @ Rb
        if name in LAST and LAST[name].dot(q) < 0:
            q.negate()
        LAST[name] = q.copy()
        rig.pose.bones[name].rotation_quaternion = q
    rig.pose.bones["body"].location = REST_Q["body"].inverted() @ P.shift


def check(P, label):
    """The script's own maths must agree with where Blender actually puts the bones."""
    apply(P)
    bpy.context.view_layer.update()
    worst = max((rig.pose.bones[n].head - P.head(n)).length for n in ORDER)
    assert worst < 1e-4, f"{label}: pose maths disagrees with Blender by {worst:.5f} m"
    return worst


def hoof_ground(P, side_names):
    apply(P)
    bpy.context.view_layer.update()
    return rig.pose.bones[side_names[3]].tail.z


for label, fn in (("idle", idle), ("gallop", gallop)):
    for k in range(8):
        check(fn(k / 8), f"{label} {k}/8")
# Hooves on the ground through each stance.
for kind, side, at in GALLOP_LEGS:
    names = F_NAMES(side) if kind == "f" else H_NAMES(side)
    for u in (0.1, 0.5, 0.9):
        z = hoof_ground(gallop((at + STANCE * u) % 1), names)
        print(f"STANCE {kind}.{side} u={u}: hoof z={z:.3f}")

# ======================================================================== preview pictures

if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 5
    sun.rotation_euler = (math.radians(55), 0, math.radians(-60))
    scene.collection.objects.link(sun)
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.8, 0.9, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.2
    scene.world = world
    bpy.ops.mesh.primitive_plane_add(size=30)
    floor = bpy.context.object
    floor.data.materials.append(kit.material("floor", (0.55, 0.6, 0.5)))
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 12
    scene.cycles.device = "CPU"
    scene.render.resolution_x, scene.render.resolution_y = 560, 460

    def shot(name, P, view="side"):
        apply(P)
        if view == "side":
            cam.location, cam.rotation_euler, cam_data.ortho_scale = (-12, 0.35, 1.75), (math.radians(90), 0, math.radians(-90)), 4.6
        elif view == "front":
            cam.location, cam.rotation_euler, cam_data.ortho_scale = (5.5, 9, 3.2), (math.radians(78), 0, math.radians(148)), 4.6
        else:
            cam.location, cam.rotation_euler, cam_data.ortho_scale = (-7, -8, 4.2), (math.radians(72), 0, math.radians(-41)), 4.8
        scene.render.filepath = os.path.join(PREVIEW, name + ".png")
        bpy.ops.render.render(write_still=True)

    shot("rest", Pose())
    shot("rest-front", Pose(), "front")
    shot("rest-rear", Pose(), "rear")
    for k in range(12):
        shot(f"gallop-{k:02d}", gallop(k / 12))
    for k in range(8):
        shot(f"idle-{k:02d}", idle(k / 8))
    shot("gallop-front", gallop(0.42), "front")
    bpy.data.objects.remove(floor)
    bpy.data.objects.remove(cam)
    bpy.data.objects.remove(sun)

# ======================================================================== clips and export

FPS = 24
scene.render.fps = FPS
rig.animation_data_create()


def bake(name, fn, frames):
    act = bpy.data.actions.new(name)
    rig.animation_data.action = act
    LAST.clear()
    for f in range(frames + 1):
        apply(fn(f / frames))
        for pb in rig.pose.bones:
            pb.keyframe_insert("rotation_quaternion", frame=f)
        rig.pose.bones["body"].keyframe_insert("location", frame=f)
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, act)
    rig.animation_data.action = None


bake("Idle", idle, 4 * FPS)
bake("Gallop", gallop, FPS)
apply(Pose())

os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_yup=True,
    export_skins=True,
    export_animations=True,
    export_animation_mode="NLA_TRACKS",
    export_force_sampling=True,
    export_optimize_animation_size=False,
    export_all_influences=False,
    export_def_bones=False,
    export_cameras=False,
    export_lights=False,
    export_tangents=False,
)
tris = {m.name: sum(len(p.vertices) - 2 for p in m.data.polygons) for m in MESHES}
print(f"RESULT meshes={len(MESHES)} tris={sum(tris.values())} bones={len(ORDER)} size={os.path.getsize(OUT) // 1024}KB")
print("TRIS", tris)
