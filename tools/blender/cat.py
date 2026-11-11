"""The farm's barn cats, built, rigged and animated in Blender.

    python tools/blender/cat.py -- apps/game/src/render/models/cat.glb [--preview DIR]

One cat (about 45 cm nose to rump, 25 cm at the shoulder) used for both of the farm's cats:
the game colours it from a mask painted here (vertex colour: red = white/cream patches on the
chest, muzzle, paws and tail tip; green = tabby stripes), so an orange tabby and a black and
white tom share one model. Clips: "Walk" (one stride), "Sit" (sitting up, looking about, the
tail curled round and flicking), "Groom" (sitting, licking a forepaw and wiping it over the face).

Coordinates: x = the cat's right, y = forward, z = up, metres.
"""

import math
import os
import sys

import bpy  # isort: skip (must come first: it provides bmesh and mathutils)
import bmesh
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
from kit import TAU, V, bump, rx, ry, rz, smooth, wrap  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[0] if argv else "cat.glb"
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
MAT = {n: kit.material(n, c) for n, c in {"fur": (0.8, 0.5, 0.25), "eye": (0.75, 0.7, 0.2), "pupil": (0.02, 0.02, 0.02), "nose": (0.85, 0.55, 0.55)}.items()}

# ======================================================================== skeleton

REST = {}


def bone(name, head, tail, parent=None):
    REST[name] = (V(head), V(tail), parent)


def chain(names, pts, parent):
    for n, a, b in zip(names, pts, pts[1:]):
        bone(n, a, b, parent)
        parent = n


bone("body", (0, -0.02, 0.2), (0, 0.04, 0.2))
bone("hips", (0, -0.02, 0.2), (0, -0.17, 0.2), "body")
bone("chest", (0, -0.02, 0.2), (0, 0.12, 0.215), "body")
bone("neck", (0, 0.12, 0.22), (0, 0.18, 0.265), "chest")
bone("head", (0, 0.18, 0.265), (0, 0.27, 0.262), "neck")
TAIL_PTS = [(0, -0.185, 0.215), (0, -0.23, 0.205), (0, -0.275, 0.19), (0, -0.32, 0.18), (0, -0.365, 0.175), (0, -0.41, 0.178), (0, -0.45, 0.185)]
chain([f"tail{i}" for i in range(1, 7)], TAIL_PTS, "hips")
FRONT = [(0.115, 0.205), (0.10, 0.115), (0.112, 0.03), (0.132, 0.004)]  # (y, z): shoulder, elbow, wrist, toe
HIND = [(-0.15, 0.19), (-0.105, 0.12), (-0.175, 0.06), (-0.145, 0.004)]  # hip, knee, hock, toe
SIDES = (("L", -1), ("R", 1))
for side, s in SIDES:
    chain([f"f_upper.{side}", f"f_lower.{side}", f"f_paw.{side}"], [(s * 0.045, y, z) for y, z in FRONT], "chest")
    chain([f"h_thigh.{side}", f"h_shin.{side}", f"h_foot.{side}"], [(s * 0.05, y, z) for y, z in HIND], "hips")
    bone(f"ear.{side}", (s * 0.035, 0.205, 0.305), (s * 0.045, 0.2, 0.355), "head")
ORDER = list(REST)
LEN = {n: (t - h).length for n, (h, t, _) in REST.items()}
ANG = {n: math.atan2(t.z - h.z, t.y - h.y) for n, (h, t, _) in REST.items()}

# ======================================================================== skin

