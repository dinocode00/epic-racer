"""Blueprint v1: every feature from the hand sketch, carried onto the real outline.

Coordinates are entered in SKETCH pixels (images/2.jpg), warped to AERIAL pixels
(images/1.webp) and then to metres (x east, y north, origin at the SW property corner).
"""
import json
import sys
import numpy as np
from PIL import Image, ImageDraw
from warp import SKETCH_POLY, AERIAL_POLY, mvc

IMG = sys.argv[1] if len(sys.argv) > 1 else '../images'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'out'

# Scale: 0.19 m/px judged from today's buildings gave 4.61 acres; the owner's estimate is
# about 5 acres, so the scale is set to match 5 acres.
M_PER_PX = 0.19 * (5.0 / 4.6127) ** 0.5
ORIGIN = np.array([505.0, 1122.0])  # SW corner in aerial px

# Interior anchors: sketch position -> today's footprint (assumes same buildings/sites).
ANCHORS = [
    ((1043, 350), (723, 248)),  # farmhouse
    ((1212, 633), (850, 430)),  # barn main body
    ((1258, 560), (887, 377)),  # wooden garage at the barn's NE end (red roof today)
]
_anc_src = np.array([a for a, _ in ANCHORS], float)
_anc_dst = np.array([b for _, b in ANCHORS], float)
_anc_res = _anc_dst - mvc(SKETCH_POLY, _anc_src) @ AERIAL_POLY
SIGMA = 140.0  # sketch px falloff of the anchor pull


def _edge_dist(poly, pts):
    """Distance from pts to the polygon outline."""
    best = np.full(len(pts), np.inf)
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        ab = b - a
        t = np.clip(((pts - a) @ ab) / (ab @ ab), 0, 1)
        d = np.linalg.norm(pts - (a + t[:, None] * ab), axis=1)
        best = np.minimum(best, d)
    return best


def _anchor_weights(pts):
    d2 = ((pts[:, None, :] - _anc_src[None]) ** 2).sum(-1)
    g = np.exp(-d2 / (2 * SIGMA**2))
    return g


# Solve so that each anchor lands exactly (RBF interpolation of residuals).
_G = _anchor_weights(_anc_src)
_taper_a = np.clip(_edge_dist(SKETCH_POLY, _anc_src) / 60.0, 0, 1)
_coef = np.linalg.solve(_G * _taper_a[:, None], _anc_res)


def to_aerial(pts):
    pts = np.atleast_2d(np.asarray(pts, float))
    base = mvc(SKETCH_POLY, pts) @ AERIAL_POLY
    taper = np.clip(_edge_dist(SKETCH_POLY, pts) / 60.0, 0, 1)
    return base + taper[:, None] * (_anchor_weights(pts) @ _coef)


def to_m(aerial_pts):
    p = np.atleast_2d(aerial_pts) - ORIGIN
    return np.column_stack([p[:, 0], -p[:, 1]]) * M_PER_PX


# v7: the top of the Christmas tree block is one straight west-east line, a little south of
# the back wall of the red garage (9). The gravel yard is cut back so it stops short of it.
CT_TOP_Y_M = 91.0
GRAVEL_CUT_Y_M = CT_TOP_Y_M + 2.6  # leaves room for the mowed path along the block's top


def _edge_x_at(p, q, y):
    return p[0] + (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1])


def christmas_poly_m():
    """Block outline in metres: straight top at CT_TOP_Y_M, sides and bottom from the sketch."""
    nw, ne, se, sw = (np.array(p) for p in sk(F['christmas_trees']['poly']))
    return [[round(_edge_x_at(sw, nw, CT_TOP_Y_M), 2), CT_TOP_Y_M],
            [round(_edge_x_at(se, ne, CT_TOP_Y_M), 2), CT_TOP_Y_M],
            se.tolist(), sw.tolist()]


def barn_centre():
    return to_m(np.array([ANCHORS[1][1]], float))[0]


def sk(pts):
    """Sketch px -> metres, rounded."""
    return np.round(to_m(to_aerial(pts)), 1).tolist()


# ---- The outline itself is traced from the satellite red line (aerial px) ----
BOUNDARY_AERIAL = [
    (733, 66), (1056, 336), (1040, 353), (1025, 373), (1013, 398), (1012, 415), (1020, 430),
    (1040, 1168), (1010, 1162), (890, 1141), (740, 1119), (620, 1108), (560, 1108),
    (520, 1112), (505, 1122), (510, 540), (355, 388),
]

