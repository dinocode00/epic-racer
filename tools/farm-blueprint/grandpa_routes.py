"""Grandpa's four routes on the farm (metres, x east, y north), drawn for approval.

Each route is a closed loop of control points, smoothed with Catmull-Rom, with stops:
  ('pause', s, seconds), ('wave', s, seconds, face_xy) along the arc length s.
"""
import json, math
import numpy as np

import os
L = json.load(open(os.path.join(os.path.dirname(__file__), '../../apps/game/src/farm/farmLayout.json')))
U = np.array([math.cos(math.radians(50)), math.sin(math.radians(50))])  # farm north
V = np.array([-U[1], U[0]])  # farm west
WALK, MOW = 0.55, 1.1  # m/s


def catmull(pts, closed=True, n=12):
    pts = [np.asarray(p, float) for p in pts]
    m = len(pts)
    out = []
    rng = range(m) if closed else range(m - 1)
    for i in rng:
        p0 = pts[(i - 1) % m] if (closed or i > 0) else pts[i]
        p1, p2 = pts[i], pts[(i + 1) % m]
        p3 = pts[(i + 2) % m] if (closed or i + 2 < m) else p2
        # centripetal-ish: scale tangents by segment length to avoid overshoot
        d = np.linalg.norm(p2 - p1)
        t1 = (p2 - p0) / max(np.linalg.norm(p2 - p0), 1e-6) * d * 0.5
        t2 = (p3 - p1) / max(np.linalg.norm(p3 - p1), 1e-6) * d * 0.5
        k = max(2, int(math.ceil(d / 0.5)))
        for j in range(k):
            s = j / k
            h1, h2, h3, h4 = 2*s**3 - 3*s**2 + 1, s**3 - 2*s**2 + s, -2*s**3 + 3*s**2, s**3 - s**2
            out.append(h1 * p1 + h2 * t1 + h3 * p2 + h4 * t2)
    if not closed:
        out.append(pts[-1])
    return np.array(out)


def arclen(poly):
    d = np.linalg.norm(np.diff(poly, axis=0), axis=1)
    return np.concatenate([[0], np.cumsum(d)])


def nearest_s(poly, p):
    s = arclen(poly)
    i = int(np.argmin(np.linalg.norm(poly - np.asarray(p), axis=1)))
    return float(s[i]), i


# ------------------------------------------------------------------ 1. corn crib <-> patio
def route_crib_patio():
    crib = np.array(L['corn_crib'])
    pad = np.array(L['house_pad']['c'])
    # Out: leave the crib's west side, drift across the barnyard west of the sandbox,
    # skirt the lilac and the foot of the ramp, then angle up the gravel to the patio.
    out = [crib + [-1.9, 0.2], (59.4, 124.2), (55.4, 127.8), (51.6, 132.0), (48.8, 136.6),
           (47.0, 141.6), (46.9, 146.6), (48.4, 151.2), (46.8, 155.6), (44.0, 158.9),
           (41.4, 162.0), pad + [0.2, -1.2]]
    # Back: a little wider of the ramp and closer to the shed on the way home.
    back = [pad + [1.4, -2.0], (44.9, 160.4), (49.6, 157.2), (50.9, 152.4), (49.2, 147.0),
            (49.0, 142.0), (50.0, 138.0), (53.2, 132.8), (56.8, 128.4), (60.6, 124.9)]
    pts = out + back
    poly = catmull(pts)
    s_stop, i = nearest_s(poly, pad + [0.2, -1.2])
    orchard_c = np.array([22.0, 120.0])
    stops = [('wave', s_stop, 12.0, orchard_c.tolist()),
             ('pause', nearest_s(poly, crib + [-1.9, 0.2])[0], 6.0, None)]
    return poly, stops


# ------------------------------------------------------------------ 2. mower through the Christmas trees
TREES = L['christmas_trees']
XS = sorted(set(t['x'] for t in TREES))
YS = sorted(set(t['y'] for t in TREES))
OCC = {(t['x'], t['y']): t for t in TREES}