bm = bmesh.new()
kit.loft(
    bm,
    [
        dict(y=-0.205, w=0.03, top=0.225, bottom=0.185),
        dict(y=-0.185, w=0.06, top=0.25, bottom=0.15),
        dict(y=-0.14, w=0.07, top=0.262, bottom=0.135),
        dict(y=-0.06, w=0.064, top=0.258, bottom=0.14),
        dict(y=0.03, w=0.062, top=0.257, bottom=0.143),
        dict(y=0.1, w=0.064, top=0.262, bottom=0.14),
        dict(y=0.145, w=0.055, top=0.262, bottom=0.16),
        dict(y=0.17, w=0.045, top=0.27, bottom=0.195),
    ],
    around=24,
    ex=0.85,
)
kit.ellipsoid(bm, (0, 0.215, 0.272), (0.06, 0.06, 0.053))  # cranium
kit.ellipsoid(bm, (0, 0.258, 0.255), (0.033, 0.032, 0.026))  # muzzle
for s in (-1, 1):
    kit.ellipsoid(bm, (s * 0.032, 0.242, 0.252), (0.027, 0.026, 0.024))  # whisker pads / cheeks
    kit.ellipsoid(bm, (s * 0.05, -0.14, 0.2), (0.032, 0.06, 0.055))  # haunch
    kit.ellipsoid(bm, (s * 0.045, 0.11, 0.2), (0.026, 0.04, 0.045))  # shoulder
    kit.cone(bm, (s * 0.034, 0.205, 0.306), (s * 0.045, 0.2, 0.362), 0.026, 0.003, segs=8, squash=0.45)  # ear
    kit.tube(
        bm,
        [(s * 0.045, y, z) for y, z in FRONT[:3]] + [(s * 0.045, 0.13, 0.008)],
        [dict(t=0, w=0.024, h=0.03), dict(t=0.4, w=0.018, h=0.02), dict(t=0.75, w=0.013, h=0.014), dict(t=0.9, w=0.016, h=0.014), dict(t=1, w=0.017, h=0.01)],
        segs=24,
        around=10,
        up=(0, 1, 0),
    )
    kit.tube(
        bm,
        [(s * 0.05, -0.15, 0.2)] + [(s * 0.05, y, z) for y, z in HIND[1:3]] + [(s * 0.05, -0.142, 0.008)],
        [dict(t=0, w=0.032, h=0.045), dict(t=0.3, w=0.024, h=0.03), dict(t=0.55, w=0.013, h=0.016), dict(t=0.65, w=0.013, h=0.015), dict(t=0.9, w=0.016, h=0.014), dict(t=1, w=0.017, h=0.01)],
        segs=24,
        around=10,
        up=(0, 1, 0),
    )
kit.tube(
    bm,
    TAIL_PTS,
    [dict(t=0, w=0.02, h=0.02), dict(t=0.5, w=0.016, h=0.016), dict(t=0.92, w=0.013, h=0.013), dict(t=1, w=0.006, h=0.006)],
    segs=30,
    around=10,
    up=(0, 0, 1),
)
cat = kit.to_object("Cat", bm, MAT["fur"])
kit.fuse(cat, voxel=0.0042, smooth=4, target_tris=7000)

# Colour mask: red = the white/cream patches, green = tabby stripes.
mesh = cat.data
col = mesh.color_attributes.new("Col", "BYTE_COLOR", "POINT")
for v in mesh.vertices:
    p = v.co
    head = p.y > 0.17
    chest = p.y > 0.04 and p.z < 0.205 and abs(p.x) < 0.05 and p.y < 0.17
    belly = p.z < 0.16 and -0.12 < p.y < 0.12 and abs(p.x) < 0.045
    muzzle = head and p.y > 0.232 and p.z < 0.27
    paws = p.z < 0.035
    tip = p.y < -0.42
    patch = 1.0 if (chest or belly or muzzle or paws or tip) else 0.0
    # Tabby: stripes running round the body and legs, rings on the tail, an M on the brow.
    stripe = 0.0
    if not patch:
        if p.y < 0.17 and p.z > 0.04:
            stripe = smooth((math.sin(p.y * 95 + p.z * 22) - 0.35) / 0.4)
        if p.y < -0.19:
            stripe = smooth((math.sin(p.y * 120) - 0.2) / 0.4)
        if head and p.z > 0.285:
            stripe = smooth((math.sin(p.x * 140) - 0.3) / 0.4)
        if p.z <= 0.04 or (p.z < 0.15 and abs(p.x) > 0.03 and -0.16 < p.y < 0.16 and False):
            stripe = 0.0
    col.data[v.index].color = (patch, stripe, 0.0, 1.0)

# ---- eyes and nose (rigid on the head)
PARTS = []


def rigid_part(name, bm, mat, bone_name):
    obj = kit.to_object(name, bm, MAT[mat])
    kit.weight_rigid(obj, bone_name)
    PARTS.append(obj)


bm = bmesh.new()
for s in (-1, 1):
    kit.ellipsoid(bm, (s * 0.03, 0.258, 0.284), (0.012, 0.008, 0.013), segs=12)
