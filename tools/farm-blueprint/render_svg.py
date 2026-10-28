"""Render the farm blueprint as a themed SVG (metres; classes styled by the page's tokens).

Plan view: buildings show their roofs (fill) with their wall colour as the outline.
"Their" compass used in answers follows the farm grid: north = along the barn toward the
wooden garage (u), west = the barn's ramp side (v).
"""
import math
import numpy as np
import blueprint as b
import terrain

rng = np.random.default_rng(7)
GRID = 50.0  # farm grid: long axis of barn, perpendicular to the NE property line (deg)
K = b.M_PER_PX / 0.19  # hand-placed metre positions below were set at the old 0.19 scale
U = np.array([math.cos(math.radians(GRID)), math.sin(math.radians(GRID))])  # farm "north"
V = np.array([-U[1], U[0]])  # farm "west" (the barn's ramp side)


def P(pts):
    return np.array(b.sk(pts))


def svgpt(p):
    return f'{p[0]:.1f},{-p[1]:.1f}'


def poly_d(pts, closed=True):
    return 'M' + ' L'.join(svgpt(p) for p in pts) + (' Z' if closed else '')


def smooth_d(pts, closed=True, k=0.5):
    """Catmull-Rom through pts as cubic beziers."""
    pts = [np.asarray(p, float) for p in pts]
    n = len(pts)
    out = 'M' + svgpt(pts[0])
    rng_ = range(n) if closed else range(n - 1)
    for i in rng_:
        p0 = pts[(i - 1) % n] if closed or i > 0 else pts[i]
        p1, p2 = pts[i], pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if closed or i + 2 < n else p2
        c1 = p1 + (p2 - p0) * k / 3
        c2 = p2 - (p3 - p1) * k / 3
        out += f' C{svgpt(c1)} {svgpt(c2)} {svgpt(p2)}'
    return out + (' Z' if closed else '')


def rect(c, w, h, ang):
    """Rectangle centred at c, w along ang (deg, CCW from east), h across."""
    a = math.radians(ang)
    u = np.array([math.cos(a), math.sin(a)])
    v = np.array([-u[1], u[0]])
    c = np.asarray(c, float)
    return [c - u * w / 2 - v * h / 2, c + u * w / 2 - v * h / 2, c + u * w / 2 + v * h / 2, c - u * w / 2 + v * h / 2]


def inside(pt, poly):
    x, y = pt
    ins = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            ins = not ins
    return ins


def along(line, step):
    line = np.asarray(line, float)
    out = []
    for a, c in zip(line[:-1], line[1:]):
        L = np.linalg.norm(c - a)
        for t in np.arange(0, L, step):
            out.append(a + (c - a) * t / L)
    out.append(line[-1])
    return out


def conifer(p, r, cls='conifer'):
    x, y = p[0], -p[1]
    pts = []
    for i in range(10):
        rr = r if i % 2 == 0 else r * 0.62
        a = math.pi / 2 + i * math.pi / 5
        pts.append(f'{x + rr * math.cos(a):.2f},{y - rr * math.sin(a):.2f}')
    return f'<polygon class="{cls}" points="{" ".join(pts)}"/>'


def badge(n, p, tag):
    return (f'<g class="badge" data-lm="{tag}"><circle cx="{p[0]:.1f}" cy="{-p[1]:.1f}" r="3.3"/>'
            f'<text x="{p[0]:.1f}" y="{-p[1] + 1.25:.1f}">{n}</text></g>')


def tag(p, text, anchor='middle'):
    return f'<text class="tag" text-anchor="{anchor}" x="{p[0]:.1f}" y="{-p[1]:.1f}">{text}</text>'


def seg(a, c, cls):
    return f'<path class="{cls}" d="M{svgpt(a)} L{svgpt(c)}"/>'