def aisle_x(a):  # aisle a lies between column a and a+1
    return XS[0] + 1.2 + 2.4 * a


def col_open(c, y):
    """Slot in column c at row y is empty or a seedling (to become a stump)."""
    t = OCC.get((XS[c], y))
    return t is None or t['heightFt'] < 2


def col_span(c):
    ys = [y for y in YS if (XS[c], y) in OCC]
    return min(ys), max(ys)


def route_mower():
    rng = np.random.default_rng(11)
    pts = []
    corner = np.array([86.6, 92.6])
    pts += [corner, (89.3, 86.0), (90.4, 78.5), (90.6, 72.5)]  # south on the east trail, a third of the way
    # Turn in west through the open top of the last column, into aisle 31 (x 81.4)
    y = 70.9
    a = len(XS) - 3  # aisle between columns 31 and 32
    pts += [(86.6, 70.4), (aisle_x(a + 1) - 0.2, 70.0)]
    # col 32 at 70.9 is a seedling -> cross it
    cross = []
    pts += [(XS[a + 1], 70.0), (aisle_x(a), 68.6)]
    d = -1  # heading south
    y = 68.6
    stumps = [(XS[a + 1], 70.9)]
    legs = 0
    while a > 9:
        c = a  # west column of this aisle
        lo, hi = col_span(c)
        cands = []
        for ys in YS:
            if not (lo <= ys <= hi):
                continue
            if (ys - y) * d < 7:
                continue
            if col_open(c, ys):
                cands.append(ys)
        # also free passage past the column ends
        end = lo - 1.4 if d < 0 else hi + 1.4
        if (end - y) * d >= 7:
            cands.append(end)
        cands = sorted(cands, key=lambda q: abs(q - y))
        # prefer a long-ish leg but not always the longest
        k = min(len(cands) - 1, int(rng.integers(1, 4)))
        ys = cands[k] if len(cands) > 1 else cands[0]
        ys = float(np.clip(ys, 28.0, 89.6))
        # run down the aisle, then slip through the gap into the next aisle
        pts.append((aisle_x(a) + rng.uniform(-0.15, 0.15), ys - d * 2.2))
        pts.append((XS[c], ys))
        if (XS[c], ys) in OCC:
            stumps.append((XS[c], ys))
        nd = d if (rng.uniform() < 0.3 and abs(ys - end) > 2) else -d  # S-bend or hairpin
        # cannot keep going past the block edge
        if ys >= 88.0:
            nd = -1
        if ys <= 31.0:
            nd = 1
        pts.append((aisle_x(a - 1), ys + nd * 2.2))
        y = ys + nd * 2.2
        d = nd
        a -= 1
        legs += 1
    # Final leg: north up the aisle and out the top of the block
    if d < 0:
        # hairpin back north via the next gap
        pass
    pts.append((aisle_x(a), 89.9))
    pts += [(aisle_x(a) + 2.2, 92.4), (40.0, 92.5), (60.0, 92.9), (75.0, 92.7), (83.0, 92.8)]
    poly = catmull(pts)
    return poly, [], stumps


# ------------------------------------------------------------------ 3. pumpkin patch
def route_pumpkins():
    west = [(86.0, 8.0), (78.0, 12.6), (68.0, 16.4), (60.0, 15.0), (52.6, 19.2), (42.4, 20.6),
            (34.0, 17.0), (25.0, 21.6), (16.0, 22.0), (8.6, 17.4), (5.0, 11.4)]
    east = [(6.8, 5.4), (14.0, 4.6), (22.0, 9.4), (30.0, 6.6), (40.0, 4.2), (48.6, 5.2),
            (56.0, 9.0), (64.0, 6.6), (72.0, 4.2), (80.0, 2.8), (86.6, 1.4), (89.0, 4.0)]
    pts = west + east
    poly = catmull(pts)
    s = arclen(poly)
    stops = []
    for p, kind, sec in (((68.0, 16.4), 'pause', 6.0), ((42.4, 20.6), 'wave', 10.0), ((25.0, 21.6), 'pause', 7.0),
                         ((8.6, 17.4), 'pause', 5.0), ((22.0, 9.4), 'wave', 10.0), ((40.0, 4.2), 'pause', 6.0),
                         ((56.0, 9.0), 'pause', 5.0), ((72.0, 4.2), 'wave', 10.0)):
        stops.append((kind, nearest_s(poly, p)[0], sec, None))
    return poly, stops