rigid_part("Eyes", bm, "eye", "head")
bm = bmesh.new()
for s in (-1, 1):
    kit.ellipsoid(bm, (s * 0.03, 0.2645, 0.284), (0.0038, 0.0025, 0.0095), segs=8)
rigid_part("Pupils", bm, "pupil", "head")
bm = bmesh.new()
kit.ellipsoid(bm, (0, 0.289, 0.262), (0.008, 0.004, 0.006), segs=8)
rigid_part("Nose", bm, "nose", "head")

# ======================================================================== rig and binding

arm = bpy.data.armatures.new("CatRig")
rig = bpy.data.objects.new("CatRig", arm)
scene.collection.objects.link(rig)
kit.only(rig)
bpy.ops.object.mode_set(mode="EDIT")
for n in ORDER:
    h, t, p = REST[n]
    eb = arm.edit_bones.new(n)
    eb.head, eb.tail = h, t
    if p:
        eb.parent = arm.edit_bones[p]
bpy.ops.object.mode_set(mode="OBJECT")
skin = {n for n in ORDER if n != "body"}
if not kit.bind_auto(cat, rig, skin):
    print("WARNING automatic weights failed; using nearest-bone weights")
    for g in list(cat.vertex_groups):
        cat.vertex_groups.remove(g)
    kit.weight_near(cat, sorted(skin), {n: (REST[n][0], REST[n][1]) for n in skin}, 4.0, keep=3)
    kit.bind_manual(cat, rig)
for o in PARTS:
    kit.bind_manual(o, rig)

# ======================================================================== posing


class Pose:
    """Each bone's rotation away from rest, in the skeleton's own axes."""

    def __init__(self):
        self.D, self.shift = {}, V((0, 0, 0))

    def get(self, n):
        while n is not None:
            if n in self.D:
                return self.D[n]
            n = REST[n][2]
        return Quaternion()

    def set(self, n, q):
        self.D[n] = q

    def rel(self, n, q):
        self.D[n] = self.get(REST[n][2]) @ q

    def head(self, n):
        h, _, p = REST[n]
        if p is None:
            return h + self.shift
        return self.head(p) + self.get(p) @ (h - REST[p][0])


def leg(P, names, toe, paw_angle, knee_forward):
    """Two-bone IK in the side plane from a toe target (y, z), the paw/foot at `paw_angle`."""
    upper, mid, low = names
    R = P.head(upper)
    pd = V((0, math.cos(paw_angle), math.sin(paw_angle)))
    F = V((R.x, toe[0], toe[1])) - pd * LEN[low]
    a, b = LEN[upper], LEN[mid]
    to = F - R
    d = max(abs(a - b) + 1e-3, min(a + b - 1e-4, to.length))
    base = math.atan2(to.z, to.y)
    al = math.acos(max(-1, min(1, (a * a + d * d - b * b) / (2 * a * d))))
    best = None
    for sg in (-1, 1):
        ang = base + sg * al
        K = R + V((0, math.cos(ang), math.sin(ang))) * a
        off = (K - R).y * to.z - (K - R).z * to.y
        if best is None or (off > best[0]) == knee_forward:
            best = (off, ang, K)
    _, ang, K = best
    P.set(upper, rx(wrap(ang - ANG[upper])))
    Fd = R + to.normalized() * d
    P.set(mid, rx(wrap(math.atan2(Fd.z - K.z, Fd.y - K.y) - ANG[mid])))
    P.set(low, rx(wrap(paw_angle - ANG[low])))


FN = lambda s: [f"f_upper.{s}", f"f_lower.{s}", f"f_paw.{s}"]  # noqa: E731
HN = lambda s: [f"h_thigh.{s}", f"h_shin.{s}", f"h_foot.{s}"]  # noqa: E731
F_TOE, H_TOE = FRONT[3], HIND[3]


def tail_curve(P, pitch, yaw, curl_pitch=0.0, curl_yaw=0.0, t=0.0, wave=0.0):
    for i in range(6):
        f = i / 5
        P.rel(f"tail{i + 1}", rz((yaw if i == 0 else 0) + curl_yaw * f + wave * math.sin(t - i * 0.8)) @ rx((pitch if i == 0 else 0) + curl_pitch * f))


# Walk: a cat's lateral-sequence walk (left hind, left fore, right hind, right fore), one
# stride, back level and head steady, tail up with a curve.
STRIDE = 0.26
WALK = [("h", "L", 0.0), ("f", "L", 0.25), ("h", "R", 0.5), ("f", "R", 0.75)]
STANCE = 0.62


