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


def fillet_loop(corners, radii, step=0.1):
    """A closed path through straight runs between `corners`, each corner rounded with an arc
    of its radius (tangent to both runs), sampled every `step` metres."""
    P = [np.asarray(c, float) for c in corners]
    n = len(P)
    arcs = []
    for i in range(n):
        p0, p1, p2 = P[i - 1], P[i], P[(i + 1) % n]
        a = (p0 - p1) / np.linalg.norm(p0 - p1)
        b = (p2 - p1) / np.linalg.norm(p2 - p1)
        th = math.acos(np.clip(a @ b, -1, 1))  # interior angle
        r = radii[i]
        tl = r / math.tan(th / 2) if th < math.pi - 1e-6 else 0.0
        assert tl <= np.linalg.norm(p0 - p1) / 2 + 1e-6 and tl <= np.linalg.norm(p2 - p1) / 2 + 1e-6, (i, p1, tl)
        t0, t1 = p1 + a * tl, p1 + b * tl
        bis = (a + b) / max(np.linalg.norm(a + b), 1e-9)
        c = p1 + bis * (r / math.sin(th / 2)) if tl > 0 else p1
        arcs.append((t0, t1, c, r, tl > 0))
    out = []
    for i in range(n):
        t0, t1, c, r, ok = arcs[i]
        if ok:
            a0 = math.atan2(*(t0 - c)[::-1]); a1 = math.atan2(*(t1 - c)[::-1])
            da = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
            k = max(2, int(abs(da) * r / step))
            for j in range(k):
                ang = a0 + da * j / k
                out.append(c + r * np.array([math.cos(ang), math.sin(ang)]))
        nxt = arcs[(i + 1) % n][0]
        d = np.linalg.norm(nxt - t1)
        k = max(1, int(d / step))
        for j in range(k):
            out.append(t1 + (nxt - t1) * j / k)
    return np.array(out)


def smooth_loop(poly, sigma=0.3, step=0.1):
    """Resample a closed loop every `step` m and blur it along its length (sigma metres), so
    the curvature ramps up and down and the steering wheel can follow it."""
    S = arclen(np.vstack([poly, poly[:1]]))
    L = S[-1]
    P = np.vstack([poly, poly[:1]])
    ss = np.arange(0, L, step)
    x = np.interp(ss, S, P[:, 0]); y = np.interp(ss, S, P[:, 1])
    k = int(3 * sigma / step)
    w = np.exp(-0.5 * (np.arange(-k, k + 1) * step / sigma) ** 2); w /= w.sum()
    xs = sum(w[j] * np.roll(x, k - j) for j in range(2 * k + 1))
    ys = sum(w[j] * np.roll(y, k - j) for j in range(2 * k + 1))
    return np.c_[xs, ys]


def route_mower():
    """Down the east path from the NE corner, then up and down the aisles between the tree
    columns, slipping from one aisle to the next round the end of a column, or through a gap
    where a tree has been cut (a stump): straight on with a diagonal jink, or in a tight U-turn.
    Out the top of the block and back east along its north edge."""
    rng = np.random.default_rng(11)
    corners, radii, stumps = [], [], []

    def C(p, r):
        corners.append(p); radii.append(r)

    C((87.6, 93.4), 2.5)   # the NE corner: start here, turning south onto the east path
    C((90.9, 70.0), 2.5)   # a third of the way down: turn in west
    C((83.8, 70.0), 2.0)   # and south into the first aisle (the last column stops short here)
    a = len(XS) - 2        # aisle between columns 32 and 33
    y, d = 68.0, -1
    A_END = 10
    while a > A_END or d < 0:
        c = a  # the column on this aisle's west side
        lo, hi = col_span(c)
        last = a <= A_END + 1
        opts = []
        for ys in YS:
            if lo + 2 <= ys <= hi - 2 and (ys - y) * d >= 7 and col_open(c, ys):
                opts.append(('gap', ys))
        # U-turns go round the end of the column, out past its last tree, so the tractor's nose
        # swings clear of the next columns; mid-block it only jinks diagonally through a gap.
        end = lo - 2.4 if d < 0 else hi + 2.4
        if (end - y) * d >= 4:
            opts.append(('end', end))
        if last and d < 0:
            opts = [o for o in opts if o[0] == 'end']
        if last and d > 0:
            opts = [o for o in opts if o[0] == 'gap'] or opts
        opts = [o for o in opts if o[0] == 'end' or 29.5 < o[1] + d * 3.6 < 89.6]
        opts.sort(key=lambda o: abs(o[1] - y))
        k = min(len(opts) - 1, int(rng.integers(1, 4)))
        kind, ys = opts[k]
        nd = -d if kind == 'end' else d
        xa, xb = aisle_x(a), aisle_x(a - 1)
        if kind == 'end':
            C((xa, end), 1.2); C((xb, end), 1.2)
            y = end
        else:
            stumps.append((XS[c], ys))
            C((xa, ys - d * 1.2), 2.0); C((xb, ys + d * 1.2), 2.0)
            y = ys + d * 1.2
        d = nd
        a -= 1
    assert d > 0, 'the last aisle has to head north'
    xe = aisle_x(a)
    C((xe, 93.4), 2.0)     # out the top and east along the block's north edge
    stumps = [s for s in dict.fromkeys(stumps) if s in OCC]
    raw = fillet_loop(corners, radii)
    poly = smooth_loop(raw)
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


def export(path):
    names = {'crib': 'crib_to_patio', 'mower': 'mower_christmas_trees', 'pumpkins': 'pumpkin_patch', 'orchard': 'orchard'}
    face = {'crib': [22.0, 120.0], 'pumpkins': [52.0, 96.0]}  # who he waves at: the orchard; up at the barnyard
    out = {'units': 'metres (real), x east, y north, origin at the SW property corner',
           'notes': 'Closed loops. pts every ~0.1-0.5 m; stops [kind, s metres along, seconds, face xy or null]; speed m/s.',
           'routes': [], 'stumps': []}
    for key, fn, spd in (('crib', route_crib_patio, WALK), ('mower', route_mower, MOW),
                         ('pumpkins', route_pumpkins, WALK), ('orchard', route_orchard, WALK)):
        res = fn()
        poly, stops = res[0], res[1]
        if key == 'mower':
            poly = poly[::2]  # every 0.2 m
            out['stumps'] = [[float(x), float(y)] for x, y in res[2]]
        st = []
        for k, s_, sec, f in stops:
            f = f if f is not None else (face.get(key) if k == 'wave' else None)
            st.append([k, round(float(s_), 2), float(sec), f])
        out['routes'].append({'name': names[key], 'mode': 'mow' if key == 'mower' else 'walk', 'speed': spd,
                              'stops': st, 'pts': [[round(float(x), 2), round(float(y), 2)] for x, y in poly]})
    json.dump(out, open(path, 'w'), separators=(',', ':'))


if __name__ == '__main__':
    r1 = route_crib_patio(); r2 = route_mower(); r3 = route_pumpkins(); r4 = route_orchard()
    for name, r, spd in (('crib-patio', r1, WALK), ('mower', r2, MOW), ('pumpkins', r3, WALK), ('orchard', r4, WALK)):
        poly = r[0]
        s = arclen(poly)
        stop_t = sum(x[2] for x in r[1])
        print(name, f'{s[-1]:.0f} m', f'{(s[-1] / spd + stop_t) / 60:.1f} min', len(r[1]), 'stops')
    print('stumps', len(r2[2]))
    import sys
    if len(sys.argv) > 1:
        export(sys.argv[1])