# ------------------------------------------------------------------ 4. orchard
def route_orchard():
    """Up and down the aisles between the tree lines, crossing a line only through the gap
    between two trees, and straight back across the low end of the lines to close the loop."""
    def F(u, v):  # farm grid (u along the lines, v across) -> map
        return (U * u + V * v).tolist()
    rng = np.random.default_rng(5)
    A = [46.0, 50.4, 54.8, 59.2, 63.6, 68.0, 72.4]  # aisles between the 8 lines
    LN = [43.8, 48.2, 52.6, 57.0, 61.4, 65.8, 70.2, 74.6]  # the lines; trees every 4.2 m from u 90.6
    legs = [  # (aisle, u from, u to, crossing gap u at the end, pause at tree u)
        (0, 92.7, 113.7, 113.7, 103.2),
        (1, 113.7, 117.9, 117.9, None),
        (2, 117.9, 96.9, 96.9, 107.4),
        (3, 96.9, 122.1, 122.1, 115.8),
        (4, 122.1, 101.1, 101.1, 111.6),
        (5, 101.1, 117.9, 117.9, 113.7),
        (6, 117.9, 92.7, None, 103.2),
    ]
    pts, stops_at = [], []
    for k, (ai, u0, u1, gap, pause) in enumerate(legs):
        v = A[ai]
        d = 1 if u1 > u0 else -1
        start = u0 + d * (1.6 if k else 0.0)
        end = u1 - d * 1.6
        pts.append(F(start, v + rng.uniform(-.25, .25)))
        n = max(0, int(abs(end - start) // 6))
        for j in range(1, n + 1):
            pts.append(F(start + (end - start) * j / (n + 1), v + rng.uniform(-.35, .35)))
        pts.append(F(end, v + rng.uniform(-.2, .2)))
        if pause is not None:
            # stand in the aisle beside the tree, looking up at the fruit
            stops_at.append((F(pause, v), 6.0 + 3.0 * rng.uniform()))
        if gap is not None:
            pts.append(F(gap, (v + A[ai + 1]) / 2))  # through the gap between two trees
    # back across the low end of the lines (u 92.7 is a gap in the long lines and past the end
    # of the short ones), with a stop halfway to look the trees over
    for v in (70.2, 65.8, 61.4, 57.0, 52.6, 48.2):
        pts.append(F(92.7 + rng.uniform(-.3, .3), v))
    stops_at.append((F(92.7, 59.2), 8.0))
    poly = catmull(pts)
    stops = [('pause', nearest_s(poly, p)[0], round(sec, 1), None) for p, sec in stops_at]
    return poly, stops


if __name__ == '__main__':
    r1 = route_crib_patio(); r2 = route_mower(); r3 = route_pumpkins(); r4 = route_orchard()
    for name, r, spd in (('crib-patio', r1, WALK), ('mower', r2, MOW), ('pumpkins', r3, WALK), ('orchard', r4, WALK)):
        poly = r[0]
        s = arclen(poly)
        stop_t = sum(x[2] for x in r[1])
        print(name, f'{s[-1]:.0f} m', f'{(s[-1] / spd + stop_t) / 60:.1f} min', len(r[1]), 'stops')
    print('stumps', len(r2[2]))
