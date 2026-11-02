"""Draft of the farm racetrack (owner's route, first line for the blueprint), in real metres.

x east, y north (map metres, origin at the SW property corner); `h` is the road's height
above the ground under it. The game builds everything at 1:10, so a 1.6 m road here is the
16 m road of the other tracks, and 25 m up here is 250 m up in the game.

Each waypoint: (x, y, h, width, kind, section). Kinds:
  road  - walled road, normal width
  wide  - the road opens out into a wide area (walls far apart)
  tube  - closed tube (high up, and the loops)
  air   - no road: they're flying (off a launch lip, onto a landing ramp)
  barn  - inside the dark barn
Features are placed at the nearest waypoint index: (index, kind, label).
"""
import json
import math
import os
import sys

import numpy as np

import terrain

HERE = os.path.dirname(os.path.abspath(__file__))
L = json.load(open(os.path.join(HERE, '../../apps/game/src/farm/farmLayout.json')))
G = terrain.Ground()
U = np.array([math.cos(math.radians(50)), math.sin(math.radians(50))])  # farm north (barn's length)
V = np.array([-U[1], U[0]])  # farm west
ROAD, WIDE, FOREST = 1.6, 6.0, 5.0


def F(u, v):
    """Farm-grid point (u along the orchard lines, v across them) to map metres."""
    return tuple(U * u + V * v)


SECTIONS = [
    ('start', 'Start and the front of the house'),
    ('clothes', 'Under the clothes lines'),
    ('spruces', 'Loops through the big spruces'),
    ('sky', 'Sky tube over the farmhouse'),
    ('drop', 'The big drop'),
    ('ramp', 'Weave and up the barn ramp'),
    ('barn', 'Through the dark barn'),
    ('grapes', 'Barnyard zigzags and the grape alley'),
    ('wagons', 'Round the greenhouse and the wagons'),
    ('forest', 'Christmas tree forest'),
    ('pumpkins', 'Pumpkin patch jumps'),
    ('west', 'The west straight'),
    ('orchard', 'Orchard rollers'),
    ('pine', 'Scotch pine corkscrew'),
    ('home', 'Down to the start'),
]


