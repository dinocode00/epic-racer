"""Two old farm tractors for the Drefahl Farm, modelled from photos and the factory specs.

    python tools/blender/tractors.py -- apps/game/src/render/models/tractors.glb [--preview DIR]

"wd45": a 1954 Allis-Chalmers WD45 in Persian Orange. A square radiator shroud with a fine
mesh grille, WD 45 on its sides; a narrow flat-topped hood lettered ALLIS-CHALMERS over the
open engine (block, head, manifold, generator, carburettor); a rounded fuel tank behind it with
the battery box under; the steering shaft rising over the tank to a high wheel; a chrome
muffler on a tall stack and an orange air-cleaner cap; channel frame rails running out past
the grille to the front bumper; a wide front axle on 6.00-16 tyres; 13-28 rear tyres with
bar lugs on silver rims round orange centres (the power-adjusted wheels with their clamps);
small round fenders and a pan seat on a leaf spring; the Snap-Coupler hitch behind.

"sc": a 1953 J.I. Case SC row-crop in Flambeau Red. A tall shroud with a louvred grille of
horizontal bars under a CASE badge, CASE on the hood sides; the open engine under a narrow
hood; a rounded fuel tank with a headlamp either side; the side steering rod running from the
wheel down the right to the gearbox on top of the front pedestal; twin 5.00-15 front wheels
close together under the pedestal (a tricycle front); 10-38 rear tyres on silver rims round
red centres; big round fenders; the belt pulley on the right; a pan seat; the Eagle Hitch.

Both stand on the ground (z = 0), centred between the axles, facing +y; real metres. Each is
one node of its own (joined, one draw per material), with Blender's occlusion baked into
vertex colour. They are built 2.5 m either side of the origin for the bake and the preview;
the game puts each where it goes.

Coordinates: Blender z-up; the exporter writes the game's y-up (facing -z).
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
OUT = argv[0] if argv else "tractors.glb"
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None

vh.reset()

M = {
    # Old enamel, a little chalky: Allis-Chalmers Persian Orange and Case Flambeau Red.
    "orange": vh.material("orange", 0xe0621a, 0.42, 0.12),
    "red": vh.material("red", 0xc43a1d, 0.42, 0.12),
    "rim": vh.material("rim", 0xb8bbbe, 0.38, 0.6),  # silver-painted rims
    "rubber": vh.material("rubber", 0x1b1b1b, 0.92, 0.0),
    "iron": vh.material("iron", 0x38383a, 0.6, 0.45),  # manifolds, pipes, axle ends
    "chrome": vh.material("chrome", 0xd9dbde, 0.14, 1.0),
    "black": vh.material("black", 0x141414, 0.6, 0.05),  # lettering, wheels, lamp bodies
    "mesh": vh.material("mesh", 0x2c2c2c, 0.55, 0.35),  # grille screen and bars
    "dark": vh.material("dark", 0x0b0b0b, 0.95, 0.0),  # behind the grille
    "lens": vh.material("lens", 0xe9e4d2, 0.08, 0.0),
}


def rot_x(a):
    return Matrix.Rotation(a, 4, "X")


def rot_y(a):
    return Matrix.Rotation(a, 4, "Y")


def rot_z(a):
    return Matrix.Rotation(a, 4, "Z")


def T(p):
    return Matrix.Translation(V(p))


# ======================================================================== shared parts


def wheel_frame(centre, side):
    """A wheel's frame: the lathe's axis (local y) pointing out of the tractor (side -1 left)."""
    return T(centre) @ rot_z(-side * math.pi / 2)


def tyre(G, name, m, R, w, rim_r, lugs, lug_h, sweep):
    """A tractor tyre: a rounded carcass and two rows of angled bar lugs, staggered either
    side of the centre line (the chevron tread)."""
    rc = R - lug_h
    hw = w / 2
    prof = [
        (-hw * 0.8, rim_r * 1.02),
        (-hw * 0.97, rim_r + (rc - rim_r) * 0.3),
        (-hw, rim_r + (rc - rim_r) * 0.65),
        (-hw * 0.9, rc * 0.975),
        (-hw * 0.55, rc),
        (0.0, rc * 1.004),
        (hw * 0.55, rc),
        (hw * 0.9, rc * 0.975),
        (hw, rim_r + (rc - rim_r) * 0.65),
        (hw * 0.97, rim_r + (rc - rim_r) * 0.3),
        (hw * 0.8, rim_r * 1.02),
    ]
    bm = bmesh.new()
    vh.lathe(bm, prof, 48, m)
    vh.part(f"{name}_carcass", bm, M["rubber"], smooth_angle=50, group=G)
    # Lugs: each a bar from near the centre out over the shoulder, raked round the tyre.
    bm = bmesh.new()
    th_w = 0.055 / R  # the bar's thickness, as an angle
    for s in (-1, 1):
        for i in range(lugs):
            th0 = i / lugs * TAU + (0.5 / lugs * TAU if s > 0 else 0.0)
            rows = []
            for k in range(5):
                u = k / 4
                y = s * hw * (0.06 + 0.98 * u)
                th = th0 + u * sweep
                top = R - (lug_h * 0.55 if u > 0.92 else 0.0)  # rounded off at the shoulder
                base = rc - 0.012 - (0.02 if u > 0.92 else 0.0)
                row = []
                for r, dt in ((base, -th_w / 2), (top, -th_w / 2), (top, th_w / 2), (base, th_w / 2)):
                    row.append(bm.verts.new(m @ V((r * math.cos(th + dt), y, r * math.sin(th + dt)))))
                rows.append(row)
            for a, b in zip(rows, rows[1:]):
                for j in range(4):
                    j2 = (j + 1) % 4
                    bm.faces.new((a[j], a[j2], b[j2], b[j]))
            bm.faces.new(rows[0])
            bm.faces.new(list(reversed(rows[-1])))
    vh.part(f"{name}_lugs", bm, M["rubber"], smooth_angle=40, group=G)


def rear_wheel(G, name, centre, side, R, w, rim_r, paint, clamps):
    """A rear wheel: lugged tyre; a silver rim; a dished centre disc in the tractor's colour
    with its wheel bolts and hub; `clamps` adds the power-adjust clamps round the disc."""
    m = wheel_frame(centre, side)
    tyre(G, name, m, R, w, rim_r, 22, 0.05, 0.3)
    hw = w / 2
    bm = bmesh.new()
    # Rim: the barrel with its flanges, then the wide silver band inward, as one closed ring.
    vh.lathe(
        bm,
        [
            (-hw * 0.82, rim_r + 0.03),
            (-hw * 0.78, rim_r),
            (hw * 0.78, rim_r),
            (hw * 0.82, rim_r + 0.03),
            (hw * 0.86, rim_r + 0.02),
            (hw * 0.8, rim_r - 0.015),
            (hw * 0.25, rim_r * 0.74),
            (hw * 0.14, rim_r * 0.74),
            (-hw * 0.7, rim_r - 0.02),
        ],
        48,
        m,
    )
    vh.part(f"{name}_rim", bm, M["rim"], smooth_angle=35, group=G)
    bm = bmesh.new()
    vh.lathe(
        bm,
        [
            (hw * 0.0, 0.0),
            (hw * 0.0, rim_r * 0.7),
            (hw * 0.12, rim_r * 0.76),
            (hw * 0.18, rim_r * 0.76),
            (hw * 0.3, rim_r * 0.7),
            (hw * 0.42, rim_r * 0.45),
            (hw * 0.46, 0.13),
            (hw * 0.62, 0.11),
            (hw * 0.66, 0.085),
            (hw * 0.66, 0.0),
        ],
        40,
        m,
    )
    for k in range(8):
        a = k / 8 * TAU
        c = V((0.15 * math.cos(a), hw * 0.47, 0.15 * math.sin(a)))
        vh.cyl(bm, m @ c, m @ (c + V((0, 0.03, 0))), 0.017, segs=6)
    if clamps:
        for k in range(3):
            a = k / 3 * TAU + 0.4
            c = V((rim_r * 0.74 * math.cos(a), hw * 0.26, rim_r * 0.74 * math.sin(a)))
            vh.box(bm, m @ c, (0.07, 0.06, 0.05), rot_z(-side * math.pi / 2) @ rot_y(-a))
    vh.part(f"{name}_disc", bm, paint, bevel=0.004, segments=1, smooth_angle=40, group=G)


def front_wheel(G, name, centre, side, R, w, rim_r, paint, ribs=3):
    """A front wheel: a ribbed tyre on a dished disc wheel with a hub cap."""
    m = wheel_frame(centre, side)
    hw = w / 2
    prof = [(-hw * 0.8, rim_r * 1.02), (-hw, rim_r + (R - rim_r) * 0.5), (-hw * 0.85, R * 0.96)]
    # Ribs round the crown, with grooves between.
    n = ribs * 2 + 1
    for k in range(n + 1):
        y = -hw * 0.7 + 1.4 * hw * k / n
        prof.append((y, R if k % 2 == 0 else R - 0.012))
    prof += [(hw * 0.85, R * 0.96), (hw, rim_r + (R - rim_r) * 0.5), (hw * 0.8, rim_r * 1.02)]
    bm = bmesh.new()
    vh.lathe(bm, prof, 36, m)
    vh.part(f"{name}_tyre", bm, M["rubber"], smooth_angle=50, group=G)
    bm = bmesh.new()
    vh.lathe(
        bm,
        [
            (-hw * 0.1, 0.0),
            (-hw * 0.1, rim_r * 0.5),
            (hw * 0.3, rim_r * 0.85),
            (-hw * 0.7, rim_r - 0.01),
            (-hw * 0.8, rim_r + 0.015),
            (-hw * 0.75, rim_r),
            (hw * 0.75, rim_r),
            (hw * 0.8, rim_r + 0.015),
            (hw * 0.84, rim_r + 0.01),
            (hw * 0.6, rim_r * 0.8),
            (hw * 0.75, rim_r * 0.45),
            (hw * 0.95, 0.06),
            (hw * 1.25, 0.05),
            (hw * 1.3, 0.0),
        ],
        36,
        m,
    )
    vh.part(f"{name}_disc", bm, paint, smooth_angle=40, group=G)


def fender(G, name, x_in, x_out, cy, cz, r, phi0, phi1, paint, skirt=0.0, roll=True):
    """A round fender over a rear wheel: a curved sheet from phi0 to phi1 (0 = forward,
    90 = straight up), a flat inner panel down toward the axle and a rolled outer edge.
    skirt: how far down the inner panel reaches (metres below the sheet)."""
    bm = bmesh.new()
    n = 20
    t = 0.008
    a0, a1 = math.radians(phi0), math.radians(phi1)
    rows = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        d = V((0, math.cos(a), math.sin(a)))
        rows.append([V((x, cy, cz)) + d * rr for x, rr in ((x_in, r), (x_out, r), (x_out, r + t), (x_in, r + t))])
    vs = [[bm.verts.new(p) for p in row] for row in rows]
    for a, b in zip(vs, vs[1:]):
        for j in range(4):
            j2 = (j + 1) % 4
            bm.faces.new((a[j], b[j], b[j2], a[j2]))
    bm.faces.new(vs[0])
    bm.faces.new(list(reversed(vs[-1])))
    vh.part(f"{name}_sheet", bm, paint, bevel=0.003, segments=1, smooth_angle=60, group=G)
    # The inner panel: a flat sector from the sheet down toward the axle.
    if skirt > 0:
        bm = bmesh.new()
        sx = x_in if x_out > x_in else x_in
        dx = 0.006 if x_out > x_in else -0.006
        outline = []
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / n
            outline.append((math.cos(a) * (r + t), math.sin(a) * (r + t)))
        for i in range(n, -1, -1):
            a = a0 + (a1 - a0) * i / n
            outline.append((math.cos(a) * (r - skirt), math.sin(a) * (r - skirt)))
        a = [bm.verts.new(V((sx, cy + u, cz + v))) for u, v in outline]
        b = [bm.verts.new(V((sx + dx, cy + u, cz + v))) for u, v in outline]
        k = len(outline)
        for i in range(n):
            # Quads between the outer arc (i) and the inner arc (mirror index).
            o0, o1 = i, i + 1
            i0, i1 = k - 1 - i, k - 2 - i
            bm.faces.new((a[o0], a[o1], a[i1], a[i0]))
            bm.faces.new((b[i0], b[i1], b[o1], b[o0]))
        for i in range(k):
            i2 = (i + 1) % k
            bm.faces.new((a[i], b[i], b[i2], a[i2]))
        vh.part(f"{name}_panel", bm, paint, smooth_angle=30, group=G)
    if roll:
        bm = bmesh.new()
        pts = []
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / n
            pts.append(V((x_out, cy + math.cos(a) * (r + 0.006), cz + math.sin(a) * (r + 0.006))))
        vh.sweep(bm, pts, 0.012, around=6)
        vh.part(f"{name}_roll", bm, paint, smooth_angle=60, group=G)


def pan_seat(G, name, at, paint, tilt=0.12):
    """A pressed-steel pan seat: a shallow dish, its back and sides raised, drain holes left out."""
    bm = bmesh.new()
    prof = [(0.0, 0.0), (0.0, 0.15), (0.02, 0.19), (0.05, 0.21), (0.075, 0.215), (0.08, 0.205), (0.055, 0.19), (0.02, 0.165), (0.012, 0.14), (0.012, 0.0)]
    m = T(at) @ rot_x(tilt) @ rot_x(math.pi / 2)  # lathe axis (y) -> up
    rows = vh.lathe(bm, prof, 32, m)
    # Raise the back half of the rim into a seat back; the pan is a little longer than wide.
    c = V(at)
    for row in rows:
        for v in row:
            d = v.co - c
            v.co.x = c.x + d.x * 1.0
            v.co.y = c.y + d.y * 1.1
            h = max(0.0, min(1.0, d.z / 0.07))
            back = max(0.0, -d.y / 0.2)
            v.co.z += h * back * back * 0.12
            v.co.y -= h * back * back * 0.03
    vh.part(name, bm, paint, smooth_angle=60, group=G)


def steering_wheel(G, name, centre, normal, R=0.2):
    """A black steering wheel: rim, three spokes, a hub; `normal` points out of its face."""
    n = V(normal).normalized()
    rot = V((0, 0, 1)).rotation_difference(n).to_matrix().to_4x4()
    m = T(centre) @ rot
    bm = bmesh.new()
    vh.torus(bm, (0, 0, 0), R, 0.014, segs=32, around=8, rot=Matrix.Identity(4))
    for k in range(3):
        a = k / 3 * TAU + math.pi / 2
        p0 = V((0.03 * math.cos(a), 0.03 * math.sin(a), -0.01))
        p1 = V(((R - 0.01) * math.cos(a), (R - 0.01) * math.sin(a), 0))
        vh.cyl(bm, p0, p1, 0.009, segs=6)
    vh.cyl(bm, (0, 0, -0.05), (0, 0, 0.01), 0.04, 0.03, segs=12)
    bm.transform(m)
    vh.part(name, bm, M["black"], smooth_angle=50, group=G)


def stack(G, name, base, top, r, muffler=None, cap=True):
    """An exhaust stack: an iron pipe with an optional chrome muffler (z0, z1, r) and a
    slanted rain-cut top."""
    bm = bmesh.new()
    vh.cyl(bm, base, top, r, segs=12)
    vh.part(f"{name}_pipe", bm, M["iron"], smooth_angle=40, group=G)
    if muffler:
        z0, z1, mr = muffler
        bm = bmesh.new()
        vh.lathe(bm, [(0, 0.0), (0, r * 1.05), (0.03, mr), (z1 - z0 - 0.03, mr), (z1 - z0, r * 1.05), (z1 - z0, 0.0)], 20, T((base[0], base[1], z0)) @ rot_x(math.pi / 2))
        vh.part(f"{name}_muffler", bm, M["chrome"], smooth_angle=40, group=G)


def letters(G, name, string, size, matrix, mat):
    o = vh.text(name, string, size, matrix, mat, depth=0.003)
    o["group"] = G
    return o


def side_frame(side, at):
    """A frame for lettering on a tractor's side (side -1 left, +1 right): reading from the
    front to the back on the left, back to front on the right, facing out."""
    if side < 0:
        cols = (V((0, -1, 0)), V((1, 0, 0)), V((0, 0, 1)))
    else:
        cols = (V((0, 1, 0)), V((-1, 0, 0)), V((0, 0, 1)))
    m = Matrix.Identity(4)
    for i, c in enumerate(cols):
        m[0][i], m[1][i], m[2][i] = c.x, c.y, c.z
    return T(at) @ m


def rbox(G, name, centre, size, mat, bevel=0.02, rot=None, segments=2):
    bm = bmesh.new()
    vh.box(bm, centre, size, rot)
    return vh.part(name, bm, mat, bevel=bevel, segments=segments, group=G)


def engine(G, P, y0, y1, z0, z1, w, left_manifold=True):
    """The open engine under the hood: block and head in the paint, the manifold along one
    side, a generator and a carburettor, the oil filter, and the plug leads."""
    yc = (y0 + y1) / 2
    rbox(G, f"{G}_block", (0, yc, (z0 + z1) / 2 - 0.05), (w, y1 - y0, z1 - z0 - 0.1), P, 0.025)
    rbox(G, f"{G}_head", (0, yc, z1 - 0.06), (w * 0.85, y1 - y0 - 0.04, 0.12), P, 0.02)
    rbox(G, f"{G}_pan", (0, yc - 0.03, z0 - 0.04), (w * 0.9, y1 - y0 - 0.1, 0.1), P, 0.03)
    s = -1 if left_manifold else 1
    bm = bmesh.new()
    vh.cyl(bm, (s * (w / 2 + 0.03), y0 + 0.05, z1 - 0.13), (s * (w / 2 + 0.03), y1 - 0.05, z1 - 0.13), 0.045, segs=10)
    for k in range(4):
        y = y0 + 0.1 + (y1 - y0 - 0.2) * k / 3
        vh.cyl(bm, (s * w / 2, y, z1 - 0.1), (s * (w / 2 + 0.035), y, z1 - 0.13), 0.028, segs=8)
    vh.part(f"{G}_manifold", bm, M["iron"], smooth_angle=40, group=G)
    bm = bmesh.new()
    vh.cyl(bm, (-s * (w / 2 + 0.07), y1 - 0.02, z0 + 0.2), (-s * (w / 2 + 0.07), y1 - 0.3, z0 + 0.2), 0.065, segs=14)
    vh.part(f"{G}_generator", bm, P, smooth_angle=40, group=G)
    rbox(G, f"{G}_carb", (s * (w / 2 + 0.06), yc, z1 - 0.26), (0.08, 0.09, 0.12), M["iron"], 0.01)
    bm = bmesh.new()
    vh.cyl(bm, (-s * (w / 2 + 0.05), y0 + 0.15, z0 + 0.12), (-s * (w / 2 + 0.05), y0 + 0.15, z0 + 0.32), 0.05, segs=12)
    vh.part(f"{G}_filter", bm, M["black"], smooth_angle=40, group=G)
    bm = bmesh.new()
    for k in range(4):
        y = y0 + 0.1 + (y1 - y0 - 0.2) * k / 3
        vh.sweep(bm, [V((-s * w * 0.3, y, z1 + 0.0)), V((-s * w * 0.42, y - 0.02, z1 + 0.04)), V((-s * w * 0.48, y0 + 0.02, z1 + 0.02))], 0.006, around=5)
    vh.part(f"{G}_leads", bm, M["black"], smooth_angle=60, group=G)


# ======================================================================== Allis-Chalmers WD45


def wd45():
    G = "wd45"
    P = M["orange"]
    WB = 2.27
    FA, RA = WB / 2, -WB / 2  # axle positions (y)
    RR, RW, RRIM, RX = 0.67, 0.33, 0.355, 0.8  # rear tyre 13-28 on a 28 in rim
    FR, FW, FRIM, FX = 0.37, 0.15, 0.2, 0.66  # front 6.00-16
    # --- frame: channel rails from the front bumper back to the torque tube
    for s in (-1, 1):
        rbox(G, f"wd_rail{s}", (s * 0.29, FA - 0.25, 0.73), (0.06, 1.45, 0.16), P, 0.008)
    rbox(G, "wd_bumper", (0, FA + 0.44, 0.73), (0.66, 0.08, 0.16), P, 0.01)
    rbox(G, "wd_bolster", (0, FA, 0.6), (0.5, 0.16, 0.16), P, 0.02)
    # --- radiator shroud: square, the corners rounded, the mesh grille set in its face
    sy0, sy1, sz0, sz1, sw = FA - 0.2, FA + 0.09, 0.81, 1.42, 0.6
    rbox(G, "wd_shroud", (0, (sy0 + sy1) / 2, (sz0 + sz1) / 2), (sw, sy1 - sy0, sz1 - sz0), P, 0.045, segments=3)
    rbox(G, "wd_grille_back", (0, sy1 + 0.004, (sz0 + sz1) / 2 - 0.01), (sw - 0.1, 0.01, sz1 - sz0 - 0.12), M["dark"], 0.0)
    bm = bmesh.new()
    gx, gz0, gz1 = sw / 2 - 0.06, sz0 + 0.06, sz1 - 0.08
    for k in range(17):  # the screen: a fine square mesh
        z = gz0 + (gz1 - gz0) * k / 16
        vh.box(bm, (0, sy1 + 0.013, z), (2 * gx, 0.006, 0.006))
    for k in range(17):
        x = -gx + 2 * gx * k / 16
        vh.box(bm, (x, sy1 + 0.016, (gz0 + gz1) / 2), (0.006, 0.006, gz1 - gz0))
    vh.part("wd_screen", bm, M["mesh"], group=G)
    bm = bmesh.new()  # the frame round the screen
    vh.box(bm, (0, sy1 + 0.02, gz1 + 0.012), (2 * gx + 0.04, 0.02, 0.025))
    vh.box(bm, (0, sy1 + 0.02, gz0 - 0.012), (2 * gx + 0.04, 0.02, 0.025))
    for s in (-1, 1):
        vh.box(bm, (s * (gx + 0.012), sy1 + 0.02, (gz0 + gz1) / 2), (0.025, 0.02, gz1 - gz0 + 0.05))
    vh.part("wd_screen_frame", bm, P, bevel=0.006, segments=1, group=G)
    vh.cyl(bm := bmesh.new(), (0, sy0 + 0.1, sz1), (0, sy0 + 0.1, sz1 + 0.05), 0.035, segs=12)  # radiator cap
    vh.part("wd_radcap", bm, M["iron"], group=G)
    # --- hood: a narrow flat-topped sheet over the open engine
    hy0, hy1 = FA - 1.08, sy0 + 0.01
    rbox(G, "wd_hood", (0, (hy0 + hy1) / 2, 1.3), (0.5, hy1 - hy0, 0.22), P, 0.05, segments=3)
    engine(G, P, FA - 1.0, sy0 - 0.02, 0.62, 1.2, 0.36)
    # --- fuel tank: rounded, a little wider than the hood, its back end rolled under
    bm = bmesh.new()
    ty0, ty1 = FA - 1.5, FA - 1.02
    vh.box(bm, (0, (ty0 + ty1) / 2, 1.27), (0.56, ty1 - ty0, 0.36))
    vh.part("wd_tank", bm, P, bevel=0.1, segments=4, group=G)
    bm = bmesh.new()
    vh.cyl(bm, (0.1, FA - 1.15, 1.44), (0.1, FA - 1.15, 1.5), 0.05, segs=14)
    vh.part("wd_fuelcap", bm, M["iron"], bevel=0.008, segments=1, group=G)
    rbox(G, "wd_battery", (0, FA - 1.55, 1.02), (0.36, 0.3, 0.22), P, 0.015)
    rbox(G, "wd_dash", (0, FA - 1.56, 1.25), (0.42, 0.04, 0.2), M["black"], 0.01)
    for s in (-1, 1):  # headlamps on brackets either side of the tank's front
        bm = bmesh.new()
        c = V((s * 0.36, FA - 1.0, 1.15))
        vh.cyl(bm, c - V((0, 0.07, 0)), c + V((0, 0.03, 0)), 0.075, 0.07, segs=16)
        vh.cyl(bm, (s * 0.24, FA - 1.05, 1.15), (s * 0.31, FA - 1.04, 1.15), 0.015, segs=6)
        vh.part(f"wd_lamp{s}", bm, M["black"], smooth_angle=40, group=G)
        bm = bmesh.new()
        vh.lathe(bm, [(0, 0.0), (0, 0.065), (0.012, 0.05), (0.02, 0.0)], 16, T(c + V((0, 0.03, 0))))
        vh.part(f"wd_lens{s}", bm, M["lens"], smooth_angle=60, group=G)
        bm = bmesh.new()
        vh.torus(bm, c + V((0, 0.035, 0)), 0.07, 0.008, segs=20, around=6, rot=rot_x(math.pi / 2))
        vh.part(f"wd_bezel{s}", bm, M["chrome"], smooth_angle=60, group=G)
    # --- stacks: the chrome-muffled exhaust and the air-cleaner cap
    stack(G, "wd_exhaust", (-0.06, FA - 0.56, 1.36), (-0.06, FA - 0.56, 1.98), 0.032, muffler=(1.44, 1.72, 0.06))
    bm = bmesh.new()
    vh.cyl(bm, (0.08, FA - 0.86, 1.36), (0.08, FA - 0.86, 1.5), 0.04, segs=12)
    vh.lathe(bm, [(0, 0.0), (0, 0.065), (0.02, 0.068), (0.05, 0.05), (0.06, 0.0)], 16, T((0.08, FA - 0.86, 1.5)) @ rot_x(math.pi / 2))
    vh.part("wd_aircleaner", bm, P, smooth_angle=50, group=G)
    # --- transmission and rear axle
    rbox(G, "wd_torque", (0, FA - 1.25, 0.72), (0.3, 0.5, 0.3), P, 0.04)
    rbox(G, "wd_trans", (0, RA + 0.32, 0.72), (0.56, 0.95, 0.5), P, 0.06, segments=3)
    bm = bmesh.new()
    for s in (-1, 1):
        vh.cyl(bm, (s * 0.26, RA, RR), (s * (RX - RW / 2 - 0.02), RA, RR), 0.11, 0.08, segs=16)
    vh.part("wd_axle", bm, P, bevel=0.01, segments=1, group=G)
    bm = bmesh.new()
    for s in (-1, 1):
        vh.cyl(bm, (s * (RX - RW / 2 - 0.04), RA, RR), (s * (RX + 0.02), RA, RR), 0.055, segs=12)
    vh.part("wd_axle_ends", bm, M["iron"], group=G)
    # Snap-Coupler hitch and the drawbar.
    rbox(G, "wd_hitch", (0, RA - 0.36, 0.48), (0.3, 0.3, 0.12), P, 0.02)
    rbox(G, "wd_drawbar", (0, RA - 0.55, 0.42), (0.12, 0.3, 0.04), M["iron"], 0.008)
    # Steps either side of the transmission.
    for s in (-1, 1):
        rbox(G, f"wd_step{s}", (s * 0.42, RA + 0.55, 0.62), (0.26, 0.34, 0.02), M["iron"], 0.004)
    # --- steering: the shaft over the tank up to a high wheel
    wheel_c = V((0, RA + 0.4, 1.86))
    bm = bmesh.new()
    vh.cyl(bm, (0, FA - 1.0, 1.43), wheel_c - V((0, -0.06, 0.06)), 0.022, segs=10)
    vh.part("wd_column", bm, M["iron"], group=G)
    steering_wheel(G, "wd_wheel", wheel_c, (0, -0.55, 1.0))
    # --- seat on its leaf spring, over the axle
    seat = V((0, RA - 0.12, 1.24))
    bm = bmesh.new()
    vh.box(bm, (0, RA + 0.12, 1.06), (0.07, 0.62, 0.025), rot_x(0.42))
    vh.part("wd_spring", bm, M["iron"], bevel=0.005, segments=1, group=G)
    pan_seat(G, "wd_seat", seat, P)
    # --- fenders: small round ones over the top front of the rear wheels
    for s in (-1, 1):
        fender(G, f"wd_fender{s}", s * (RX - RW / 2 - 0.05), s * (RX + RW / 2 + 0.03), RA, RR, RR + 0.1, 40, 125, P, skirt=0.28)
    # --- front axle: a beam across under the bolster, knuckles down to the hubs
    bm = bmesh.new()
    vh.box(bm, (0, FA, 0.5), (2 * FX - 0.16, 0.09, 0.1))
    for s in (-1, 1):
        vh.box(bm, (s * (FX - 0.1), FA, 0.43), (0.08, 0.08, 0.2))
    vh.part("wd_frontaxle", bm, P, bevel=0.012, segments=1, group=G)
    bm = bmesh.new()
    for s in (-1, 1):
        vh.cyl(bm, (s * (FX - 0.12), FA, FR), (s * (FX - FW / 2), FA, FR), 0.04, segs=10)
    vh.part("wd_spindles", bm, M["iron"], group=G)
    # Tie rod behind the axle.
    bm = bmesh.new()
    vh.cyl(bm, (-(FX - 0.12), FA - 0.14, 0.42), (FX - 0.12, FA - 0.14, 0.42), 0.014, segs=6)
    vh.part("wd_tierod", bm, M["iron"], group=G)
    # --- lettering: ALLIS-CHALMERS along the hood, WD 45 on the shroud, the badge in front
    for s in (-1, 1):
        letters(G, f"wd_name{s}", "ALLIS-CHALMERS", 0.085, side_frame(s, (s * 0.252, FA - 0.62, 1.3)), M["black"])
        letters(G, f"wd_model{s}", "WD", 0.07, side_frame(s, (s * (sw / 2 + 0.001), FA - 0.07, 1.27)), M["black"])
        letters(G, f"wd_model45{s}", "45", 0.07, side_frame(s, (s * (sw / 2 + 0.001), FA - 0.07, 1.19)), M["black"])
    # --- wheels
    for s in (-1, 1):
        rear_wheel(G, f"wd_rear{s}", (s * RX, RA, RR), s, RR, RW, RRIM, P, clamps=True)
        front_wheel(G, f"wd_front{s}", (s * FX, FA, FR), s, FR, FW, FRIM, P)


# ======================================================================== Case SC


def case_sc():
    G = "sc"
    P = M["red"]
    WB = 2.12
    FA, RA = WB / 2, -WB / 2
    RR, RW, RRIM, RX = 0.71, 0.26, 0.48, 0.78  # rear 10-38
    FR, FW, FRIM, FX = 0.31, 0.13, 0.19, 0.15  # twin 5.00-15 under the pedestal
    # --- front pedestal: a cast post rising from the twin wheels' axle to the bolster
    bm = bmesh.new()
    vh.cyl(bm, (0, FA, 0.36), (0, FA, 0.78), 0.075, 0.09, segs=16)
    vh.part("sc_pedestal", bm, P, bevel=0.01, segments=1, group=G)
    bm = bmesh.new()  # the fork down to the axle, either side between the wheels
    vh.box(bm, (0, FA, 0.36), (2 * FX - FW - 0.04, 0.12, 0.08))
    vh.part("sc_fork", bm, P, bevel=0.015, segments=2, group=G)
    bm = bmesh.new()
    vh.cyl(bm, (-FX, FA, FR), (FX, FA, FR), 0.03, segs=10)
    vh.part("sc_frontaxle", bm, M["iron"], group=G)
    rbox(G, "sc_bolster", (0, FA - 0.05, 0.8), (0.5, 0.36, 0.14), P, 0.03)
    rbox(G, "sc_steerbox", (0.14, FA - 0.05, 0.92), (0.16, 0.16, 0.12), P, 0.02)
    for s in (-1, 1):
        rbox(G, f"sc_rail{s}", (s * 0.27, FA - 0.6, 0.78), (0.06, 1.1, 0.14), P, 0.008)
    # --- shroud: tall, its top corners rounded; a louvred grille of horizontal bars
    sy0, sy1, sz0, sz1, sw = FA - 0.25, FA + 0.05, 0.86, 1.43, 0.56
    rbox(G, "sc_shroud", (0, (sy0 + sy1) / 2, (sz0 + sz1) / 2), (sw, sy1 - sy0, sz1 - sz0), P, 0.06, segments=3)
    gx, gz0, gz1 = sw / 2 - 0.07, sz0 + 0.06, sz1 - 0.13
    rbox(G, "sc_grille_back", (0, sy1 + 0.003, (gz0 + gz1) / 2), (2 * gx, 0.008, gz1 - gz0), M["dark"], 0.0)
    bm = bmesh.new()
    for k in range(13):
        z = gz0 + 0.02 + (gz1 - gz0 - 0.04) * k / 12
        vh.box(bm, (0, sy1 + 0.012, z), (2 * gx - 0.01, 0.022, 0.018), rot_x(0.35))
    vh.part("sc_louvres", bm, P, bevel=0.005, segments=1, group=G)
    bm = bmesh.new()  # a raised rim round the grille opening
    vh.box(bm, (0, sy1 + 0.018, gz1 + 0.012), (2 * gx + 0.04, 0.02, 0.024))
    vh.box(bm, (0, sy1 + 0.018, gz0 - 0.012), (2 * gx + 0.04, 0.02, 0.024))
    for s in (-1, 1):
        vh.box(bm, (s * (gx + 0.012), sy1 + 0.018, (gz0 + gz1) / 2), (0.024, 0.02, gz1 - gz0 + 0.048))
    vh.part("sc_grille_rim", bm, P, bevel=0.007, segments=1, group=G)
    # The CASE badge across the top of the shroud: a silver plate, black letters.
    rbox(G, "sc_badge", (0, sy1 + 0.006, sz1 - 0.065), (0.3, 0.012, 0.075), M["rim"], 0.004)
    letters(G, "sc_badge_text", "CASE", 0.06, T((0, sy1 + 0.0125, sz1 - 0.065)) @ rot_z(math.pi), M["black"])
    bm = bmesh.new()
    vh.cyl(bm, (0, sy0 + 0.1, sz1), (0, sy0 + 0.1, sz1 + 0.05), 0.035, segs=12)
    vh.part("sc_radcap", bm, M["iron"], group=G)
    # --- hood over the open engine
    hy0, hy1 = FA - 1.05, sy0 + 0.01
    rbox(G, "sc_hood", (0, (hy0 + hy1) / 2, 1.31), (0.46, hy1 - hy0, 0.2), P, 0.05, segments=3)
    engine(G, P, FA - 0.98, sy0 - 0.02, 0.66, 1.21, 0.34, left_manifold=False)
    # --- fuel tank, higher at the back, with the dash under it
    bm = bmesh.new()
    ty0, ty1 = FA - 1.5, FA - 1.0
    vh.box(bm, (0, (ty0 + ty1) / 2, 1.3), (0.54, ty1 - ty0, 0.38))
    vh.part("sc_tank", bm, P, bevel=0.11, segments=4, group=G)
    bm = bmesh.new()
    vh.cyl(bm, (-0.1, FA - 1.12, 1.47), (-0.1, FA - 1.12, 1.53), 0.05, segs=14)
    vh.part("sc_fuelcap", bm, M["iron"], bevel=0.008, segments=1, group=G)
    rbox(G, "sc_dash", (0, FA - 1.53, 1.2), (0.44, 0.05, 0.22), M["black"], 0.01)
    for s in (-1, 1):  # headlamps either side of the tank
        bm = bmesh.new()
        c = V((s * 0.36, FA - 1.06, 1.42))
        vh.ball(bm, c - V((0, 0.03, 0)), (0.08, 0.07, 0.08), segs=16)
        vh.cyl(bm, (s * 0.25, FA - 1.1, 1.38), (s * 0.33, FA - 1.08, 1.4), 0.015, segs=6)
        vh.part(f"sc_lamp{s}", bm, M["chrome"], smooth_angle=40, group=G)
        bm = bmesh.new()
        vh.lathe(bm, [(0, 0.0), (0, 0.072), (0.012, 0.055), (0.02, 0.0)], 16, T(c + V((0, 0.035, 0))))
        vh.part(f"sc_lens{s}", bm, M["lens"], smooth_angle=60, group=G)
    # --- stacks: exhaust with its silver muffler; the air cleaner pipe and cap beside it
    stack(G, "sc_exhaust", (0.07, FA - 0.42, 1.38), (0.07, FA - 0.42, 2.12), 0.033, muffler=(1.6, 1.98, 0.058))
    bm = bmesh.new()
    vh.cyl(bm, (-0.07, FA - 0.6, 1.38), (-0.07, FA - 0.6, 1.72), 0.045, segs=12)
    vh.lathe(bm, [(0, 0.0), (0, 0.075), (0.025, 0.078), (0.06, 0.05), (0.07, 0.0)], 16, T((-0.07, FA - 0.6, 1.72)) @ rot_x(math.pi / 2))
    vh.part("sc_aircleaner", bm, P, smooth_angle=50, group=G)
    # --- transmission, rear axle, belt pulley and the Eagle Hitch
    rbox(G, "sc_torque", (0, FA - 1.25, 0.76), (0.32, 0.5, 0.3), P, 0.04)
    rbox(G, "sc_trans", (0, RA + 0.32, 0.74), (0.6, 0.9, 0.52), P, 0.06, segments=3)
    bm = bmesh.new()
    for s in (-1, 1):
        vh.cyl(bm, (s * 0.28, RA, RR), (s * (RX - RW / 2 - 0.02), RA, RR), 0.12, 0.085, segs=16)
    vh.part("sc_axle", bm, P, bevel=0.01, segments=1, group=G)
    bm = bmesh.new()
    for s in (-1, 1):
        vh.cyl(bm, (s * (RX - RW / 2 - 0.04), RA, RR), (s * (RX + 0.03), RA, RR), 0.055, segs=12)
    vh.part("sc_axle_ends", bm, M["iron"], group=G)
    bm = bmesh.new()
    vh.lathe(bm, [(0, 0.0), (0, 0.13), (0.01, 0.14), (0.13, 0.14), (0.14, 0.13), (0.14, 0.0)], 24, T((0.3, RA + 0.62, 0.84)) @ rot_z(-math.pi / 2))
    vh.part("sc_pulley", bm, P, smooth_angle=40, group=G)
    rbox(G, "sc_pulley_case", (0.28, RA + 0.62, 0.84), (0.1, 0.2, 0.2), P, 0.03)
    for s in (-1, 1):  # Eagle Hitch: the lower links and the lift arms
        bm = bmesh.new()
        vh.box(bm, (s * 0.2, RA - 0.42, 0.5), (0.05, 0.62, 0.05), rot_x(0.2))
        vh.box(bm, (s * 0.16, RA - 0.18, 0.98), (0.05, 0.42, 0.05), rot_x(-0.25))
        vh.part(f"sc_hitch{s}", bm, M["iron"], bevel=0.008, segments=1, group=G)
    rbox(G, "sc_drawbar", (0, RA - 0.5, 0.44), (0.4, 0.08, 0.05), M["iron"], 0.008)
    for s in (-1, 1):
        rbox(G, f"sc_step{s}", (s * 0.42, RA + 0.6, 0.66), (0.28, 0.32, 0.02), M["iron"], 0.004)
    # --- steering: the wheel on a short column, and the side rod down the right to the front
    wheel_c = V((0, RA + 0.38, 1.84))
    bm = bmesh.new()
    vh.cyl(bm, (0, FA - 1.5, 1.38), wheel_c - V((0, -0.06, 0.06)), 0.024, segs=10)
    vh.part("sc_column", bm, M["iron"], group=G)
    steering_wheel(G, "sc_wheel", wheel_c, (0, -0.6, 1.0))
    bm = bmesh.new()
    a, b = V((0.27, FA - 1.55, 1.3)), V((0.2, FA - 0.06, 0.95))
    vh.cyl(bm, a, b, 0.016, segs=8)
    vh.ball(bm, a, (0.03, 0.03, 0.03), segs=8)
    vh.ball(bm, b, (0.03, 0.03, 0.03), segs=8)
    vh.cyl(bm, a, (0.05, FA - 1.55, 1.36), 0.016, segs=8)
    vh.part("sc_siderod", bm, P, smooth_angle=40, group=G)
    # --- seat and its spring
    bm = bmesh.new()
    vh.box(bm, (0, RA + 0.1, 1.03), (0.07, 0.6, 0.025), rot_x(0.42))
    vh.part("sc_spring", bm, M["iron"], bevel=0.005, segments=1, group=G)
    pan_seat(G, "sc_seat", (0, RA - 0.14, 1.22), P)
    # --- big round fenders
    for s in (-1, 1):
        fender(G, f"sc_fender{s}", s * (RX - RW / 2 - 0.07), s * (RX + RW / 2 + 0.06), RA, RR, RR + 0.11, 12, 150, P, skirt=0.3)
    # --- lettering
    for s in (-1, 1):
        letters(G, f"sc_name{s}", "CASE", 0.1, side_frame(s, (s * 0.232, FA - 0.62, 1.31)), M["black"])
    # --- wheels
    for s in (-1, 1):
        rear_wheel(G, f"sc_rear{s}", (s * RX, RA, RR), s, RR, RW, RRIM, P, clamps=False)
        front_wheel(G, f"sc_front{s}", (s * FX, FA, FR), s, FR, FW, FRIM, P, ribs=2)


# ======================================================================== build, bake, export

OFFSET = {"wd45": -2.5, "sc": 2.5}
for build, g in ((wd45, "wd45"), (case_sc, "sc")):
    build()
    for o in vh.PARTS:
        if o["group"] == g and not o.get("moved"):
            o.location.x += OFFSET[g]
            o["moved"] = True
    vh.pivot(g, (OFFSET[g], 0, 0))


def tint(o, co, n):
    """Weathering: dust settled low down and on the tops, the paint a touch faded up top."""
    mats = {m.name for m in o.data.materials}
    if not mats & {"orange", "red"}:
        return (1, 1, 1)
    low = max(0.0, 1 - co.z / 0.5) * 0.12
    top = max(0.0, n.z) * 0.05
    k = low + top
    return (1 - k * 0.6, 1 - k * 0.8, 1 - k)


vh.bake_ao(ground=0.0, samples=96, distance=0.5, floor=0.36, tint=tint, pct=0.85)
nodes = vh.join_groups()
print("RESULT tris", vh.stats(), "nodes", sorted(nodes))
size = vh.export(OUT)
print(f"RESULT {OUT} {size // 1024} KB")

if PREVIEW:
    views = []
    for g, x in OFFSET.items():
        aim = (x, 0, 0.9)
        views += [(f"{g}-{t}", yaw, pitch, d, aim) for t, yaw, pitch, d in (("front", 35, 12, 6.5), ("side", 270, 3, 6.5), ("rside", 90, 3, 6.5), ("rear", 145, 18, 6.5), ("nose", 0, 8, 4.5))]
    vh.preview(PREVIEW, "tractor", views)
