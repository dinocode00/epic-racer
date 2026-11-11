"""Grandpa's skin weights, worked out by Blender.

    node tools/blender/export.cjs EXPORT.json        # his rest-pose meshes, from the game
    python tools/blender/grandpa.py -- EXPORT.json apps/game/src/farm/grandpa/skin.json

The game builds grandpa from code (apps/game/src/farm/grandpa*), and its rig poses him: the
walk, the cap-wave, steering the mower. That stays. What Blender adds is the skin: each piece
of his clothes is bound to his skeleton with Blender's automatic (bone heat) weights, so
sleeves, shirt, jeans and boots bend smoothly across the shoulders, elbows, hips and knees
instead of each part turning rigidly with one joint.

Coordinates are the game's (y up); the weights don't care which way is up.
"""

import base64
import json
import math
import os
import sys
from collections import deque

import bpy  # isort: skip (must come first: it provides bmesh and mathutils)
import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
SRC, OUT = argv[0], argv[1]
data = json.load(open(SRC))["grandpa"]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------------------------------------------------------------- skeleton

JOINTS = {j["name"]: j for j in data["joints"]}
NAMES = [j["name"] for j in data["joints"]]


def at(name):
    m = JOINTS[name]["world"]  # column-major 4x4
    return Vector((m[12], m[13], m[14]))


def down(name, metres):
    """A point `metres` below the joint along its own -y (the way the limb hangs)."""
    m = JOINTS[name]["world"]
    return at(name) - Vector((m[4], m[5], m[6])).normalized() * metres


def ahead(name, metres):
    """Toward the toes: his front, which is -z in his own (unrotated) frame."""
    m = JOINTS[name]["world"]
    return at(name) - Vector((m[8], m[9], m[10])).normalized() * metres


TAIL = {
    "hips": down("hips", 0.11),
    "spine": at("chest"),
    "chest": at("neck"),
    "neck": down("neck", -0.12),
}
for s in ("R", "L"):
    TAIL[f"shoulder.{s}"] = at(f"elbow.{s}")
    TAIL[f"elbow.{s}"] = at(f"wrist.{s}")
    TAIL[f"wrist.{s}"] = down(f"wrist.{s}", 0.17)
    TAIL[f"hip.{s}"] = at(f"knee.{s}")
    TAIL[f"knee.{s}"] = at(f"ankle.{s}")
    TAIL[f"ankle.{s}"] = ahead(f"ankle.{s}", 0.22) + (down(f"ankle.{s}", 0.06) - at(f"ankle.{s}"))

arm = bpy.data.armatures.new("GrandpaRig")
rig = bpy.data.objects.new("GrandpaRig", arm)
scene.collection.objects.link(rig)
kit.only(rig)
bpy.ops.object.mode_set(mode="EDIT")
for n in NAMES:
    eb = arm.edit_bones.new(n)
    eb.head, eb.tail = at(n), TAIL[n]
for n in NAMES:
    p = JOINTS[n]["parent"]
    if p:
        arm.edit_bones[n].parent = arm.edit_bones[p]
bpy.ops.object.mode_set(mode="OBJECT")

# Which bones may move each piece: its own joint and those within two steps of it on the
# skeleton (a sleeve can blend into the chest and the forearm, never into a leg).
ADJ = {n: set() for n in NAMES}
for n in NAMES:
    p = JOINTS[n]["parent"]
    if p:
        ADJ[n].add(p)
        ADJ[p].add(n)


def near_bones(n, steps=2):
    seen, q = {n: 0}, deque([n])
    while q:
        a = q.popleft()
        if seen[a] < steps:
            for b in ADJ[a]:
                if b not in seen:
                    seen[b] = seen[a] + 1
                    q.append(b)
    return set(seen)


# ---------------------------------------------------------------- weights per piece