def route():
    P = []  # (x, y, h, width, kind, section)
    F_ = []  # features: (index, kind, label)

    def add(sec, kind, w, *pts):
        for p in pts:
            x, y = p[0], p[1]
            h = p[2] if len(p) > 2 else 0.0
            P.append((x, y, h, w, kind, sec))

    def feat(kind, label):
        F_.append((len(P) - 1, kind, label))

    # 1. Start on the driveway by the road, east along the gravel and past the front of the house.
    add('start', 'road', ROAD, (16.0, 174.6))
    feat('start', 'Start / finish')
    add('start', 'road', ROAD, (21.5, 173.4), (27.5, 171.0))
    feat('super', 'Super boost pad (blue)')
    add('start', 'road', ROAD, (32.6, 166.2), (37.5, 161.6), (44.0, 161.0))
    # 2. Curve north and under the clothes lines (they cross from (51, 174) to (58, 168)).
    add('clothes', 'road', ROAD, (49.6, 164.0), (53.2, 168.6), (55.6, 172.2))
    feat('clothes', 'Under the clothes lines')
    add('clothes', 'road', ROAD, (57.6, 177.6))
    feat('jump', 'Kicker')
    add('clothes', 'road', ROAD, (55.4, 183.6), (49.6, 188.2))
    # 3. Through the big spruces north of the house: three loops, each one higher.
    add('spruces', 'road', ROAD, (45.0, 189.4))
    feat('pad', 'Boost pad into the loops')
    add('spruces', 'tube', ROAD, (41.0, 189.6, 0.4))
    feat('loop', 'Loop 1')
    add('spruces', 'tube', ROAD, (37.6, 188.6, 2.5), (34.4, 187.0, 4.5))
    feat('loop', 'Loop 2')
    add('spruces', 'tube', ROAD, (30.8, 184.8, 7.0), (27.2, 182.8, 9.5))
    feat('loop', 'Loop 3')
    # 4. Up and round in a climbing tube, then out over the farmhouse very high.
    # A steady climbing turn: an arc round (23, 186.2).
    for k, a in enumerate(np.linspace(math.radians(-95), math.radians(-300), 10)):
        add('sky', 'tube', ROAD, (23.0 + 5.0 * math.cos(a), 186.2 + 5.0 * math.sin(a), 12.5 + 7.0 * k / 9))
    feat('pad', 'Accelerator in the tube')
    add('sky', 'tube', ROAD, (31.0, 184.6, 22.0), (36.0, 179.4, 24.5))
    add('sky', 'tube', ROAD, (40.0, 175.6, 26.0))
    feat('peak', 'Peak: about 26 m up, right over the house')
    # 5. The drop, laid out from the game's physics (gravity 21 m/s^2 and 40 m/s at the lip in
    # the game is 2.1 and 4.0 here): over the top the road dips into a lip pointing 30 degrees
    # down, then there's no road while they fall; a steep landing hill follows the fall and
    # curves out level at the bottom. Faster karts land further down the hill.
    d = np.array([0.51, -0.86])
    d /= np.linalg.norm(d)
    add('sky', 'tube', ROAD, (41.2, 174.4, 25.85))
    lip = np.array([42.6, 172.3])
    add('sky', 'road', ROAD, (lip[0] - d[0] * 0.8, lip[1] - d[1] * 0.8, 25.35), (*lip, 24.95))
    feat('launch', 'Launch lip')
    g, v0, pitch = 2.1, 4.0, math.radians(30)
    vh, vz = v0 * math.cos(pitch), -v0 * math.sin(pitch)
    h0, h_gap = 24.95, 16.0
    # Time to fall from the lip to where the landing hill starts (vz is negative: falling).
    t_end = (vz + math.sqrt(vz * vz + 2 * g * (h0 - h_gap))) / g
    for t in np.linspace(0, t_end, 9)[1:-1]:
        q = lip + d * vh * t
        add('drop', 'air', ROAD, (*q, h0 + vz * t - 0.5 * g * t * t))
    q = lip + d * vh * t_end
    slope = math.atan2(-(vz - g * t_end), vh)  # how steeply they're falling at the gap's end
    add('drop', 'road', ROAD, (*q, h_gap))
    feat('land', 'Landing hill')
    R = 7.0
    h_curve = R * (1 - math.cos(slope))
    run = (h_gap - h_curve) / math.tan(slope)
    for k in (1, 2, 3):
        qq = q + d * run * k / 3
        add('drop', 'road', ROAD, (*qq, h_gap - (h_gap - h_curve) * k / 3))
    q = q + d * run
    for k in range(1, 7):
        a_ = slope * (1 - k / 6)
        add('drop', 'road', ROAD, (*(q + d * R * (math.sin(slope) - math.sin(a_))), R * (1 - math.cos(a_))))
    end = q + d * R * math.sin(slope)
    # 6. A weave to the north, then up the north side of the ramp to the barn's north door.
    add('ramp', 'road', ROAD, (*(end + d * 1.6), 0.0))
    feat('pad', 'Boost pad')
    add('ramp', 'road', ROAD, (56.4, 153.2), (58.6, 155.6), (61.4, 157.2))
    feat('weave', 'Weave north')
    # Round the outside of the north lilac (62.1, 151.7), between it and the old well
    # (67.5, 148.8), then south up the ramp's north side and left into the north door. Ramp:
    # bottom edge (52.5, 143)-(59.5, 151.3), top at the barn wall (60.9, 137.1)-(66.8, 144.1).
    add('ramp', 'road', ROAD, (64.0, 155.6, 0.1), (65.2, 152.8, 0.2), (65.0, 150.2, 0.4))
    feat('lilac', 'Between the lilac and the well')
    add('ramp', 'road', ROAD, (63.4, 146.6, 1.5), (63.3, 143.6, 2.2))
    add('ramp', 'barn', ROAD, (65.2, 141.6, 2.44))
    feat('door', 'North door, open a crack')
    # 7. Inside: dark, light through the cracks in the boards; turn south and drop to the lower
    # floor, out the big door in the south end.
    add('barn', 'barn', ROAD, (67.0, 139.8, 2.44), (66.6, 136.4, 2.44), (64.6, 133.4, 1.4), (62.6, 130.6, 0.4))
    feat('dark', 'Dark barn: down to the lower floor')
    add('barn', 'road', ROAD, (60.6, 127.6))
    feat('door', 'Out the south door')
    # 8. Zigzags across the barnyard, then down the alley between two grape rows.
    # Two easy S-bends (no tighter than the road can take at speed), a kicker on the straight.
    add('grapes', 'road', ROAD, (57.6, 124.6), (54.8, 123.4))
    feat('jump', 'Kicker')
    add('grapes', 'road', ROAD, (52.2, 121.6), (51.6, 118.8), (49.6, 116.4))
    feat('zigzag', 'S-bends')
    add('grapes', 'road', ROAD, (46.2, 114.4))
    add('grapes', 'road', ROAD, (42.6, 112.8), (41.5, 111.2))
    feat('pad', 'Boost pad')
    add('grapes', 'road', ROAD, (38.4, 104.6), (35.6, 98.2), (34.4, 95.0))
    feat('grapes', 'Down the grape alley')
    # 9. East between the red garage and the trees, round the greenhouse and north of the wagons.
    add('wagons', 'road', ROAD, (36.8, 92.6), (44.0, 92.3))
    feat('pad', 'Boost pad')
    add('wagons', 'road', ROAD, (51.0, 92.6), (57.0, 96.4), (61.0, 102.6))
    feat('jump', 'Kicker')
    add('wagons', 'road', ROAD, (63.2, 108.0), (65.6, 115.0))
    feat('greenhouse', 'Round the greenhouse')
    add('wagons', 'road', ROAD, (70.0, 115.2), (75.0, 109.6), (79.4, 106.2))
    feat('wagons', 'North of the hay wagons')
    add('wagons', 'road', ROAD, (84.0, 102.6))
    feat('pad', 'Boost pad')
    add('wagons', 'road', ROAD, (86.4, 97.0))
    # 10. The Christmas tree forest: wide, the trunks standing in the road. West in long easy
    # curves across the whole block, a wide U-turn at the west end, back east, then out at the
    # south-east corner. Every bend is at least twice as wide as the road; hills all the way.
    def wave(x0, x1, y0, y1, amp, n):
        """Points from (x0, y0) to (x1, y1) swaying `amp` metres either side, n half-waves."""
        out = []
        for k in range(1, 4 * n):
            t = k / (4 * n)
            x = x0 + (x1 - x0) * t
            y = y0 + (y1 - y0) * t + amp * math.sin(math.pi * n * t)
            out.append((x, y))
        return out

    add('forest', 'wide', FOREST, (84.0, 89.0, 0.0))
    feat('trunks', 'Trunks are solid')
    west = wave(80.0, 20.0, 85.0, 78.0, 2.4, 4)
    for k, (x, y) in enumerate(west):
        if k == 5:
            # The middle crest is a big ramp: a boost pad, up, a long flight, down beyond.
            add('forest', 'wide', FOREST, (x, y, 0.0))
            feat('pad', 'Boost pad')
            continue
        if k == 6:
            add('forest', 'wide', FOREST, (x, y, 1.4))
            feat('bigjump', 'Big ramp over the trees')
            continue
        if k in (7, 8):
            add('forest', 'air', FOREST, (x, y, 1.4))
            if k == 7:
                feat('treejump', 'Over the Christmas trees')
            continue
        if k == 9:
            add('forest', 'wide', FOREST, (x, y, 0.6))
            continue
        h = (1.4 if k % 4 == 2 and k != 10 else 0.0) if k < len(west) - 2 else 0.0
        add('forest', 'wide', FOREST, (x, y, h))
        if h > 1:
            feat('jump', 'Hill crest: air')
    # The U-turn at the west end: a half circle 6.5 m across... wide enough for the wide road,
    # and clear of the west straight beside the trees.
    cx, cy, R = 16.0, 71.0, 7.2
    for a in np.linspace(math.radians(95), math.radians(265), 8):
        add('forest', 'wide', FOREST, (cx + R * math.cos(a), cy + R * math.sin(a), 0.0))
    # Out of the U-turn, a straight run-up: a boost pad, the big ramp, a flight over two rows of
    # Christmas trees, and down onto the hill beyond.
    add('forest', 'wide', FOREST, (19.0, 63.6), (23.0, 62.8), (26.6, 62.2))
    feat('pad', 'Boost pad')
    add('forest', 'wide', FOREST, (30.6, 61.6, 0.6), (34.0, 61.2, 1.4))
    feat('bigjump', 'Big ramp over the trees')
    add('forest', 'wide', FOREST, (36.4, 60.9, 1.4))
    add('forest', 'air', FOREST, (39.0, 60.5, 1.4), (42.0, 60.1, 1.4), (45.0, 59.7, 1.4))
    feat('treejump', 'Over the Christmas trees')
    add('forest', 'wide', FOREST, (47.6, 59.3, 0.6), (51.0, 58.8, 0.0))
    for k, (x, y) in enumerate(wave(51.0, 76.0, 58.8, 51.0, 1.4, 2)):
        h = 1.4 if k == 3 else 0.0
        add('forest', 'wide', FOREST, (x, y, h))
        if h > 1:
            feat('jump', 'Hill crest: air')
    add('forest', 'wide', FOREST, (79.4, 48.6, 0.0), (82.4, 42.0, 0.0), (84.4, 34.0, 0.0))
    add('forest', 'road', ROAD, (86.0, 26.0))
    feat('pad', 'Boost pad')
    # 11. Pumpkin patch, east to west: a wide field of kickers and boost ramps, and a big boost
    # ramp that throws them over the pumpkin wagon.
    add('pumpkins', 'wide', WIDE, (86.8, 18.6), (86.0, 14.0), (83.6, 11.0), (78.0, 9.6))
    feat('jump', 'Kicker')
    add('pumpkins', 'wide', WIDE, (72.0, 11.0))
    feat('boost', 'Boost ramp')
    # (No kicker just here: they need to be on the ground for the boost pad and the big ramp.)
    add('pumpkins', 'wide', WIDE, (66.0, 10.6))
    add('pumpkins', 'wide', WIDE, (60.0, 12.0))
    feat('pad', 'Boost pad')
    add('pumpkins', 'wide', WIDE, (55.6, 13.2, 0.0))
    feat('bigjump', 'Big boost ramp')
    add('pumpkins', 'wide', WIDE, (52.6, 13.3))
    # (The line over the gap stays flat: the karts fly their own arc over the wagon.)
    add('pumpkins', 'air', WIDE, (50.4, 13.4), (47.0, 13.5), (43.6, 13.4))
    feat('wagon', 'Over the pumpkin wagon')
    add('pumpkins', 'wide', WIDE, (41.4, 13.3), (38.2, 13.0), (32.0, 11.8))
    feat('jump', 'Kicker')
    add('pumpkins', 'wide', WIDE, (25.0, 12.8))
    feat('boost', 'Boost ramp')
    add('pumpkins', 'wide', WIDE, (18.0, 11.6))
    feat('jump', 'Kicker')
    add('pumpkins', 'wide', WIDE, (11.0, 12.4))
    add('pumpkins', 'road', ROAD, (6.4, 15.4), (3.6, 20.4))
    # 12. Flat out up the west mowed path, the trees on the right.
    add('west', 'road', ROAD, (2.8, 26.0), (2.6, 40.0))
    feat('pad', 'Boost pad')
    add('west', 'road', ROAD, (2.6, 56.0))
    feat('super', 'Super boost pad (blue)')
    add('west', 'road', ROAD, (2.7, 72.0))
    feat('pad', 'Boost pad')
    add('west', 'road', ROAD, (3.0, 88.0))
    feat('super', 'Super boost pad (blue)')
    add('west', 'road', ROAD, (3.4, 99.0), (6.6, 104.6))
    # 13. The orchard: up and down the aisles between the tree lines (u along, v across), over
    # rollers for hang time, crossing a line only between two trees; out the north-west side.
    A = [46.0, 50.4, 54.8, 59.2, 63.6, 68.0, 72.4]
    add('orchard', 'road', ROAD, F(88.6, A[3]))
    feat('pad', 'Boost pad')
    HI = 0.5  # low enough that they fly under the apple crowns
    hump = lambda u, v, h: (*F(u, v), HI if h else 0.0)  # noqa: E731
    def crest(u, v):
        add('orchard', 'road', ROAD, hump(u, v, 1))
        feat('jump', 'Crest: hang time under the apples')

    def uturn(uc, va, vb, out):
        """Half circle from aisle va to aisle vb round the end of the line between them."""
        vm, R = (va + vb) / 2, abs(vb - va) / 2
        for th in np.linspace(-math.pi / 2, math.pi / 2, 9)[1:-1]:
            add('orchard', 'road', ROAD, F(uc + out * R * math.cos(th), vm + R * math.sin(th)))

    crest(95.0, A[3])
    add('orchard', 'road', ROAD, hump(101.0, A[3], 0))
    crest(107.0, A[3])
    add('orchard', 'road', ROAD, hump(113.0, A[3], 0))
    add('orchard', 'road', ROAD, F(116.4, A[3]), F(119.4, A[3]))
    uturn(119.4, A[3], A[4], 1)
    add('orchard', 'road', ROAD, F(119.4, A[4]), F(116.4, A[4]))
    crest(111.0, A[4])
    add('orchard', 'road', ROAD, hump(103.0, A[4], 0))
    add('orchard', 'road', ROAD, F(98.4, A[4]), F(95.4, A[4]))
    uturn(95.4, A[4], A[5], -1)
    add('orchard', 'road', ROAD, F(95.4, A[5]), F(98.4, A[5]))
    crest(103.0, A[5])
    add('orchard', 'road', ROAD, hump(111.0, A[5], 0))
    add('orchard', 'road', ROAD, F(116.4, A[5]), F(119.4, A[5]))
    uturn(119.4, A[5], A[6], 1)
    add('orchard', 'road', ROAD, F(119.4, A[6]), F(116.4, A[6]))
    crest(112.0, A[6])
    add('orchard', 'road', ROAD, F(107.4, A[6]), F(105.3, 74.6))
    feat('exit', 'Out between the pear and cherry trees')
    # 14. To the stove, then a corkscrew climbing round the giant Scotch pine and a big loop
    # at the top, the whole farm below.
    add('pine', 'road', ROAD, (4.0, 134.2), (-1.4, 140.4))
    feat('pad', 'Boost pad')
    add('pine', 'road', ROAD, (-4.2, 145.6))
    feat('stove', 'Past the barrel stove')
    pine = np.array(L['big_scotch_pine'])
    R = 9.0
    # Clockwise round the pine, entering on its north-west side, almost a full turn and a bit,
    # climbing all the way; out on its west side heading north.
    angles = np.linspace(math.radians(135), math.radians(-180), 13)
    for k, a in enumerate(angles):
        h = 0.5 + k * 1.5
        add('pine', 'tube', ROAD, (pine[0] + R * math.cos(a), pine[1] + R * math.sin(a), h))
        if k == 0:
            feat('helix', 'Corkscrew round the Scotch pine')
    feat('loop', 'Sky loop: the whole farm below')
    # 15. A dive back down to the driveway.
    add('home', 'tube', ROAD, (5.6, 159.6, 13.0))
    add('home', 'road', ROAD, (6.6, 165.8, 6.0), (8.4, 171.0, 1.2))
    feat('pad', 'Boost pad onto the straight')
    add('home', 'road', ROAD, (12.6, 174.6, 0.0))
    return P, F_