# ---- Features in sketch px ----
F = {}
F['farmhouse'] = dict(n=1, kind='building', centre=(1043, 350))
F['wooden_garage'] = dict(n=2, kind='building', poly=[(1228, 535), (1290, 557), (1282, 592), (1218, 565)])
F['barn'] = dict(n=3, kind='building', poly=[(1215, 562), (1282, 587), (1215, 707), (1140, 675)])
F['gravel_hill'] = dict(
    n=4,
    kind='ramp',
    ramp=[(1115, 577), (1200, 555), (1215, 565), (1185, 600)],
    ramp2=[(1100, 607), (1165, 605), (1165, 630), (1100, 630)],
    loop=[(1170, 605), (1110, 600), (1085, 607), (1078, 627), (1090, 657), (1115, 686), (1150, 702), (1175, 716)],
    island=[(1090, 630), (1135, 640), (1130, 672), (1087, 662)],
)
F['driveway'] = dict(
    n=5,
    kind='gravel',
    poly=[
        (758, 268), (870, 318), (960, 356), (1000, 382), (1057, 392), (1062, 435), (1090, 462),
        (1140, 472), (1195, 490), (1232, 522), (1236, 548), (1215, 562), (1140, 675), (1215, 707),
        (1176, 730), (1164, 770), (1158, 810), (1175, 840), (1190, 862), (1172, 895), (1150, 905),
        (1110, 886), (1060, 858), (1030, 834), (1052, 798), (1088, 748), (1058, 712), (1030, 690),
        (995, 635), (975, 560), (955, 470), (930, 405), (850, 352), (735, 315),
    ],
)
F['windmill'] = dict(n=6, kind='windmill', centre=(962, 360), tank=(957, 368))
F['orchard'] = dict(
    n=7,
    kind='orchard',
    poly=[(845, 488), (955, 475), (985, 560), (998, 640), (950, 690), (885, 738), (800, 733), (762, 672),
          (730, 622), (735, 585), (768, 535)],
)
ORCHARD_SHIFT = (22, 42)
VINES_SHIFT = (9, 9)
F['grape_vines'] = dict(n=8, kind='vines', rows=[[(912, 770), (990, 668)], [(924, 778), (1002, 678)],
                                               [(936, 786), (1013, 689)], [(948, 794), (1024, 700)]])
# v6: the orchard sat closer to the red garage, with the grape rows squeezed in between
F['orchard']['poly'] = [(x + ORCHARD_SHIFT[0], y + ORCHARD_SHIFT[1]) for x, y in F['orchard']['poly']]
F['grape_vines']['rows'] = [[(x + VINES_SHIFT[0], y + VINES_SHIFT[1]) for x, y in row] for row in F['grape_vines']['rows']]
F['red_garage'] = dict(n=9, kind='building', poly=[(1023, 727), (1068, 746), (1030, 826), (985, 806)], door='sw')
F['grain_bin'] = dict(n=10, kind='bin', centre=(1192, 735), r=18)
F['red_shed'] = dict(n=11, kind='building', poly=[(1180, 765), (1202, 775), (1185, 822), (1162, 812)])
F['greenhouse'] = dict(n=12, kind='greenhouse', poly=[(1213, 805), (1293, 832), (1282, 865), (1203, 838)])
# Extended west toward the property line (v5): the slanted top edge continues west until it
# nearly meets the orchard, leaving only a mowed path along the west line.
F['christmas_trees'] = dict(n=13, kind='tree_block', poly=[(747, 742), (1305, 988), (1315, 1175), (685, 1132)],
                            marked_tree=(1005, 960))
F['pumpkin_patch'] = dict(n=14, kind='patch', poly=[(726, 1242), (1340, 1246), (1342, 1366), (630, 1362)])
F['wood_burner'] = dict(n=15, kind='burner', centre=(730, 450))
F['clothes_lines'] = dict(n=16, kind='clothesline', ends=[(1157, 360), (1240, 392)])
F['playhouse'] = dict(n=17, kind='playhouse', centre=(1280, 425))