def walk(p):
    P = Pose()
    c = lambda at: math.cos(TAU * (p - at))  # noqa: E731
    P.shift = V((0, 0, -0.004 + 0.004 * math.cos(TAU * 2 * p)))
    P.set("body", rz(0.03 * math.sin(TAU * p)))
    P.rel("hips", rz(-0.05 * math.sin(TAU * p)))
    P.rel("chest", rz(0.05 * math.sin(TAU * p + 0.5)))
    P.rel("neck", rx(-0.1))
    P.rel("head", rx(0.1 + 0.02 * c(0.2)) @ rz(-0.05 * math.sin(TAU * p + 0.5)))
    for kind, side, at in WALK:
        q = (p - at) % 1
        front = kind == "f"
        rest = F_TOE if front else H_TOE
        names = FN(side) if front else HN(side)
        pa0 = ANG[names[2]]
        if q < STANCE:
            u = q / STANCE
            y, z = STRIDE * (0.5 - u), 0.0
            pa = pa0 + (0.0 if u < 0.7 else -0.5 * smooth((u - 0.7) / 0.3)) * (1 if front else 0.6)
        else:
            u = (q - STANCE) / (1 - STANCE)
            y = STRIDE * (-0.5 + smooth(u))
            z = (0.045 if front else 0.035) * math.sin(math.pi * u)
            pa = pa0 - (0.9 if front else 0.4) * bump(u, -0.1, 0.8)
        leg(P, names, (rest[0] + y, rest[1] + z), pa, not front)
    tail_curve(P, 0.95, 0.0, curl_pitch=-0.75, t=TAU * p, wave=0.08)
    for side, s in SIDES:
        P.rel(f"ear.{side}", ry(0.0))
    return P


def sitting(P, breath):
    """Hips down, body tipped up, forelegs straight, hind legs folded under."""
    # The chest tips up steeply over straight forelegs; the pelvis much less, so the spine
    # curves and the rump sits on the ground with the hind legs folded beside it.
    P.shift = V((0, 0, -0.057))
    P.set("body", rx(0.5))
    P.rel("hips", rx(0.4))
    P.rel("chest", rx(-0.02 + 0.01 * breath))
    P.rel("neck", rx(-0.35))
    for side, s in SIDES:
        leg(P, FN(side), (0.105, 0.0), ANG[f"f_paw.{side}"] - 0.1, False)
        leg(P, HN(side), (0.0, 0.0), 0.0, True)  # hock down on the ground, foot forward
    return P


def sit(u):
    """Four seconds sitting up: breathing, looking round the yard, ears turning, tail flicking."""
    P = Pose()
    breath = math.sin(TAU * 3 * u)
    sitting(P, breath)
    look = math.sin(TAU * u) * 0.6 + math.sin(TAU * 2 * u + 1) * 0.12
    P.rel("head", rz(look) @ rx(-0.15 + 0.05 * math.sin(TAU * u + 2)))
    flick = bump(u, 0.55, 0.75)
    tail_curve(P, -0.35, 1.25, curl_pitch=-0.2, curl_yaw=1.5, t=TAU * 2 * u, wave=0.05 + 0.25 * flick)
    for side, s in SIDES:
        P.rel(f"ear.{side}", rz(-s * 0.4 * bump(u, 0.2 if s > 0 else 0.8, 0.35 if s > 0 else 0.95)))
    return P


def groom(u):
    """Four seconds sitting: licks the right forepaw, then wipes it over the side of the face."""
    P = Pose()
    sitting(P, math.sin(TAU * 3 * u))
    lift = smooth(u / 0.12) * (1 - smooth((u - 0.88) / 0.12))
    lick = bump(u, 0.12, 0.55)
    wipe = bump(u, 0.5, 0.88)
    # Right foreleg up to the mouth: upper arm forward and up, elbow bent, paw curled.
    P.rel("f_upper.R", rx(-1.75 * lift))
    P.rel("f_lower.R", rx(1.7 * lift))
    P.rel("f_paw.R", rx(1.0 * lift + 0.15 * math.sin(TAU * 6 * u) * lick))
    P.rel("head", rx(0.35 * lick - 0.1 * wipe + 0.08 * math.sin(TAU * 8 * u) * lick) @ rz(-0.3 * lick - 0.55 * wipe))
    P.rel("f_upper.R", rx(-0.25 * wipe * math.sin(TAU * 3 * u)))
    tail_curve(P, -0.35, 1.25, curl_pitch=-0.2, curl_yaw=1.5, t=TAU * u, wave=0.04)
    for side, s in SIDES:
        P.rel(f"ear.{side}", rz(-s * 0.25 * wipe))
    return P