def smooth(P, per=10):
    """Catmull-Rom through the waypoints (closed), carrying h, width, kind and section."""
    pts = np.array([[p[0], p[1], p[2], p[3]] for p in P], float)
    n = len(pts)
    out, meta, src = [], [], []
    for i in range(n):
        p0, p1, p2, p3 = pts[(i - 1) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        d = np.linalg.norm(p2[:2] - p1[:2])
        k = max(2, int(d * 1.5))
        for j in range(k):
            t = j / k
            q = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                       + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
            # heights and widths: plain blend (no overshoot)
            q[2:] = p1[2:] + (p2[2:] - p1[2:]) * (t * t * (3 - 2 * t))
            out.append(q)
            kind = P[i][4] if P[i][4] == P[(i + 1) % n][4] or t < 0.5 else P[(i + 1) % n][4]
            meta.append((kind, P[i][5] if t < 0.5 else P[(i + 1) % n][5]))
            src.append(i)
    return np.array(out), meta, src


def build():
    P, feats = route()
    pts, meta, src = smooth(P)
    xy = pts[:, :2]
    seg = np.linalg.norm(np.diff(np.vstack([xy, xy[:1]]), axis=0), axis=1)
    # length along the road, counting the climb
    dh = np.diff(np.concatenate([pts[:, 2], pts[:1, 2]]))
    s = np.concatenate([[0], np.cumsum(np.hypot(seg, dh))])[:-1]
    ground = np.array([G.h(x, y) for x, y in xy])
    first = {}
    for k, i in enumerate(src):
        first.setdefault(i, k)
    feats_out = [{'kind': k, 'label': lab, 's': round(float(s[first[i]]), 1),
                  'x': round(float(xy[first[i]][0]), 2), 'y': round(float(xy[first[i]][1]), 2),
                  'h': round(float(pts[first[i]][2]), 2)} for i, k, lab in feats]
    # Christmas tree trunks standing in the forest road (solid in the race).
    stumps = {tuple(p) for p in json.load(open(os.path.join(HERE, '../../apps/game/src/farm/grandpaRoutes.json')))['stumps']}
    forest = np.array([[xy[k][0], xy[k][1], pts[k][3]] for k in range(len(xy)) if meta[k][1] == 'forest' and meta[k][0] == 'wide'])
    trunks, cleared = [], []
    for t in L['christmas_trees']:
        if (t['x'], t['y']) in stumps or t['heightFt'] < 2:
            continue
        d = np.hypot(forest[:, 0] - t['x'], forest[:, 1] - t['y'])
        i = int(np.argmin(d))
        if d[i] < forest[i, 2] / 2 - 0.25:
            # The run-up to the big ramp and the landing past it are kept clear (those trees
            # are cut for the race); the two rows under the flight just stand there.
            if 57.0 < t['y'] < 66.0 and 18.0 < t['x'] < 56.0:
                if not (37.6 < t['x'] < 46.4):
                    cleared.append([t['x'], t['y']])
                continue
            # The same for the big ramp on the way west.
            if 78.0 < t['y'] < 85.0 and 40.0 < t['x'] < 60.0:
                if not (45.5 < t['x'] < 52.5):
                    cleared.append([t['x'], t['y']])
                continue
            trunks.append([t['x'], t['y']])
    sec_s = {}
    for k, (_, sec) in enumerate(meta):
        sec_s.setdefault(sec, float(s[k]))
    return {
        'units': 'metres (real), x east, y north; h above the ground under the road',
        'scale': 'the game builds it at 1:10',
        'length': round(float(s[-1] + seg[-1]), 1),
        'sections': [{'id': a, 'name': b, 's': round(sec_s.get(a, 0), 1)} for a, b in SECTIONS],
        'pts': [[round(float(x), 2), round(float(y), 2), round(float(h), 2), round(float(w), 2), m[0], m[1],
                 round(float(gh), 2), round(float(ss), 1)]
                for (x, y, h, w), m, gh, ss in zip(pts, meta, ground, s)],
        'features': feats_out,
        'trunks': trunks,
        'cleared': cleared,
    }


if __name__ == '__main__':
    T = build()
    print('length', T['length'], 'm real =', round(T['length'] * 10), 'm in game')
    for sec in T['sections']:
        print(f"  {sec['s']:7.1f}  {sec['name']}")
    kinds = {}
    for p in T['pts']:
        kinds[p[4]] = kinds.get(p[4], 0) + 1
    print(kinds, 'max h', max(p[2] for p in T['pts']), 'trunks', len(T['trunks']))
    if len(sys.argv) > 1:
        json.dump(T, open(sys.argv[1], 'w'), separators=(',', ':'))
