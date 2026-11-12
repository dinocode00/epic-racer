"""The 1989 Batmobile, in gloss black, modelled in Blender.

    python tools/blender/batmobile.py -- apps/game/src/render/models/batmobile.glb [--preview DIR]

One long, low shell: the hood running out to the turbine at the nose, pods over the front
wheels with a valley between them, the body rising to the cockpit and falling away to the
tail, the rear fenders swelling over the bigger back wheels. On it: the turbine (a chrome lip
round a dark cowl, its fan spinning with speed), the glass canopy on a black frame (the game
seats the driver under it), the two swept bat-wing fins rising off the back, ribbed side
intakes with chrome slats, the afterburner nozzle with its glowing core, and lamps and a hood
line in the player's colour. Wheels: chrome lips round black faces with the gold bat emblem.

The same footprint (5.6 m by 2.15 m), wheel positions and exhaust point as the code-built car
it replaces.
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
OUT = argv[0] if argv else "batmobile.glb"
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None

vh.reset()

M = {
    "paint": vh.material("paint", 0x101114, 0.22, 0.75),
    "under": vh.material("under", 0x1a1b1d, 0.85, 0.0),
    "well": vh.material("well", 0x050506, 0.95, 0.0),
    "trim": vh.material("trim", 0x26282e, 0.5, 0.6),
    "cowl": vh.material("cowl", 0x050505, 0.6, 0.3),
    "glass": vh.material("glass", 0x0d1626, 0.08, 0.9),
    "chrome": vh.material("chrome", 0xdedfe3, 0.18, 1.0),
    "amber": vh.material("amber", 0xff8a1a, 0.2, 0.0, emit=(0xff8a1a, 2.0)),
    "gold": vh.material("gold", 0xd9b43a, 0.35, 0.6),
    "rim": vh.material("rim", 0x111111, 0.5, 0.3),
    "rubber": vh.material("rubber", 0x1b1b1d, 0.88, 0.0),
    "accent": vh.material("accent", 0xffffff, 0.5, 0.0, emit=(0xffffff, 1.0)),
}

# ======================================================================== the shell

FRONT, BACK = 2.8, -2.8  # the turbine's lip, the afterburner
WHEELS = ((1.75, 0.42, 0.49), (-1.75, 0.46, 0.53))  # axle y, wheel radius, arch radius
WHEEL_X, WHEEL_W = 0.98, 0.36

W = lambda y: keys([(2.62, 0.42), (2.58, 0.6), (2.48, 0.8), (2.3, 0.96), (2.05, 1.045), (1.75, 1.075), (1.35, 1.065), (0.8, 1.0), (0.0, 0.98), (-0.8, 1.0), (-1.35, 1.065), (-1.75, 1.075), (-2.2, 1.03), (-2.5, 0.92), (-2.7, 0.74), (-2.78, 0.6), (-2.8, 0.5)], y)  # noqa: E731
ZBOT = lambda y: keys([(2.62, 0.3), (2.55, 0.26), (2.35, 0.235), (-2.4, 0.235), (-2.7, 0.27), (-2.8, 0.32)], y)  # noqa: E731
FT = lambda y: keys([(2.62, 0.5), (2.55, 0.6), (2.4, 0.74), (2.2, 0.88), (1.95, 0.97), (1.7, 1.0), (1.4, 0.97), (1.0, 0.88), (0.5, 0.84), (-0.5, 0.86), (-1.1, 0.94), (-1.5, 1.02), (-1.8, 1.04), (-2.15, 0.96), (-2.5, 0.8), (-2.72, 0.66), (-2.8, 0.58)], y)  # noqa: E731
CT = lambda y: keys([(2.62, 0.5), (2.55, 0.57), (2.4, 0.63), (2.1, 0.7), (1.5, 0.76), (0.9, 0.86), (0.4, 0.93), (-0.5, 0.96), (-1.2, 0.9), (-1.8, 0.82), (-2.3, 0.74), (-2.6, 0.68), (-2.8, 0.58)], y)  # noqa: E731


def _s(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def ring(y):
    """Right half, bottom centre to top centre: floor, lower corner, flank, the shoulder rolling
    over the fender, then across to the middle."""
    w, zb, ft, ct = W(y), ZBOT(y), FT(y), CT(y)
    h = ft - zb
    rb = min(0.09, h * 0.28, w * 0.2)
    rs = min(0.16, h * 0.33, w * 0.22)
    xt = w - rs

    def zt(x):
        t = x / xt
        return ct + (ft - ct) * _s((t - 0.2) / 0.5) - 0.035 * max(0.0, (t - 0.72) / 0.28) ** 2

    zs = max(zt(xt) - rs, zb + rb + 0.004)
    a = vh.seg((0, zb), (w - rb, zb), 5)
    b = vh.arc(w - rb, zb + rb, rb, -math.pi / 2, 0, 4)
    c = vh.seg((w, zb + rb), (w, zs), 8, lambda t: (-0.04 * (1 - t) ** 2 + 0.008 * math.sin(math.pi * t), 0))
    d = vh.arc(w - rs, zs, rs, 0, math.pi / 2, 5)
    d[-1] = (xt, zt(xt))
    e = [(xt * (1 - i / 16), zt(xt * (1 - i / 16))) for i in range(17)]
    return vh.chain(a, b, c, d, e)


ys = [2.62, 2.617, 2.61, 2.6, 2.585, 2.565, 2.54, 2.51]
y = 2.47
while y > -2.66:
    ys.append(y)
    y -= 0.045
ys += [-2.69, -2.72, -2.745, -2.765, -2.78, -2.79, -2.797, -2.8]
bm = bmesh.new()
vh.shell(bm, ys, ring)
body = vh.part("shell", bm, [M["paint"], M["under"]], smooth_angle=70)
for wy, wr, ar in WHEELS:
    for s in (-1, 1):
        bm = bmesh.new()
        vh.cyl(bm, (s * 0.6, wy, wr), (s * 1.4, wy, wr), ar, ar, 48)
        vh.cut(body, vh.solid_bm_object("arch", bm), M["well"])
        bpy.data.objects.remove(bpy.data.objects["arch"])
vh.face_materials(body, lambda c, n: 1 if n.z < -0.6 and c.z < 0.34 else None, keep={body.data.materials.find("well")})
vh._only(body)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(70), keep_sharp_edges=True)

surf = vh.Surface(body)


def side(s):
    return (lambda u, v: V((s * 2.0, u, v))), V((-s, 0, 0))  # (u, v) = (y, z)


TOP = (lambda u, v: V((u, v, 3.0))), V((0, 0, -1))  # (x, y)
TAIL = (lambda u, v: V((u, -3.5, v))), V((0, 1, 0))


def lay(name, poly, aim, mat, lift, thick=None, group="body"):
    bm = vh.panel(surf, poly, aim[0], aim[1], lift, lift if thick is None else thick)
    return vh.part(name, bm, mat, smooth_angle=60, group=group, weld=False)


def P(*pts):
    return [V(p) for p in pts]


def rect(u0, v0, u1, v1, per=3, r=1):
    return vh.outline(P((u0, v0), (u1, v0), (u1, v1), (u0, v1)), per, r)


# ======================================================================== the turbine

TZ, TY = 0.5, 2.8  # its centre height; the lip's front (y)
bm = bmesh.new()
# The cowl: out of the hood, round to the lip, then back in as the throat.
vh.lathe(bm, [(2.2, 0.2), (2.4, 0.31), (2.6, 0.345), (TY - 0.02, 0.34), (TY, 0.31), (TY - 0.05, 0.27), (TY - 0.16, 0.25), (TY - 0.18, 0.0)], 40, Matrix.Translation((0, 0, TZ)))
vh.part("cowl", bm, M["paint"], smooth_angle=55)
bm = bmesh.new()
vh.torus(bm, (0, TY - 0.012, TZ), 0.3, 0.032, segs=40, around=10, rot=Matrix.Rotation(math.pi / 2, 4, "X"))
vh.part("lip", bm, M["chrome"], smooth_angle=60)
bm = bmesh.new()
vh.cyl(bm, (0, TY - 0.17, TZ), (0, TY - 0.16, TZ), 0.255, 0.255, 32)
vh.part("throat", bm, M["cowl"])
# The fan: its own node, spun by the game about the car's long axis.
FAN = (0, TY - 0.1, TZ)
vh.pivot("fan_T", FAN)
bm = bmesh.new()
for k in range(10):
    a = k / 10 * TAU
    rot = Matrix.Rotation(a, 4, "Y") @ Matrix.Rotation(0.5, 4, "Z")
    vh.box(bm, V(FAN) + Matrix.Rotation(a, 3, "Y") @ V((0, 0, 0.14)), (0.08, 0.012, 0.2), rot)
vh.part("blades", bm, M["chrome"], group="fan_T", smooth_angle=30, weld=False)
bm = bmesh.new()
vh.lathe(bm, [(FAN[1] - 0.03, 0.07), (FAN[1] + 0.02, 0.065), (FAN[1] + 0.06, 0.0)], 20, Matrix.Translation((0, 0, TZ)))
vh.part("spinner", bm, M["chrome"], group="fan_T", smooth_angle=60)

# ======================================================================== canopy and fins

CY, CZ = -0.45, 0.9
bm = bmesh.new()
vh.ball(bm, (0, CY, CZ), (0.63, 1.25, 0.46), 32)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < CZ - 0.12], context="VERTS")
vh.part("canopy", bm, M["glass"], smooth_angle=80)
pts = []
for k in range(49):
    a = k / 48 * TAU
    x, yy = 0.62 * math.cos(a), CY + 1.235 * math.sin(a)
    loc, _ = surf.hit((x, yy, 3), (0, 0, -1))
    pts.append(V((x, yy, max(loc.z if loc else CZ, CZ - 0.06) + 0.01)))
bm = bmesh.new()
vh.sweep(bm, pts, 0.03, around=8, caps=False)
vh.part("canopyframe", bm, M["trim"], smooth_angle=60)

# The bat-wing fins, swept up off the back and leaning out.
FIN = vh.chaikin([V(p) for p in [(-0.55, 0.55), (-1.3, 1.0), (-2.2, 1.42), (-2.98, 1.86), (-2.8, 1.4), (-2.56, 1.12), (-2.66, 0.88), (-2.74, 0.55)]], 1)
for s in (-1, 1):
    bm = bmesh.new()
    m = Matrix.Translation((s * 0.82, 0, 0)) @ Matrix.Rotation(s * 0.2, 4, "Y") @ Matrix.Rotation(math.pi / 2, 4, "Z")
    vh.plate(bm, [(p.x, p.y) for p in FIN], 0.07, m)
    vh.part(f"fin{s}", bm, M["paint"], bevel=0.02, segments=2, smooth_angle=40)

# ======================================================================== sides, tail, hood

for s in (-1, 1):
    aim = side(s)
    lay(f"skirt{s}", rect(1.15, 0.3, -1.1, 0.54, 6, 1), aim, M["trim"], 0.025)
    for k in range(7):
        yk = 0.75 - k * 0.25
        lay(f"slat{s}{k}", rect(yk + 0.03, 0.33, yk - 0.03, 0.51, 2, 1), aim, M["chrome"], 0.045)
# Afterburner: a chrome nozzle out of the tail with its glowing core.
NZ = 0.6
bm = bmesh.new()
vh.lathe(bm, [(-2.5, 0.24), (-2.82, 0.27), (-2.9, 0.29), (-2.92, 0.27), (-2.86, 0.235), (-2.7, 0.21)], 32, Matrix.Translation((0, 0, NZ)))
vh.part("nozzle", bm, M["chrome"], smooth_angle=45)
bm = bmesh.new()
vh.cyl(bm, (0, -2.74, NZ), (0, -2.72, NZ), 0.21, 0.21, 24)
vh.part("burner", bm, M["amber"])
vh.marker("exhaust", (0, -2.9, NZ))
# Tail lamps and a line down the hood in the player's colour.
for s in (-1, 1):
    lay(f"tail{s}", rect(s * 0.42, 0.74, s * 0.9, 0.8, 4, 1), TAIL, M["accent"], 0.01)
rays = [(V((0, 2.45 - 1.3 * i / 20, 3)), V((0, 0, -1))) for i in range(21)]
vh.part("hoodline", vh.strip(surf, rays, -0.004, 0.03, 0.006, around=6, ex=1.0), M["accent"])

# ======================================================================== wheels

# The bat, as on the hubcaps: wings out, ears up (y up, 1 unit = half its span).
BAT = [(-1.0, 0.16), (-0.6, 0.18), (-0.44, 0.4), (-0.2, 0.12), (-0.12, 0.36), (0.0, 0.2), (0.12, 0.36), (0.2, 0.12), (0.44, 0.4), (0.6, 0.18), (1.0, 0.16), (0.7, -0.1), (0.52, -0.4), (0.3, -0.2), (0.0, -0.44), (-0.3, -0.2), (-0.52, -0.4), (-0.7, -0.1)]


def batcap(group, m):
    bm = bmesh.new()
    vh.lathe(bm, [(0.0, 0.27), (0.02, 0.255), (0.03, 0.2), (0.035, 0.0)], 48, m)
    vh.part(f"{group}_face", bm, M["rim"], smooth_angle=35, group=group)
    bm = bmesh.new()
    # A gold oval and the black bat on it, standing proud of the face.
    oval = [(0.16 * math.cos(k / 32 * TAU), 0.1 * math.sin(k / 32 * TAU)) for k in range(32)]
    vh.plate(bm, oval, 0.012, m @ Matrix.Translation((0, 0.042, 0)))
    vh.part(f"{group}_oval", bm, M["gold"], group=group, smooth_angle=30)
    bm = bmesh.new()
    vh.plate(bm, [(u * 0.15, v * 0.15) for u, v in BAT], 0.012, m @ Matrix.Translation((0, 0.052, 0)))
    vh.part(f"{group}_bat", bm, M["rim"], group=group, smooth_angle=30)


for name, (wy, wr, _), s in (("wheel_FL", WHEELS[0], -1), ("wheel_FR", WHEELS[0], 1), ("wheel_RL", WHEELS[1], -1), ("wheel_RR", WHEELS[1], 1)):
    vh.wheel(name, (s * WHEEL_X, wy, wr), s, wr, WHEEL_W, 0.29, {"rubber": M["rubber"], "rim": M["chrome"]}, cap=batcap)

# ======================================================================== bake, join, export

vh.bake_ao(ground=0.0, samples=96, distance=0.7, floor=0.42, pct=0.8)
nodes = vh.join_groups()
print("RESULT tris", vh.stats(), "nodes", sorted(nodes))
size = vh.export(OUT)
print(f"RESULT {OUT} {size // 1024} KB")

if PREVIEW:
    vh.preview(
        PREVIEW,
        "batmobile",
        [("front", 35, 15, 10.5), ("side", 90, 5, 10.5), ("rear", 145, 18, 10.5), ("nose", 15, 8, 3.6, (0, 2.5, 0.55)), ("wheel", 75, 3, 2.6, (1.0, 1.75, 0.42))],
        target=(0, 0, 0.7),
    )