def render():
    F = b.F
    bd = np.array(b.blueprint()['boundary'])
    out = []
    minx, miny = bd.min(0) - 18
    maxx, maxy = bd.max(0) + np.array([26.0, 16.0])
    W, H = maxx - minx, maxy - miny
    vb = f'{minx:.1f} {-maxy:.1f} {W:.1f} {H:.1f}'
    out.append(f'<svg class="map" viewBox="{vb}" xmlns="http://www.w3.org/2000/svg" role="img" '
               f'aria-label="Top-down blueprint of the farm with 17 numbered landmarks">')
    out.append('<defs>'
               '<pattern id="gravel" width="3" height="3" patternUnits="userSpaceOnUse">'
               '<rect width="3" height="3" class="gravel-bg"/><circle cx=".7" cy=".8" r=".22" class="grit"/>'
               '<circle cx="2.2" cy="2.1" r=".18" class="grit"/><circle cx="2.4" cy=".5" r=".14" class="grit"/></pattern>'
               '<pattern id="meadow" width="4" height="4" patternUnits="userSpaceOnUse">'
               '<rect width="4" height="4" class="meadow-bg"/><path d="M.6 1.4 l.3 -.9 M2.6 3.4 l-.2 -.8 M3.3 1.1 l.25 -.7" class="weed"/>'
               '<circle cx="1.6" cy="2.6" r=".22" class="flower-a"/><circle cx="3.2" cy=".4" r=".18" class="flower-b"/>'
               '<circle cx=".5" cy="3.5" r=".16" class="flower-c"/></pattern>'
               '<pattern id="shingle" width="1.2" height="1.2" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)">'
               '<rect width="1.2" height="1.2" class="shingle-bg"/><path d="M0 .6 H1.2" class="shingle-line"/></pattern>'
               '<pattern id="mesh" width=".6" height=".6" patternUnits="userSpaceOnUse">'
               '<rect width=".6" height=".6" class="corn"/><path d="M0 0 H.6 M0 0 V.6" class="mesh-line"/></pattern>'
               f'<clipPath id="prop"><path d="{poly_d(bd)}"/></clipPath>'
               '</defs>')

    tip, ne, west = bd[0], bd[1], bd[-1]
    sw_i = int(np.argmin(bd[:, 1] - bd[:, 0] * 0.01))
    # Outside the line: the rising meadow hill to the south and neighbouring farms behind trees.
    south = bd[(bd[:, 1] < 12)]
    hill = [(p[0], p[1]) for p in south[np.argsort(south[:, 0])]]
    hill = [(hill[0][0] - 10, hill[0][1])] + hill + [(hill[-1][0] + 14, hill[-1][1]), (hill[-1][0] + 14, miny), (hill[0][0] - 10, miny)]
    out.append(f'<g id="lm-outside"><path class="meadow" d="{poly_d(hill)}"/>')
    out.append(tag((np.mean([p[0] for p in hill[:-2]]), miny + 5), 'RISING HILL OF GRASS, WILDFLOWERS AND WEEDS'))
    for c, label, anchor in (((ne[0] + 13, ne[1] - 24), 'neighbouring farm behind trees', 'middle'),
                             ((west[0] + 4, west[1] - 52), 'neighbouring farm behind trees', 'end')):
        for _ in range(9):
            q = np.array(c) + rng.normal(0, 4.5, 2)
            out.append(f'<circle class="woods" cx="{q[0]:.1f}" cy="{-q[1]:.1f}" r="{rng.uniform(2.2, 3.6):.1f}"/>')
        if anchor == 'middle':
            out.append(tag((c[0], c[1] - 10), 'neighbouring farm', anchor))
            out.append(tag((c[0], c[1] - 12.8), 'behind trees', anchor))
        else:
            out.append(tag((c[0] - 7, c[1] - 10), label, anchor))
    out.append('</g>')

    # The paved country road along the NW edge, with aged cracks, and the lane seen today on the NE.
    nw_dir = (west - tip) / np.linalg.norm(west - tip)
    nrm = np.array([nw_dir[1], -nw_dir[0]])
    if inside((tip + west) / 2 + nrm * 3, bd):  # make it point outward (to the NW)
        nrm = -nrm
    road = [tip - nw_dir * 30 + nrm * 4.5, west + nw_dir * 30 + nrm * 4.5]
    out.append(f'<path class="road" d="{poly_d(road, False)}"/>')
    for t in np.linspace(0.05, 0.95, 9):
        p0 = road[0] + (road[1] - road[0]) * t + nrm * rng.uniform(-1.5, 1.5)
        pts = [p0]
        for _ in range(3):
            pts.append(pts[-1] + nw_dir * rng.uniform(0.8, 2.2) + nrm * rng.uniform(-0.9, 0.9))
        out.append(f'<path class="crack" d="{poly_d(pts, False)}"/>')
    out.append(f'<text class="road-label" transform="translate({svgpt((tip + west) / 2 + nrm * 11.5)}) '
               f'rotate({-math.degrees(math.atan2(west[1] - tip[1], west[0] - tip[0])) + 180:.1f})">PAVED COUNTRY ROAD</text>')
    ent_t = float((P([(757, 290)])[0] - tip) @ nw_dir)
    L_nw = float(np.linalg.norm(west - tip))
    for t0, t1 in ((0.6, ent_t - 4.5), (ent_t + 4.5, L_nw - 0.6)):
        out.append(seg(tip + nw_dir * t0 + nrm * 0.9, tip + nw_dir * t1 + nrm * 0.9, 'ditch'))
    out.append(tag(tip + nw_dir * (L_nw * 0.72) - nrm * 2.8, 'light ditch along the road'))
    ne_dir = (ne - tip) / np.linalg.norm(ne - tip)
    nrm2 = np.array([-ne_dir[1], ne_dir[0]])  # outward (to the NE)
    lane = [tip + nrm2 * 7 - ne_dir * 8, ne + nrm2 * 7 + ne_dir * 18]
    out.append(f'<path class="lane" d="{poly_d(lane, False)}"/>')
    out.append(f'<text class="road-label faint" transform="translate({svgpt((tip + ne) / 2 + nrm2 * 13)}) '
               f'rotate({-math.degrees(math.atan2(ne[1] - tip[1], ne[0] - tip[0])):.1f})">GRAVEL LANE</text>')

    # Ground: mowed lawn, then contour lines every 2 ft relative to the barnyard
    out.append(f'<path class="lawn" d="{poly_d(bd)}"/>')
    out.append('<g clip-path="url(#prop)">')
    out.append(f'<g id="lm-meadow"><path class="meadow" d="{smooth_d(P(F["meadow_east"]["poly"]), True, 0.3)}"/></g>')
    g = terrain.Ground()
    cs = terrain.contours(g, bd[:, 0].min() - 2, bd[:, 0].max() + 2, bd[:, 1].min() - 2, bd[:, 1].max() + 2)
    out.append('<g id="lm-ground">')
    for lvl, segs in sorted(cs.items(), reverse=True):
        d = ' '.join(f'M{svgpt(p)} L{svgpt(q)}' for p, q in segs)
        major = abs(round(lvl / terrain.FT) % 10) < 0.5
        out.append(f'<path class="contour{" major" if major else ""}" d="{d}"/>')
    out.append('</g>')

    # Pumpkin and gourd patch
    pp = P(F['pumpkin_patch']['poly'])
    out.append(f'<g id="lm-14"><path class="soil" d="{poly_d(pp)}"/>')
    for y in np.arange(pp[:, 1].min() + 2.5, pp[:, 1].max() - 1, 3.2):
        row = [(x, y) for x in np.arange(pp[:, 0].min() + 1, pp[:, 0].max(), 2.6) if inside((x, y), pp)]
        if len(row) > 1:
            out.append(f'<path class="vine" d="M{svgpt(row[0])} L{svgpt(row[-1])}"/>')
        for x, yy in row:
            jx, jy = rng.normal(0, 0.5, 2)
            gourd = rng.uniform() < 0.22
            cls, r = ('gourd', rng.uniform(0.35, 0.5)) if gourd else ('pumpkin', rng.uniform(0.55, 0.9))
            out.append(f'<circle class="{cls}" cx="{x + jx:.1f}" cy="{-(yy + jy):.1f}" r="{r:.2f}"/>')
    out.append('</g>')

    # Mowed grass paths and the grass lane (tractor tyre marks show in them)
    out.append('<g id="lm-paths">')
    for k, wdt in (('south_lane', 4.2), ('west_trail', 2.6), ('east_trail', 2.6)):
        tl = P(F[k]['line'])
        out.append(f'<path class="mowed" style="stroke-width:{wdt}" d="{smooth_d(tl, False)}"/>')
        for off in (-0.55, 0.55):
            sh = [p + np.array([0.0, 0.0]) for p in tl]
            out.append(f'<path class="tyre" transform="translate({off:.2f},{off * 0.3:.2f})" d="{smooth_d(sh, False)}"/>')
    out.append('</g>')

    # Christmas tree block
    ct = P(F['christmas_trees']['poly'])
    out.append(f'<g id="lm-13"><path class="tree-block" d="{poly_d(ct)}"/>')
    trees, _ = terrain.christmas_trees()
    for t in trees:
        r = terrain.SIZES[t['size']][2]
        if t['species'] in ('scotch', 'white'):  # pines: soft round tufts
            out.append(f'<circle class="xm-{t["species"]}" cx="{t["x"]:.1f}" cy="{-t["y"]:.1f}" r="{r:.2f}"/>')
        else:  # fir and spruce: pointed stars
            out.append(conifer((t['x'], t['y']), r * 1.15, f'xm-{t["species"]}'))
    out.append('</g>')

    # Gravel yard and driveway
    dw = P(F['driveway']['poly'])
    out.append(f'<g id="lm-5"><path class="gravel" d="{smooth_d(dw, True, 0.35)}"/></g>')
    # Mailbox at the entrance
    ent = P([(757, 290)])[0] + nrm * 1.2 - nw_dir * 3.5
    out.append(f'<g id="lm-mailbox"><rect class="mailbox" x="{ent[0] - .5:.1f}" y="{-ent[1] - .3:.1f}" width="1" height=".6"/></g>')

    # Orchard: 9 lines along the barn's length, about 10 trees each; west two lines pear and cherry
    oc = P(F['orchard']['poly'])
    cen = oc.mean(0)
    su, sv = 4.2, 4.4
    out.append(f'<g id="lm-7"><path class="orchard-ground" d="{smooth_d(oc)}"/>')
    for i in range(9):
        for j in range(10):
            q = cen + U * (j - 4.5) * su + V * (i - 4) * sv + V * 1.5 - U * 1.0
            if not inside(q, oc):
                continue
            fruit = 'apple' if i < 7 else ('pear' if (j + i) % 2 == 0 else 'cherry')
            out.append(f'<circle class="orchard-tree" cx="{q[0]:.1f}" cy="{-q[1]:.1f}" r="1.75"/>')
            for _ in range(3):
                a, r = rng.uniform(0, 6.28), rng.uniform(0.3, 1.2)
                out.append(f'<circle class="fruit-{fruit}" cx="{q[0] + r * math.cos(a):.2f}" cy="{-(q[1] + r * math.sin(a)):.2f}" r=".28"/>')
    out.append('</g>')

    # Grape vines: 4 trellis rows, shortened 20% at the north end; garden patch in the freed space
    out.append('<g id="lm-8">')
    ends = []
    for row in F['grape_vines']['rows']:
        r = P(row)
        a, c = r[0], r[0] + (r[1] - r[0]) * 0.8
        ends.append((a, r[1]))
        out.append(seg(a, c, 'trellis'))
        for p in along([a, c], 3.0):
            out.append(f'<rect class="post" x="{p[0] - .3:.2f}" y="{-p[1] - .3:.2f}" width=".6" height=".6"/>')
    out.append('</g>')
    gc = np.mean([a + (c - a) * 0.92 for a, c in ends], axis=0)
    gdir = math.degrees(math.atan2(*(ends[0][1] - ends[0][0])[::-1]))
    out.append(f'<g id="lm-garden"><path class="garden" d="{poly_d(rect(gc, 2.1, 3.05, gdir))}"/>')
    for k in range(-1, 2):
        q = gc + np.array([math.cos(math.radians(gdir)), math.sin(math.radians(gdir))]) * 0.0 + \
            np.array([-math.sin(math.radians(gdir)), math.cos(math.radians(gdir))]) * k * 0.9
        out.append(f'<circle class="flower-a" cx="{q[0]:.2f}" cy="{-q[1]:.2f}" r=".25"/>')
    out.append('</g>')

    # Scenery trees: the very large Scotch pine, the evergreens by the road, the spruce row
    bt = P([F['big_tree']['centre']])[0]
    out.append('<g id="lm-bigtree">')
    for dx, dy, r in ((0, 0, 6.8), (-2.6, 2.2, 3.4), (2.8, 1.6, 3.2), (1.4, -3.0, 3.4), (-2.4, -2.4, 3.0), (0.4, 0.4, 3.0)):
        out.append(f'<circle class="{"big-pine" if r > 6 else "big-pine-tuft"}" cx="{bt[0] + dx:.1f}" cy="{-(bt[1] + dy):.1f}" r="{r:.1f}"/>')
    out.append('</g><g id="lm-conifers">')
    for p in P(F['nw_conifers']['pts']):
        out.append(conifer(p, 4.2, 'spruce big'))
    out.append('</g><g id="lm-arborvitae">')
    for p in along(P(F['arborvitae']['line']), 1.15):
        out.append(f'<circle class="arborvitae" cx="{p[0]:.1f}" cy="{-p[1]:.1f}" r=".62"/>')
    out.append('</g><g id="lm-treerow">')
    for p in along(P(F['ne_tree_row']['line']), 6.5)[1:-1]:
        out.append(conifer(p + rng.normal(0, 0.4, 2), 2.7, 'spruce'))
    out.append('</g>')

    # Barn group: ramp, old well, sandbox
    bcen = b.barn_centre()
    out.append('<g id="lm-4">')
    ramp = [bcen + V * 5.75 - U * 4.6, bcen + V * 5.75 + U * 4.6, bcen + V * 16 + U * 5.4, bcen + V * 16 - U * 5.4]
    out.append(f'<path class="blacktop" d="{poly_d(ramp)}"/>')
    out.append(f'<path class="slope" d="M{svgpt(bcen + V * 13.5)} L{svgpt(bcen + V * 8)} M{svgpt(bcen + V * 9.5 + U * 1.2)} '
               f'L{svgpt(bcen + V * 8)} L{svgpt(bcen + V * 9.5 - U * 1.2)}"/>')
    out.append('</g>')
    well = bcen + V * 8.2 + U * 8.6
    out.append(f'<g id="lm-well"><circle class="well" cx="{well[0]:.1f}" cy="{-well[1]:.1f}" r="1.22"/>'
               f'<circle class="well-in" cx="{well[0]:.1f}" cy="{-well[1]:.1f}" r=".92"/></g>')
    sand = bcen + V * 8.0 - U * 8.4
    out.append(f'<g id="lm-sandbox"><path class="sandbox" d="{poly_d(rect(sand, 2.44, 1.22, GRID))}"/></g>')

    # Buildings, snapped to the farm grid
    house_c = P([F['farmhouse']['centre']])[0]
    out.append('<g id="lm-1">')
    # From the photo: an L-shaped two-storey house. Main block with its ridge along the farm grid,
    # a steep front gable projecting toward the road on its north half, and a one-storey porch in
    # the corner on the south half. Front steps on the south end (door a little left of centre,
    # white bench to its right). White siding, slate-blue trim, dark shingles, fieldstone base.
    hc = house_c
    main = rect(hc, 10.0, 6.4, GRID)
    wing = rect(hc + U * 2.2 + V * 4.45, 5.4, 2.5, GRID)
    porch = rect(hc - U * 2.6 + V * 4.25, 4.6, 2.1, GRID)
    for q in (main, wing):
        out.append(f'<path class="stone" d="{poly_d(rect(np.mean(q, axis=0), np.linalg.norm(q[1] - q[0]) + .5, np.linalg.norm(q[3] - q[0]) + .5, GRID))}"/>')
    out.append(f'<path class="porch-floor" d="{poly_d(porch)}"/>')
    out.append(f'<path class="bld roof-black wall-white" d="{poly_d(porch)}"/>')
    for s in (-1, 1):  # the two outer porch posts
        post = hc - U * (2.6 + 2.15 * s) + V * 5.15
        out.append(f'<circle class="post-white" cx="{post[0]:.1f}" cy="{-post[1]:.1f}" r=".2"/>')
    out.append(f'<path class="bld roof-black wall-white" d="{poly_d(main)}"/>')
    out.append(f'<path class="bld roof-black wall-white" d="{poly_d(wing)}"/>')
    out.append(seg(hc - U * 5.0, hc + U * 5.0, 'ridge light'))
    out.append(seg(hc + U * 2.2, hc + U * 2.2 + V * 5.7, 'ridge light'))
    ch = hc + U * 0.9
    out.append(f'<path class="chimney" d="{poly_d(rect(ch, 0.7, 0.7, GRID))}"/>')
    # Front steps on the south end, railings both sides, door slightly left, bench to the right
    out.append(f'<path class="concrete" d="{poly_d(rect(hc - U * 5.8, 1.6, 2.6, GRID))}"/>')
    for s in (-1, 1):
        out.append(seg(hc - U * 5.0 + V * 1.3 * s, hc - U * 6.6 + V * 1.3 * s, 'rail'))
    out.append(seg(hc - U * 5.0 + V * 0.85, hc - U * 5.0 - V * 0.25, 'door'))
    out.append(f'<path class="bench" d="{poly_d(rect(hc - U * 5.45 - V * 0.95, 0.35, 0.95, GRID))}"/>')
    out.append(seg(hc + V * 3.2 - U * 2.0, hc + V * 3.2 - U * 3.0, 'door'))
    out.append('</g>')

    # Barn: stone foundation rim, black shingle roof with the painted Christmas tree on the west slope
    out.append('<g id="lm-3">')
    out.append(f'<path class="stone" d="{poly_d(rect(bcen, 23.3, 12.3, GRID))}"/>')
    out.append(f'<path class="bld roof-black wall-red" d="{poly_d(rect(bcen, 22.5, 11.5, GRID))}"/>')
    out.append(seg(bcen - U * 11.25, bcen + U * 11.25, 'ridge light'))
    apex, base = bcen + V * 0.35, bcen + V * 5.25
    out.append(f'<path class="painted-tree" d="M{svgpt(apex)} L{svgpt(base + U * 4.2)} L{svgpt(base - U * 4.2)} Z"/>')
    out.append(f'<path class="painted-trunk" d="{poly_d(rect(base + V * 0.25, 1.0, 0.5, GRID))}"/>')
    out.append(conifer(apex, 0.75, 'painted-star'))
    # Upper floor: two tractor-size doors at the top of the ramp, sliding left and right (white trim)
    wpt = bcen + V * 6.15
    for s in (-1, 1):
        out.append(seg(wpt, wpt + U * 3.7 * s, 'door'))
        tp = wpt + U * 5.6 * s
        out.append(f'<path class="door-arrow" d="M{svgpt(wpt + U * 4.2 * s)} L{svgpt(tp)} '
                   f'M{svgpt(tp - U * 0.8 * s + V * 0.6)} L{svgpt(tp)} L{svgpt(tp - U * 0.8 * s - V * 0.6)}"/>')
    # Ground floor, south end: one giant sliding door with a walk-through door cut in, and the hoop
    se = bcen - U * 12.05
    out.append(seg(se + V * 2.6, se - V * 2.6, 'door'))
    out.append(seg(se + V * 2.2, se + V * 1.3, 'door-cut'))
    hoop = se - U * 0.9
    out.append(f'<circle class="hoop" cx="{hoop[0]:.1f}" cy="{-hoop[1]:.1f}" r=".45"/>')
    out.append('</g>')

    # Wooden garage on the barn's north end: red, shed roof falling north, door facing west
    g2 = bcen + U * 14.1
    out.append(f'<g id="lm-2"><path class="bld roof-black wall-red" d="{poly_d(rect(g2, 5.6, 11.5, GRID))}"/>')
    for k in (-3, 0, 3):
        out.append(f'<path class="roof-fall" d="M{svgpt(g2 + V * k - U * 1.6)} L{svgpt(g2 + V * k + U * 1.6)} '
                   f'M{svgpt(g2 + V * k + U * 0.9 + V * 0.6)} L{svgpt(g2 + V * k + U * 1.6)} L{svgpt(g2 + V * k + U * 0.9 - V * 0.6)}"/>')
    out.append(seg(g2 + V * 5.85 - U * 1.8, g2 + V * 5.85 + U * 1.8, 'door'))
    out.append('</g>')

    # Red wooden garage: black shingles, big door facing north
    g9c = P([(1027, 776)])[0]
    ang9 = GRID + 15
    u9 = np.array([math.cos(math.radians(ang9)), math.sin(math.radians(ang9))])
    v9 = np.array([-u9[1], u9[0]])
    out.append(f'<g id="lm-9"><path class="bld roof-black wall-red" d="{poly_d(rect(g9c, 11, 7, ang9))}"/>')
    out.append(seg(g9c - u9 * 5.5, g9c + u9 * 5.5, 'ridge light'))
    out.append(seg(g9c + u9 * 5.8 + v9 * 2.4, g9c + u9 * 5.8 - v9 * 2.4, 'door'))
    out.append(f'<circle class="vane" cx="{g9c[0]:.1f}" cy="{-g9c[1]:.1f}" r=".5"/>'
               f'{seg(g9c - np.array([0.0, 1.0]), g9c + np.array([0.0, 1.0]), "vane-arm")}{seg(g9c - np.array([1.0, 0.0]), g9c + np.array([1.0, 0.0]), "vane-arm")}')
    out.append('</g>')

    # Corn crib (8 ft wire crib) with the garden-tool shed right beside it
    bc = P([F['grain_bin']['centre']])[0]
    out.append(f'<g id="lm-10"><circle class="crib" cx="{bc[0]:.1f}" cy="{-bc[1]:.1f}" r="1.4"/>'
               f'<circle class="crib-cap" cx="{bc[0]:.1f}" cy="{-bc[1]:.1f}" r=".45"/></g>')
    sh = bc - U * (1.4 + 0.3 + 3.0)
    out.append(f'<g id="lm-11"><path class="bld roof-black wall-red" d="{poly_d(rect(sh, 6, 3.6, GRID))}"/>'
               f'{seg(sh - U * 3, sh + U * 3, "ridge")}</g>')
    gh = P([(1248, 835)])[0]
    out.append(f'<g id="lm-12"><path class="bld glass" d="{poly_d(rect(gh, 3.05, 1.83, GRID - 80))}"/>'
               f'{seg(*[gh + np.array([math.cos(math.radians(GRID - 80)), math.sin(math.radians(GRID - 80))]) * s * 1.52 for s in (-1, 1)], "ridge")}</g>')
    pl = P([F['playhouse']['centre']])[0]
    out.append(f'<g id="lm-17"><path class="bld roof-black wall-red" d="{poly_d(rect(pl, 2.44, 2.44, GRID))}"/>'
               f'{seg(pl - U * 1.22, pl + U * 1.22, "ridge light")}</g>')

    # Windmill
    wm = P([F['windmill']['centre']])[0]
    sq = rect(wm, 2.6, 2.6, GRID)
    out.append(f'<g id="lm-6"><circle class="rotor" cx="{wm[0]:.1f}" cy="{-wm[1]:.1f}" r="2.6"/>'
               f'<path class="tower" d="{poly_d(sq)}"/>'
               f'<path class="tower-x" d="{poly_d(sq)} M{svgpt(sq[0])} L{svgpt(sq[2])} M{svgpt(sq[1])} L{svgpt(sq[3])}"/></g>')
    # Barrel stove for burning garbage, with a small pile of scrap wood
    wb = P([F['wood_burner']['centre']])[0]
    out.append(f'<g id="lm-15"><rect class="rust" x="{wb[0] - 1.1:.1f}" y="{-wb[1] - .45:.1f}" width="2.2" height=".9" rx=".45"/>'
               f'<circle class="stack" cx="{wb[0] + 0.7:.1f}" cy="{-wb[1]:.1f}" r=".3"/>')
    for k in range(5):
        q = wb + np.array([-2.2, -1.3]) + rng.normal(0, 0.35, 2)
        a = rng.uniform(0, math.pi)
        out.append(seg(q - np.array([math.cos(a), math.sin(a)]) * 0.6, q + np.array([math.cos(a), math.sin(a)]) * 0.6, 'scrap'))
    out.append('</g>')
    # Clothes lines: two sets of T-posts, three lines
    e0, e1 = P(F['clothes_lines']['ends'])
    d = (e1 - e0) / np.linalg.norm(e1 - e0)
    n_ = np.array([-d[1], d[0]])
    out.append('<g id="lm-16">')
    for e in (e0, e1):
        out.append(seg(e - n_ * 1.1, e + n_ * 1.1, 'tpost'))
    for o in (-0.8, 0, 0.8):
        out.append(seg(e0 + n_ * o, e1 + n_ * o, 'line'))
    out.append('</g>')
    out.append('</g>')  # end clip

    # Downhill arrows and spot heights (relative to the barnyard)
    out.append('<g id="lm-slopes">')

    def downhill(p, q):
        p, q = np.asarray(p, float), np.asarray(q, float)
        dd = (q - p) / np.linalg.norm(q - p)
        nn = np.array([-dd[1], dd[0]])
        return (f'<path class="slope" d="M{svgpt(p)} L{svgpt(q)} M{svgpt(q - dd * 2 + nn * 1.3)} '
                f'L{svgpt(q)} L{svgpt(q - dd * 2 - nn * 1.3)}"/>')

    for x in (20 * K, 90 * K):
        out.append(downhill((x, g.y_top - 6), (x, g.y_low + 22)))
    wmid = g.A + (g.H - g.A) * 0.45
    out.append(downhill(wmid - g.n * 3, wmid + g.n * 17))
    out.append(downhill(g.A + (g.H - g.A) * 0.15 - g.n * 2, g.A + (g.H - g.A) * 0.15 + g.n * 12))
    out.append(downhill(g.H + (g.H - g.A) * 0.2 - g.n * 1, g.H + (g.H - g.A) * 0.2 + g.n * 11))
    out.append(downhill(bcen + U * 2 - V * 12, bcen - U * 6 - V * 12))
    out.append(f'<path class="slope-line" d="M{svgpt(g.A)} L{svgpt(g.H)}"/>')
    out.append(f'<path class="slope-line" d="M{svgpt((bd[:, 0].min(), g.y_top))} L{svgpt((bd[:, 0].max(), g.y_top))}"/>')

    def spot(p, text, anchor='middle'):
        return f'<text class="spot" text-anchor="{anchor}" x="{p[0]:.1f}" y="{-p[1]:.1f}">{text}</text>'

    out.append(spot((90 * K, g.y_top + 2.2), 'slope starts · 0 ft'))
    out.append(spot((91 * K, 17 * K), 'lowest · ≈ −20 ft'))
    out.append(spot(west + (9, 1), '≈ −15 ft', 'start'))
    out.append(spot(P([(1035, 560)])[0], 'barnyard · 0 ft'))
    out.append(spot(house_c - V * 11 - U * 4, 'rises ≈ 3 ft to house'))
    out.append('</g>')

    # Small labels for unnumbered things
    out.append(tag(well + V * 1.6 + U * 0.6, 'old well'))
    out.append(tag(sand + V * 1.7 - U * 0.6, 'sandbox'))
    out.append(tag(gc + np.array([-4.5, 0.5]), 'garden', 'end'))
    out.append(tag(ent + nrm * 2.4, 'mailbox'))
    out.append(tag(P([(866, 296)])[0] + V * 2.6 + U * 1, 'arborvitae'))
    out.append(tag(g9c + np.array([1.5, -6.0]), 'rooster vane'))
    out.append(tag(P([(1385, 560)])[0], 'weeds, grass'))
    out.append(tag(P([(1385, 560)])[0] - (0, 2.8), 'and wildflowers'))

    # Property line on top
    out.append(f'<path class="propline" d="{poly_d(bd)}"/>')

    # Badges (placed beside each landmark)
    spots = {
        1: house_c + U * 9.5, 2: g2 + U * 6, 3: bcen - V * 2.8 - U * 4, 4: bcen + V * 19.5, 5: K * np.array([34, 146]),
        6: wm + (-5.5, 1.5), 7: K * np.array([14, 117]), 8: P([(912, 770)])[0] + (-3, -3.5), 9: g9c + (7.5, -1),
        10: bc + (4.2, 1.8), 11: sh + (-4.5, -1.5), 12: gh + (3.5, -3.0),
        13: K * np.array([49, 50]), 14: K * np.array([39, 6]), 15: wb + (0, 4.6), 16: (e0 + e1) / 2 + n_ * 4.2, 17: pl + (4.5, -1.5),
    }
    for n, p in spots.items():
        out.append(badge(n, np.asarray(p, float), f'lm-{n}'))

    # North arrow and scale bar
    ax, ay = maxx - 10, maxy - 8
    out.append(f'<g class="north"><path d="M{ax:.1f},{-ay + 7:.1f} L{ax:.1f},{-ay - 5:.1f} M{ax - 2.4:.1f},{-ay - 2:.1f} L{ax:.1f},{-ay - 5.5:.1f} L{ax + 2.4:.1f},{-ay - 2:.1f}"/>'
               f'<text x="{ax:.1f}" y="{-ay + 11.5:.1f}">N</text></g>')
    sx, sy = minx + 5, miny + 14
    out.append(f'<g class="scale"><rect x="{sx:.1f}" y="{-sy - 1:.1f}" width="20" height="1.4"/><rect class="alt" x="{sx + 20:.1f}" y="{-sy - 1:.1f}" width="20" height="1.4"/>'
               f'<text x="{sx:.1f}" y="{-sy - 2.6:.1f}">0</text><text x="{sx + 20:.1f}" y="{-sy - 2.6:.1f}">20</text><text x="{sx + 40:.1f}" y="{-sy - 2.6:.1f}">40 m</text>'
               f'<text x="{sx:.1f}" y="{-sy + 4.6:.1f}" class="ft">≈ 130 ft</text></g>')
    out.append('</svg>')
    return '\n'.join(out)


if __name__ == '__main__':
    import sys
    open(sys.argv[1] if len(sys.argv) > 1 else 'out/map.svg', 'w').write(render())