def segment_weights(pos, bones, owner):
    """Fallback for pieces bone heat can't do: blend between the nearest bone segments."""
    out = []
    for p in pos:
        ws = []
        for b in bones:
            a, t = at(b), TAIL[b]
            d = kit._seg_dist(p, a, t)
            ws.append((1.0 / max(1e-4, d) ** 4, b))
        ws.sort(reverse=True)
        ws = ws[:3]
        tot = sum(w for w, _ in ws)
        out.append({b: w / tot for w, b in ws})
    return out


ARM = {f"{j}.{s}" for j in ("shoulder", "elbow", "wrist") for s in ("R", "L")}
TORSO = {"hips", "spine", "chest", "neck"}


def allowed(owner):
    """Bones a piece may follow. The shirt's body never follows the arms: a raised arm would
    drag the side of the shirt up with it like gum. Only the sleeves stretch from the armhole."""
    bones = near_bones(owner)
    if owner in TORSO:
        bones -= ARM
    return bones


def weigh(piece):
    raw = piece["pos"]
    pos = [Vector(raw[i : i + 3]) for i in range(0, len(raw), 3)]
    owner = piece["joint"]
    bones = allowed(owner)
    # Pieces are often split at UV seams; weigh the welded surface so both sides of a seam
    # get the same weights and never crack apart.
    key = lambda v: (round(v.x, 4), round(v.y, 4), round(v.z, 4))  # noqa: E731
    uniq, slot = {}, []
    for v in pos:
        slot.append(uniq.setdefault(key(v), len(uniq)))
    verts = [None] * len(uniq)
    for v, i in zip(pos, slot):
        verts[i] = v
    tri = piece["tri"]
    faces, seen = [], set()
    for k in range(0, len(tri), 3):
        f = tuple(slot[tri[k + j]] for j in range(3))
        if len(set(f)) == 3 and tuple(sorted(f)) not in seen:
            seen.add(tuple(sorted(f)))
            faces.append(f)
    mesh = bpy.data.meshes.new("piece")
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new("piece", mesh)
    scene.collection.objects.link(obj)
    ok = False
    if len(verts) >= 8 and faces:
        ok = kit.bind_auto(obj, rig, bones)
    if ok:
        groups = {g.index: g.name for g in obj.vertex_groups}
        welded = [{groups[g.group]: g.weight for g in v.groups if g.weight > 1e-4} for v in mesh.vertices]
        if any(not w for w in welded):
            ok = False
    if not ok:
        welded = segment_weights(verts, bones, owner)
    bpy.data.objects.remove(obj)
    bpy.data.meshes.remove(mesh)
    return [welded[i] for i in slot], ok


def pack(weights):
    """Four bones and four weights per vertex, as bytes (weights in 255ths, summing to 255)."""
    idx, wts = bytearray(), bytearray()
    for w in weights:
        top = sorted(w.items(), key=lambda kv: -kv[1])[:4]
        tot = sum(v for _, v in top) or 1.0
        q = [round(v / tot * 255) for _, v in top]
        q[0] += 255 - sum(q)
        for (b, _), v in zip(top + [(NAMES[0], 0)] * (4 - len(top)), q + [0] * (4 - len(q))):
            idx.append(NAMES.index(b))
            wts.append(v)
    return base64.b64encode(bytes(idx)).decode(), base64.b64encode(bytes(wts)).decode()


skins = {}
stats = {"heat": 0, "fallback": 0, "rigid": 0}
for piece in data["meshes"]:
    weights, ok = weigh(piece)
    owner = piece["joint"]
    # A piece that stays entirely on its own joint is left as it is (rigid) in the game.
    if all(max(w.values()) > 0.995 and max(w, key=w.get) == owner for w in weights):
        stats["rigid"] += 1
        continue
    stats["heat" if ok else "fallback"] += 1
    i, w = pack(weights)
    skins.setdefault(str(piece["i"]), {})["lo" if piece["lo"] else "hi"] = {
        "n": len(weights),
        "bones": i,
        "weights": w,
    }

os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
json.dump({"bones": NAMES, "meshes": skins}, open(OUT, "w"), separators=(",", ":"))
print(f"RESULT pieces={len(data['meshes'])} {stats} -> {OUT} ({os.path.getsize(OUT) // 1024} KB)")