# Unnumbered scenery from the sketch
F['big_tree'] = dict(kind='tree', centre=(842, 440))
# Mature arborvitae (~11 ft) along the north edge of the driveway, from the road to the windmill
F['arborvitae'] = dict(kind='tree_row', line=[(775, 257), (875, 307), (955, 345)])
F['nw_conifers'] = dict(kind='trees', pts=[(890, 210), (865, 255), (850, 295), (930, 285), (980, 260)])
# v8: the spruce that stood in the arborvitae row moves ~6 m north (metres, replaces pts[2])
SPRUCE_MOVED_M = {2: (22.0, 183.0)}
F['ne_tree_row'] = dict(kind='tree_row', line=[(905, 150), (1180, 270), (1455, 392)])
F['west_trail'] = dict(kind='trail', line=[(740, 705), (729, 760), (700, 940), (668, 1168)])
F['south_lane'] = dict(kind='lane', line=[(640, 1196), (778, 1172), (1060, 1190), (1346, 1210)])
F['east_trail'] = dict(kind='trail', line=[(1349, 1000), (1349, 1200), (1342, 1366)])  # v7: top part set in metres in render_svg
F['christmas_corner_trees'] = dict(kind='trees', pts=[(805, 760), (800, 1132), (1305, 985), (1315, 1172)])
F['christmas_inner_trees'] = dict(kind='trees', pts=[(870, 930), (1120, 985), (1205, 1005), (925, 1075), (1075, 1095), (1178, 1105)])
# Unmowed field of weeds, grass and wildflowers east of the barn and along the east line
F['meadow_east'] = dict(kind='meadow', poly=[(1305, 470), (1462, 430), (1462, 1236), (1358, 1232), (1358, 820),
                                             (1345, 775), (1325, 745), (1300, 700)])


def convert(v):
    if isinstance(v, tuple):
        return sk([v])[0]
    if isinstance(v, list) and v and isinstance(v[0], tuple):
        return sk(v)
    if isinstance(v, list) and v and isinstance(v[0], list):
        return [convert(x) for x in v]
    return v


def blueprint():
    out = {
        'units': 'metres; x east, y north; origin = SW property corner',
        'm_per_aerial_px': M_PER_PX,
        'boundary': np.round(to_m(np.array(BOUNDARY_AERIAL, float)), 1).tolist(),
        'features': {k: {kk: convert(vv) for kk, vv in v.items()} for k, v in F.items()},
    }
    return out


def shoelace(p):
    p = np.asarray(p)
    return 0.5 * abs(np.dot(p[:, 0], np.roll(p[:, 1], 1)) - np.dot(p[:, 1], np.roll(p[:, 0], 1)))


def overlay():
    """Satellite + traced outline + the sketch's ink warped on top."""
    aerial = Image.open(f'{IMG}/1.webp').convert('RGB')
    sketch = np.asarray(Image.open(f'{IMG}/2.jpg').convert('L')).astype(int)
    # Ink = dark compared with the local paper (paper has a shadow gradient).
    from PIL import ImageFilter
    paper = np.asarray(Image.open(f'{IMG}/2.jpg').convert('L').filter(ImageFilter.MaxFilter(31))).astype(int)
    ink = (paper - sketch) > 55
    ys, xs = np.nonzero(ink)
    poly = SKETCH_POLY
    inside = np.zeros(len(xs), bool)
    n = len(poly)
    for i in range(n):  # even-odd point-in-polygon, vectorised
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        cross = ((y1 > ys) != (y2 > ys)) & (xs < (x2 - x1) * (ys - y1) / (y2 - y1 + 1e-9) + x1)
        inside ^= cross
    keep = inside | (_edge_dist(poly, np.column_stack([xs, ys]).astype(float)) < 12)
    pts = np.column_stack([xs[keep], ys[keep]]).astype(float)
    dst = np.round(to_aerial(pts)).astype(int)
    base = np.asarray(aerial).copy()
    dim = (base * 0.55 + 255 * 0.15).astype(np.uint8)
    h, w = dim.shape[:2]
    ok = (dst[:, 0] >= 0) & (dst[:, 0] < w) & (dst[:, 1] >= 0) & (dst[:, 1] < h)
    dst = dst[ok]
    for dx in (0, 1):
        for dy in (0, 1):
            xx = np.clip(dst[:, 0] + dx, 0, w - 1)
            yy = np.clip(dst[:, 1] + dy, 0, h - 1)
            dim[yy, xx] = (255, 245, 120)
    im = Image.fromarray(dim)
    d = ImageDraw.Draw(im)
    d.line(BOUNDARY_AERIAL + [BOUNDARY_AERIAL[0]], fill=(255, 60, 200), width=3)
    for _, b in ANCHORS:
        d.ellipse([b[0] - 6, b[1] - 6, b[0] + 6, b[1] + 6], outline=(0, 255, 255), width=3)
    im.save(f'{OUT}/overlay_sketch_on_satellite.png')


if __name__ == '__main__':
    import os
    os.makedirs(OUT, exist_ok=True)
    bp = blueprint()
    a = shoelace(bp['boundary'])
    print(f'area {a:.0f} m2 = {a/4046.86:.2f} acres; bbox', np.ptp(np.array(bp["boundary"]), axis=0))
    print('anchor check', np.round(to_aerial(_anc_src)), 'want', _anc_dst.tolist())
    json.dump(bp, open(f'{OUT}/blueprint.json', 'w'), indent=1)
    overlay()