REST_Q = {b.name: b.matrix_local.to_quaternion() for b in arm.bones}
LAST = {}
for pb in rig.pose.bones:
    pb.rotation_mode = "QUATERNION"


def apply(P):
    for n in ORDER:
        p = REST[n][2]
        Rb = REST_Q[n]
        q = Rb.inverted() @ (P.get(p).inverted() if p else Quaternion()) @ P.get(n) @ Rb
        if n in LAST and LAST[n].dot(q) < 0:
            q.negate()
        LAST[n] = q.copy()
        rig.pose.bones[n].rotation_quaternion = q
    rig.pose.bones["body"].location = REST_Q["body"].inverted() @ P.shift


for label, fn in (("walk", walk), ("sit", sit), ("groom", groom)):
    for k in range(4):
        P = fn(k / 4)
        apply(P)
        bpy.context.view_layer.update()
        worst = max((rig.pose.bones[n].head - P.head(n)).length for n in ORDER)
        assert worst < 1e-4, f"{label}: pose maths disagrees with Blender by {worst:.5f} m"

# ======================================================================== preview

if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    cd = bpy.data.cameras.new("Cam")
    cd.type = "ORTHO"
    cam = bpy.data.objects.new("Cam", cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 5
    sun.rotation_euler = (math.radians(50), 0, math.radians(-50))
    scene.collection.objects.link(sun)
    w = bpy.data.worlds.new("W")
    scene.world = w
    w.color = (0.6, 0.65, 0.7)
    bpy.ops.mesh.primitive_plane_add(size=4)
    m = bpy.data.materials.new("vc")
    m.use_nodes = True
    attr = m.node_tree.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    bsdf = m.node_tree.nodes["Principled BSDF"]
    mix = m.node_tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    sep = m.node_tree.nodes.new("ShaderNodeSeparateColor")
    m.node_tree.links.new(attr.outputs["Color"], sep.inputs[0])
    mix.inputs[6].default_value = (0.85, 0.45, 0.15, 1)
    mix.inputs[7].default_value = (0.95, 0.9, 0.82, 1)
    m.node_tree.links.new(sep.outputs[0], mix.inputs[0])
    m.node_tree.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    cat.data.materials[0] = m
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 12
    scene.render.resolution_x, scene.render.resolution_y = 420, 320

    def shot(name, P, view="side"):
        apply(P)
        if view == "side":
            cam.location, cam.rotation_euler, cd.ortho_scale = (-2, 0.0, 0.2), (math.radians(90), 0, math.radians(-90)), 0.75
        else:
            cam.location, cam.rotation_euler, cd.ortho_scale = (-1.2, 1.2, 0.8), (math.radians(68), 0, math.radians(-135)), 0.75
        scene.render.filepath = os.path.join(PREVIEW, name + ".png")
        bpy.ops.render.render(write_still=True)

    shot("rest", Pose(), "front")
    for k in range(4):
        shot(f"walk-{k}", walk(k / 4))
    shot("sit", sit(0.1))
    shot("sit-front", sit(0.3), "front")
    shot("groom", groom(0.3), "front")
    shot("groom-wipe", groom(0.7), "front")
    cat.data.materials[0] = MAT["fur"]

# ======================================================================== export

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
    tr = rig.animation_data.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, 0, act)
    rig.animation_data.action = None


bake("Walk", walk, FPS)
bake("Sit", sit, 4 * FPS)
bake("Groom", groom, 4 * FPS)
apply(Pose())
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_yup=True,
    export_skins=True,
    export_animations=True,
    export_animation_mode="NLA_TRACKS",
    export_force_sampling=True,
    export_def_bones=False,
    export_cameras=False,
    export_lights=False,
    export_vertex_color="ACTIVE",
    export_all_vertex_colors=False,
)
print(f"RESULT tris={sum(len(p.vertices) - 2 for p in cat.data.polygons)} bones={len(ORDER)} size={os.path.getsize(OUT) // 1024}KB")
