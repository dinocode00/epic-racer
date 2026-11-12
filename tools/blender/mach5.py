"""The Mach 5, in white, modelled in Blender.

    python tools/blender/mach5.py -- apps/game/src/render/models/mach5.glb [--preview DIR]

One continuous shell from the pointed nose to the tail: tall pontoon fenders over the front
wheels with the hood dipping into a valley between them, a flat deck round the open cockpit,
the rear fenders swelling again over the back wheels. Round headlamps set into the tops of the
front fenders under chrome rings, a dark intake slot across the nose, the red "M" on the hood
and a red "5" in a red ring on each door, round tail lamps in chrome bezels and twin chrome
exhausts. In the cockpit: a wrap-round windscreen on a chrome frame, the dash and a bucket seat
(the game seats its driver there). A line in the player's colour runs along each flank. Wheels:
chrome rims with a dished face, eight vents and a two-eared knock-off spinner.

The same footprint, wheel positions and exhaust points as the code-built car it replaces.
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
OUT = argv[0] if argv else "mach5.glb"
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None

vh.reset()

M = {
    "paint": vh.material("paint", 0xf3f3f0, 0.25, 0.15),
    "under": vh.material("under", 0x2a2b2d, 0.85, 0.0),
    "well": vh.material("well", 0x0d0d0e, 0.95, 0.0),
    "red": vh.material("red", 0xd5222a, 0.3, 0.1),
    "seat": vh.material("seat", 0x1d2f5a, 0.75, 0.0),
    "trim": vh.material("trim", 0x18191b, 0.6, 0.1),
    "gap": vh.material("gap", 0x3a3c40, 0.7, 0.0),
    "glass": vh.material("glass", 0x9fc4e8, 0.05, 0.2),
    "lamp": vh.material("lamp", 0xfff4d6, 0.2, 0.0, emit=(0xfff4d6, 1.4)),
    "tail": vh.material("tail", 0xd01818, 0.2, 0.0, emit=(0xd01818, 1.6)),
    "chrome": vh.material("chrome", 0xdedfe3, 0.18, 1.0),
    "rim": vh.material("rim", 0x2a2c30, 0.55, 0.3),
    "rubber": vh.material("rubber", 0x1b1b1d, 0.88, 0.0),
    "accent": vh.material("accent", 0xffffff, 0.5, 0.0, emit=(0xffffff, 1.0)),
}

# ======================================================================== the shell

FRONT, BACK = 2.62, -2.25
WHEEL_Y = (1.35, -1.35)
WHEEL_R, WHEEL_X, WHEEL_W = 0.38, 0.74, 0.28
ARCH_R = 0.425

W = lambda y: keys([(2.62, 0.2), (2.58, 0.36), (2.5, 0.5), (2.35, 0.66), (2.15, 0.79), (1.9, 0.875), (1.6, 0.915), (1.35, 0.925), (1.0, 0.915), (0.6, 0.9), (-0.1, 0.885), (-0.6, 0.89), (-1.0, 0.91), (-1.35, 0.92), (-1.75, 0.885), (-2.0, 0.82), (-2.15, 0.74), (-2.21, 0.65), (-2.24, 0.54), (-2.25, 0.44)], y)  # noqa: E731
ZBOT = lambda y: keys([(2.62, 0.34), (2.55, 0.3), (2.35, 0.275), (2.0, 0.262), (-1.8, 0.262), (-2.12, 0.285), (-2.21, 0.31), (-2.25, 0.37)], y)  # noqa: E731
# Height along the fender crowns and down the middle of the car.
FT = lambda y: keys([(2.62, 0.43), (2.55, 0.5), (2.4, 0.6), (2.15, 0.72), (1.85, 0.82), (1.55, 0.87), (1.3, 0.88), (1.0, 0.85), (0.7, 0.8), (0.3, 0.775), (-0.4, 0.765), (-0.8, 0.78), (-1.1, 0.82), (-1.4, 0.84), (-1.75, 0.8), (-2.0, 0.72), (-2.18, 0.62), (-2.23, 0.57), (-2.25, 0.52)], y)  # noqa: E731
CT = lambda y: keys([(2.62, 0.42), (2.55, 0.47), (2.35, 0.52), (2.0, 0.55), (1.5, 0.57), (1.1, 0.61), (0.7, 0.7), (0.35, 0.76), (-0.4, 0.77), (-1.0, 0.745), (-1.5, 0.7), (-1.9, 0.64), (-2.15, 0.585), (-2.23, 0.55), (-2.25, 0.51)], y)  # noqa: E731


def _s(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def ring(y):
    """Right half, bottom centre to top centre: floor, lower corner, flank, the shoulder rolling
    over the fender crown, then down into the valley in the middle."""
    w, zb, ft, ct = W(y), ZBOT(y), FT(y), CT(y)
    h = ft - zb
    rb = min(0.07, h * 0.28, w * 0.2)
    rs = min(0.11, h * 0.33, w * 0.22)
    xt = w - rs

    def zt(x):
        t = x / xt
        return ct + (ft - ct) * _s((t - 0.18) / 0.5) - 0.03 * max(0.0, (t - 0.72) / 0.28) ** 2

    zs = max(zt(xt) - rs, zb + rb + 0.004)
    a = vh.seg((0, zb), (w - rb, zb), 5)
    b = vh.arc(w - rb, zb + rb, rb, -math.pi / 2, 0, 4)
    c = vh.seg((w, zb + rb), (w, zs), 8, lambda t: (-0.025 * (1 - t) ** 2 + 0.006 * math.sin(math.pi * t), 0))
    d = vh.arc(w - rs, zs, rs, 0, math.pi / 2, 5)
    d[-1] = (xt, zt(xt))
    e = [(xt * (1 - i / 16), zt(xt * (1 - i / 16))) for i in range(17)]
    return vh.chain(a, b, c, d, e)


ys = [2.62, 2.617, 2.61, 2.6, 2.585, 2.565, 2.54, 2.51]
y = 2.47
while y > -2.14:
    ys.append(y)
    y -= 0.04
ys += [-2.17, -2.195, -2.215, -2.23, -2.24, -2.247, -2.25]
bm = bmesh.new()
vh.shell(bm, ys, ring)
body = vh.part("shell", bm, [M["paint"], M["under"], M["seat"]], smooth_angle=70)

# Wheel arches: a short cylinder per wheel (not right through: the hood dips lower than the
# arch tops), leaving dark wells.
for wy in WHEEL_Y:
    for s in (-1, 1):
        bm = bmesh.new()
        vh.cyl(bm, (s * 0.56, wy, WHEEL_R), (s * 1.3, wy, WHEEL_R), ARCH_R, ARCH_R, 48)
        vh.cut(body, vh.solid_bm_object("arch", bm), M["well"])
        bpy.data.objects.remove(bpy.data.objects["arch"])

# The open cockpit: a rounded tub sunk into the deck, lined in dark blue.
CK0, CK1, CKW = 0.32, -1.02, 0.44  # front and back edge (y), half width
bm = bmesh.new()
ring_pts = []
for j in range(48):
    a = j / 48 * TAU
    c, s_ = math.cos(a), math.sin(a)
    x = CKW * math.copysign(abs(c) ** 0.55, c)
    yy = (CK0 + CK1) / 2 + (CK0 - CK1) / 2 * math.copysign(abs(s_) ** 0.55, s_)
    ring_pts.append((x, yy))
low = [bm.verts.new((x * 0.92, (yy - (CK0 + CK1) / 2) * 0.95 + (CK0 + CK1) / 2, 0.5)) for x, yy in ring_pts]
high = [bm.verts.new((x, yy, 1.2)) for x, yy in ring_pts]
for j in range(48):
    j2 = (j + 1) % 48
    bm.faces.new((low[j], low[j2], high[j2], high[j]))
bm.faces.new(list(reversed(low)))
bm.faces.new(high)
vh.cut(body, vh.solid_bm_object("cockpit", bm), M["seat"])
bpy.data.objects.remove(bpy.data.objects["cockpit"])

vh.face_materials(body, lambda c, n: 1 if n.z < -0.6 and c.z < 0.4 else None, keep={body.data.materials.find("well"), body.data.materials.find("seat")})
vh._only(body)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(70), keep_sharp_edges=True)

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


def circle(cx, cy, r, n=24):
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


# ======================================================================== lamps, intake, badges

# Headlamps set into the tops of the front fenders, in chrome rings.
for s in (-1, 1):
    lay(f"headlamp{s}", circle(s * 0.62, 2.0, 0.085), TOP, M["lamp"], 0.006)
    loc, nor = surf.hit((s * 0.62, 2.0, 3), (0, 0, -1))
    bm = bmesh.new()
    rot = nor.to_track_quat("Z", "Y").to_matrix().to_4x4()
    vh.torus(bm, loc + nor * 0.006, 0.092, 0.014, segs=32, around=8, rot=rot)
    vh.part(f"hlring{s}", bm, M["chrome"], smooth_angle=60)

# The intake slot across the nose, and a thin red lip under it.
lay("intake", vh.outline(P((-0.3, 0.35), (0.3, 0.35), (0.34, 0.4), (-0.34, 0.4)), 4, 1), NOSE, M["trim"], 0.004)
lay("lip", vh.outline(P((-0.36, 0.315), (0.36, 0.315), (0.36, 0.333), (-0.36, 0.333)), 4, 1), NOSE, M["red"], 0.004)

# Round tail lamps in chrome bezels.
for s in (-1, 1):
    lay(f"tlbezel{s}", circle(s * 0.4, 0.5, 0.082), TAIL, M["chrome"], 0.004)
    lay(f"taillamp{s}", circle(s * 0.4, 0.5, 0.064), TAIL, M["tail"], 0.008)


def letter(name, string, size, at, normal, up, depth=0.004):
    """Red lettering lying on the body at `at`, facing `normal`, its top towards `up`."""
    n = V(normal).normalized()
    u = (V(up) - n * V(up).dot(n)).normalized()
    r = u.cross(n)
    # text() builds in its matrix's x/z plane facing -y: x = right, z = up, -y = out.
    rot = Matrix((r, -n, u)).transposed().to_4x4()
    obj = vh.text(name, string, size, Matrix.Translation(V(at)) @ rot, M["red"], depth)
    # Bend the letters onto the (curved) panel: each vertex keeps its height off the
    # letters' middle plane, measured from the surface under it.
    for v in obj.data.vertices:
        off = (v.co - V(at)).dot(n)
        loc, _ = surf.hit(v.co + n * 0.5, -n)
        if loc is not None:
            v.co = loc + n * (0.004 + depth + off)
    return obj


# "M" on the hood, upright to the driver (and the chase camera).
loc, nor = surf.hit((0, 1.45, 3), (0, 0, -1))
letter("hoodM", "M", 0.42, loc, nor, (0, 1, 0))

# "5" in a red ring on each door.
for s in (-1, 1):
    loc, nor = surf.hit((s * 2, -0.25, 0.53), (-s, 0, 0))
    bm = bmesh.new()
    rot = nor.to_track_quat("Z", "Y").to_matrix().to_4x4()
    vh.torus(bm, loc + nor * 0.004, 0.17, 0.014, segs=40, around=6, rot=rot, rx=1.0, ry=1.0)
    vh.part(f"ring5{s}", bm, M["red"], smooth_angle=60)
    letter(f"five{s}", "5", 0.24, loc, nor, (0, 0, 1))

# ======================================================================== strips, gaps and fittings

for s in (-1, 1):
    # The player's colour along the foot of each flank, between the arches.
    rays = [(V((s * 3, 0.85 - 1.7 * i / 30, 0.36)), V((-s, 0, 0))) for i in range(31)]  # cast from outside
    vh.part(f"accent{s}", vh.strip(surf, rays, -0.004, 0.007, 0.012, around=6, ex=1.0), M["accent"])
    # Door: a gap round it, below the cockpit's side.
    aim = side(s)
    line(f"gap_door{s}", [(0.28, 0.69), (0.28, 0.32), (-0.82, 0.32), (-0.82, 0.69)], aim)
    lay(f"handle{s}", vh.outline(P((-0.55, 0.64), (-0.55, 0.665), (-0.7, 0.665), (-0.7, 0.64)), 3, 1), aim, M["chrome"], 0.01)
    # Hood seams either side of the valley.
    line(f"gap_hood{s}", [(s * 0.34, 0.72), (s * 0.3, 1.6), (s * 0.18, 2.3)], TOP)
line("gap_hood", [(-0.34, 0.72), (0.34, 0.72)], TOP)

# Windscreen: a wrap-round sheet leaning back from the cowl, on a chrome frame.
WS_Y, WS_X, WS_H = CK0 + 0.06, 0.6, 0.3


def ws_point(u, v):
    """u -1..1 across, v 0..1 up the screen."""
    x = u * WS_X * (1 - 0.06 * v)
    yy = WS_Y - 0.26 * u * u - 0.16 * v
    loc, _ = surf.hit((u * WS_X, WS_Y - 0.26 * u * u, 3), (0, 0, -1))
    return V((x, yy, (loc.z if loc else 0.77) - 0.01 + WS_H * v))


bm = bmesh.new()
grid = [[bm.verts.new(ws_point(-1 + 2 * i / 16, j / 3)) for i in range(17)] for j in range(4)]
for j in range(3):
    for i in range(16):
        bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.008)
vh.part("windscreen", bm, M["glass"], smooth_angle=60)
bm = bmesh.new()
edge = [ws_point(-1, 0)] + [ws_point(-1 + 2 * i / 24, 1) for i in range(25)] + [ws_point(1, 0)]
vh.sweep(bm, edge, 0.014, around=8)
vh.part("wsframe", bm, M["chrome"], smooth_angle=60)

# Dash under the screen and the bucket seat behind the driver.
bm = bmesh.new()
vh.box(bm, (0, CK0 - 0.1, 0.66), (0.78, 0.16, 0.14))
vh.part("dash", bm, M["seat"], bevel=0.03, segments=3)
bm = bmesh.new()
vh.box(bm, (0, -0.62, 0.6), (0.56, 0.5, 0.12))
vh.part("cushion", bm, M["trim"], bevel=0.04, segments=3)
bm = bmesh.new()
vh.box(bm, (0, -0.86, 0.86), (0.58, 0.12, 0.62), Matrix.Rotation(-0.22, 4, "X"))
vh.part("seatback", bm, M["trim"], bevel=0.05, segments=3)

# Twin exhausts out of the tail, under the lamps.
for s in (-1, 1):
    bm = bmesh.new()
    vh.lathe(bm, [(-1.95, 0.07), (-2.42, 0.07), (-2.45, 0.08), (-2.46, 0.075), (-2.3, 0.06)], 20, Matrix.Translation((s * 0.35, 0, 0.33)), cap1=True)
    vh.part(f"exhaust{s}", bm, M["chrome"], smooth_angle=50)
    vh.marker("exhaust_L" if s < 0 else "exhaust_R", (s * 0.35, -2.46, 0.33))

# ======================================================================== wheels


def face(group, m):
    """Chrome dish with eight vents and a two-eared knock-off spinner."""
    bm = bmesh.new()
    vh.lathe(bm, [(0.0, 0.25), (0.012, 0.24), (0.02, 0.2), (0.03, 0.12), (0.035, 0.06), (0.036, 0.0)], 48, m)
    vh.part(f"{group}_dish", bm, M["chrome"], smooth_angle=35, group=group)
    bm = bmesh.new()
    for k in range(8):
        a = k / 8 * TAU
        vh.cyl(bm, m @ V((0.16 * math.cos(a), 0.0, 0.16 * math.sin(a))), m @ V((0.16 * math.cos(a), 0.04, 0.16 * math.sin(a))), 0.032, 0.032, 12)
    vh.part(f"{group}_vents", bm, M["rim"], group=group)
    bm = bmesh.new()
    vh.lathe(bm, [(0.03, 0.06), (0.06, 0.055), (0.085, 0.04), (0.09, 0.0)], 20, m)
    vh.part(f"{group}_hub", bm, M["chrome"], group=group)
    bm = bmesh.new()
    vh.box(bm, m @ V((0, 0.075, 0)), (0.2, 0.025, 0.035), m.to_3x3().to_4x4())
    vh.part(f"{group}_spinner", bm, M["chrome"], bevel=0.008, group=group)


for name, wy, s in (("wheel_FL", WHEEL_Y[0], -1), ("wheel_FR", WHEEL_Y[0], 1), ("wheel_RL", WHEEL_Y[1], -1), ("wheel_RR", WHEEL_Y[1], 1)):
    vh.wheel(name, (s * WHEEL_X, wy, WHEEL_R), s, WHEEL_R, WHEEL_W, 0.26, {"rubber": M["rubber"], "rim": M["chrome"]}, cap=face)

# ======================================================================== bake, join, export


def tint(o, co, n):
    if o["group"] != "body" or o.data.materials[0].name != "paint":
        return (1, 1, 1)
    dust = max(0.0, 1 - (co.z - 0.26) / 0.25) * 0.1
    return (1 - dust, 1 - dust * 1.05, 1 - dust * 1.15)


vh.bake_ao(ground=0.0, samples=96, distance=0.6, floor=0.42, tint=tint, pct=0.8)
nodes = vh.join_groups()
print("RESULT tris", vh.stats(), "nodes", sorted(nodes))
size = vh.export(OUT)
print(f"RESULT {OUT} {size // 1024} KB")

if PREVIEW:
    vh.preview(
        PREVIEW,
        "mach5",
        [("front", 35, 15, 9), ("side", 90, 5, 9), ("rear", 145, 18, 9), ("top", 0.01, 80, 9.5), ("cockpit", 20, 35, 3.6, (0, 0.0, 0.7)), ("wheel", 75, 3, 2.4, (0.8, 1.35, 0.4))],
        target=(0, 0, 0.55),
    )
