"""Ground shape and Christmas tree layout for blueprint v2 (metres, x east, y north).

Ground, as described:
- South slope: from an east-west line through the northernmost point of the Christmas tree
  block, the land falls gradually south to the pumpkin patch, the lowest ground.
- West slope: everything west of a line from the orchard's west side to the farmhouse
  falls away to the west.
Heights are relative to the barnyard (0). The drop sizes are placeholders until confirmed.
"""
import math
import numpy as np
import blueprint as b

SOUTH_DROP_M = 4.0  # barnyard to pumpkin patch (placeholder, ~13 ft)
WEST_DROP_M = 3.0  # line to the west corner by the road (placeholder, ~10 ft)
FT = 0.3048


def _P(pts):
    return np.array(b.sk(pts))


def _smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


class Ground:
    def __init__(self):
        F = b.F
        self.ct = _P(F['christmas_trees']['poly'])
        self.pp = _P(F['pumpkin_patch']['poly'])
        self.y_top = self.ct[:, 1].max()  # northernmost point of the Christmas tree block
        self.y_low = self.pp[:, 1].mean()  # middle of the pumpkin patch
        orch = _P(F['orchard']['poly'])
        self.A = orch[np.argmin(orch[:, 0])]  # orchard's west side
        self.H = _P([F['farmhouse']['centre']])[0]
        e = (self.H - self.A) / np.linalg.norm(self.H - self.A)
        n = np.array([-e[1], e[0]])
        self.n = n if n[0] < 0 else -n  # unit normal pointing to the west side
        bd = np.array(b.blueprint()['boundary'])
        self.L_w = max(((bd - self.A) @ self.n).max(), 1.0)

    def h(self, x, y):
        x, y = np.asarray(x, float), np.asarray(y, float)
        south = -SOUTH_DROP_M * _smooth((self.y_top - y) / (self.y_top - self.y_low))
        d = (x - self.A[0]) * self.n[0] + (y - self.A[1]) * self.n[1]
        fade = np.clip((y - self.y_top) / max(self.A[1] - self.y_top, 1.0), 0, 1)
        west = -WEST_DROP_M * _smooth(d / self.L_w) * fade
        return south + west


def contours(g, x0, x1, y0, y1, step=2 * FT, res=1.0):
    """Marching squares. Returns {level: [(p, q), ...]} segments in metres."""
    xs = np.arange(x0, x1 + res, res)
    ys = np.arange(y0, y1 + res, res)
    X, Y = np.meshgrid(xs, ys)
    Z = g.h(X, Y)
    out = {}
    lo = Z.min()
    level = -step
    while level > lo:
        segs = []
        for j in range(len(ys) - 1):
            for i in range(len(xs) - 1):
                c = [(xs[i], ys[j], Z[j, i]), (xs[i + 1], ys[j], Z[j, i + 1]),
                     (xs[i + 1], ys[j + 1], Z[j + 1, i + 1]), (xs[i], ys[j + 1], Z[j + 1, i])]
                pts = []
                for k in range(4):
                    a, bb = c[k], c[(k + 1) % 4]
                    if (a[2] - level) * (bb[2] - level) < 0:
                        t = (level - a[2]) / (bb[2] - a[2])
                        pts.append((a[0] + t * (bb[0] - a[0]), a[1] + t * (bb[1] - a[1])))
                if len(pts) == 2:
                    segs.append(tuple(pts))
                elif len(pts) == 4:
                    segs += [(pts[0], pts[1]), (pts[2], pts[3])]
        out[round(level, 3)] = segs
        level -= step
    return out


SPECIES = [  # west to east
    ('scotch', 'Scotch pine'),
    ('douglas', 'Douglas fir'),
    ('white', 'White pine'),
    ('blue', 'Blue spruce'),
]
SIZES = [  # (share, label, plan radius in m, height in ft)
    (0.15, 'knee high', 0.35, 1.5),
    (0.50, 'about 6 ft', 0.7, 6.0),
    (0.35, '8 to 10 ft', 1.0, 9.0),
]
COL_SPACING = 2.4  # metres between the north-south lines (~8 ft)
TREE_SPACING = 2.0  # metres between trees along a line (~6.5 ft)


def _inside(pt, poly):
    x, y = pt
    ins = False
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            ins = not ins
    return ins


def christmas_trees(seed=11):
    """Neat north-south lines; species in four bands west to east; mixed sizes."""
    rng = np.random.default_rng(seed)
    ct = _P(b.F['christmas_trees']['poly'])
    xs = np.arange(ct[:, 0].min() + 1.6, ct[:, 0].max() - 1.0, COL_SPACING)
    cols = []
    for x in xs:
        col = [(x, y) for y in np.arange(ct[:, 1].min() + 1.6, ct[:, 1].max(), TREE_SPACING)
               if _inside((x, y), ct) and _edge_ok((x, y), ct)]
        if col:
            cols.append(col)
    trees = []
    nb = len(cols)
    shares = np.cumsum([s for s, *_ in SIZES])
    for ci, col in enumerate(cols):
        sp = SPECIES[min(ci * 4 // nb, 3)][0]
        for p in col:
            k = int(np.searchsorted(shares, rng.uniform()))
            trees.append(dict(x=round(p[0], 2), y=round(p[1], 2), species=sp, size=k, line=ci))
    return trees, len(cols)


def _edge_ok(p, poly, margin=0.9):
    p = np.asarray(p)
    for i in range(len(poly)):
        a, c = poly[i], poly[(i + 1) % len(poly)]
        ab = c - a
        t = np.clip((p - a) @ ab / (ab @ ab), 0, 1)
        if np.linalg.norm(p - (a + t * ab)) < margin:
            return False
    return True


if __name__ == '__main__':
    g = Ground()
    trees, ncols = christmas_trees()
    print('top y', round(g.y_top, 1), 'low y', round(g.y_low, 1), 'A', g.A, 'H', g.H, 'Lw', round(g.L_w, 1))
    print('trees', len(trees), 'lines', ncols)
    from collections import Counter
    print(Counter(t['species'] for t in trees), Counter(t['size'] for t in trees))
