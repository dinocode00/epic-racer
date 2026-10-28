"""Warp the hand sketch onto the satellite outline with mean value coordinates.

Both outlines are listed as matching polygons (same vertex order). A point inside one
polygon is written as a weighted blend of its vertices; the same weights applied to the
other polygon's vertices give the matching point.
"""
import numpy as np

# Matching outline vertices: tip, NE corner, SE corner, SW corner, inner notch corner,
# west corner, driveway entrance on the road edge.
SKETCH_POLY = np.array([
    (875, 125),    # tip at the road corner
    (1470, 385),   # NE corner
    (1452, 1390),  # SE corner
    (622, 1370),   # SW corner
    (722, 700),    # inner corner where the west wing meets the long west side
    (622, 465),    # west corner (road edge meets the angled SW edge)
    (755, 292),    # driveway entrance on the road edge
], float)
AERIAL_POLY = np.array([
    (733, 66),
    (1056, 336),
    (1040, 1168),
    (505, 1122),
    (510, 540),
    (355, 388),
    (530, 255),
], float)


def mvc(poly, pts):
    """Mean value coordinates of pts (N,2) w.r.t. polygon (M,2). Returns (N,M)."""
    pts = np.atleast_2d(pts)
    d = poly[None, :, :] - pts[:, None, :]  # (N,M,2)
    r = np.linalg.norm(d, axis=2) + 1e-9
    dn = np.roll(d, -1, axis=1)
    rn = np.roll(r, -1, axis=1)
    cross = d[..., 0] * dn[..., 1] - d[..., 1] * dn[..., 0]
    dot = (d * dn).sum(axis=2)
    ang = np.arctan2(cross, dot)  # angle at pt between v_i and v_{i+1}
    t = np.tan(ang / 2)
    tp = np.roll(t, 1, axis=1)
    w = (tp + t) / r
    return w / w.sum(axis=1, keepdims=True)


def warp(pts, src=SKETCH_POLY, dst=AERIAL_POLY):
    return mvc(src, np.asarray(pts, float)) @ dst


if __name__ == '__main__':
    tests = {
        'sketch house': (1043, 350),
        'sketch barn': (1212, 633),
        'sketch garage2': (1258, 560),
        'sketch bin10': (1192, 735),
        'sketch garage9': (1100, 790),
        'sketch windmill': (962, 362),
    }
    for k, p in tests.items():
        print(k, np.round(warp([p])[0]))
    print('aerial house ~ (723,248), barn ~ (860,417), red end ~ (887,377), island bin ~ (837,367)')
