"""Render blueprint v1 as a themed SVG (metres; classes styled by the page's tokens)."""
import math
import numpy as np
import blueprint as b
import terrain

rng = np.random.default_rng(7)
GRID = 50.0  # farm grid: long axis of barn, perpendicular to the NE property line (deg)


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


def offset_line(line, d):
    line = np.asarray(line, float)
    out = []
    for i, p in enumerate(line):
        a = line[max(i - 1, 0)]
        c = line[min(i + 1, len(line) - 1)]
        t = (c - a) / np.linalg.norm(c - a)
        out.append(p + np.array([-t[1], t[0]]) * d)
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


def render():
    F = b.F
    bd = np.array(b.blueprint()['boundary'])
    out = []
    minx, miny = bd.min(0) - 16
    maxx, maxy = bd.max(0) + 16
    W, H = maxx - minx, maxy - miny
    vb = f'{minx:.1f} {-maxy:.1f} {W:.1f} {H:.1f}'
    out.append(f'<svg class="map" viewBox="{vb}" xmlns="http://www.w3.org/2000/svg" role="img" '
               f'aria-label="Top-down blueprint of the farm with 17 numbered landmarks">')
    out.append('<defs>'
               '<pattern id="hatch" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">'
               '<rect width="1.6" height="1.6" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="1.6" class="hatch-line"/></pattern>'
               '<pattern id="gravel" width="3" height="3" patternUnits="userSpaceOnUse">'
               '<rect width="3" height="3" class="gravel-bg"/><circle cx=".7" cy=".8" r=".22" class="grit"/>'
               '<circle cx="2.2" cy="2.1" r=".18" class="grit"/><circle cx="2.4" cy=".5" r=".14" class="grit"/></pattern>'
               '<pattern id="mesh" width=".6" height=".6" patternUnits="userSpaceOnUse">'
               '<rect width=".6" height=".6" class="corn"/><path d="M0 0 H.6 M0 0 V.6" class="mesh-line"/></pattern>'
               f'<clipPath id="prop"><path d="{poly_d(bd)}"/></clipPath>'
               '</defs>')

    # Roads outside the line: the road along the NW edge, and the lane seen today on the NE.
    tip, ne, west = bd[0], bd[1], bd[-1]
    nw_dir = (west - tip) / np.linalg.norm(west - tip)
    nrm = np.array([nw_dir[1], -nw_dir[0]]) * -1  # outward (to the NW)
    road = [tip - nw_dir * 30 + nrm * 4.5, west + nw_dir * 30 + nrm * 4.5]
    out.append(f'<path class="road" d="{poly_d(road, False)}"/>')
    out.append(f'<text class="road-label" transform="translate({svgpt((tip + west) / 2 + nrm * 11)}) '
               f'rotate({-math.degrees(math.atan2(west[1] - tip[1], west[0] - tip[0])) + 180:.1f})">ROAD</text>')
    ne_dir = (ne - tip) / np.linalg.norm(ne - tip)
    nrm2 = np.array([-ne_dir[1], ne_dir[0]])  # outward (to the NE)
    lane = [tip + nrm2 * 7 - ne_dir * 8, ne + nrm2 * 7 + ne_dir * 18]
    out.append(f'<path class="lane-today" d="{poly_d(lane, False)}"/>')
    out.append(f'<text class="road-label faint" transform="translate({svgpt((tip + ne) / 2 + nrm2 * 13)}) '
               f'rotate({-math.degrees(math.atan2(ne[1] - tip[1], ne[0] - tip[0])):.1f})">LANE SEEN TODAY · WAS IT THERE?</text>')

    # Ground, with contour lines every 2 ft below the barnyard
    out.append(f'<path class="lawn" d="{poly_d(bd)}"/>')
    out.append('<g clip-path="url(#prop)">')
    g = terrain.Ground()
    cs = terrain.contours(g, bd[:, 0].min() - 2, bd[:, 0].max() + 2, bd[:, 1].min() - 2, bd[:, 1].max() + 2)
    out.append('<g id="lm-ground">')
    for i, (lvl, segs) in enumerate(sorted(cs.items(), reverse=True)):
        d = ' '.join(f'M{svgpt(p)} L{svgpt(q)}' for p, q in segs)
        cls = 'contour major' if (i + 1) % 2 == 0 else 'contour'
        out.append(f'<path class="{cls}" d="{d}"/>')
    out.append('</g>')

    # Pumpkin patch
    pp = P(F['pumpkin_patch']['poly'])
    out.append(f'<g id="lm-14"><path class="soil" d="{poly_d(pp)}"/>')
    ys = np.arange(pp[:, 1].min() + 2.5, pp[:, 1].max() - 1, 3.2)
    for y in ys:
        xs = np.arange(pp[:, 0].min() + 1, pp[:, 0].max(), 2.6)
        row = [(x, y) for x in xs if inside((x, y), pp)]
        if len(row) > 1:
            out.append(f'<path class="vine" d="M{svgpt(row[0])} L{svgpt(row[-1])}"/>')
        for x, yy in row:
            jx, jy = rng.normal(0, 0.5, 2)
            out.append(f'<circle class="pumpkin" cx="{x + jx:.1f}" cy="{-(yy + jy):.1f}" r="{rng.uniform(0.55, 0.9):.2f}"/>')
    out.append('</g>')

    # Christmas tree block
    ct = P(F['christmas_trees']['poly'])
    out.append(f'<g id="lm-13"><path class="tree-block" d="{poly_d(ct)}"/>')
    trees, _ = terrain.christmas_trees()
    mt = P([F['christmas_trees']['marked_tree']])[0]
    marked = min(trees, key=lambda t: (t['x'] - mt[0]) ** 2 + (t['y'] - mt[1]) ** 2)
    for t in trees:
        r = terrain.SIZES[t['size']][2]
        if t['species'] in ('scotch', 'white'):  # pines: soft round tufts
            out.append(f'<circle class="xm-{t["species"]}" cx="{t["x"]:.1f}" cy="{-t["y"]:.1f}" r="{r:.2f}"/>')
        else:  # fir and spruce: pointed stars
            out.append(conifer((t['x'], t['y']), r * 1.15, f'xm-{t["species"]}'))
    out.append(f'<circle class="ring" cx="{marked["x"]:.1f}" cy="{-marked["y"]:.1f}" r="2.2"/>')
    for p in P(F['christmas_corner_trees']['pts']):
        out.append(conifer(p, 2.4, 'conifer'))
    out.append('</g>')

    # Lanes and trails
    sl = P(F['south_lane']['line'])
    out.append('<g id="lm-paths">')
    out.append(f'<path class="lane-band" d="{smooth_d(sl, False)}"/><path class="lane-center" d="{smooth_d(sl, False)}"/>')
    for k in ('west_trail', 'east_trail'):
        tl = P(F[k]['line'])
        out.append(f'<path class="trail" d="{smooth_d(tl, False)}"/>')
    out.append('</g>')

    # Gravel yard and driveway
    dw = P(F['driveway']['poly'])
    out.append(f'<g id="lm-5"><path class="gravel" d="{smooth_d(dw, True, 0.35)}"/></g>')

    # Orchard
    oc = P(F['orchard']['poly'])
    out.append(f'<g id="lm-7"><path class="orchard-ground" d="{smooth_d(oc)}"/>')
    for y in np.arange(oc[:, 1].min() + 3, oc[:, 1].max(), 6.2):
        for x in np.arange(oc[:, 0].min() + 2, oc[:, 0].max(), 6.2):
            q = np.array([x + rng.normal(0, 0.7), y + rng.normal(0, 0.7)])
            if inside(q, oc):
                out.append(f'<circle class="apple" cx="{q[0]:.1f}" cy="{-q[1]:.1f}" r="2.3"/>')
                for _ in range(3):
                    a, r = rng.uniform(0, 6.28), rng.uniform(0.4, 1.6)
                    out.append(f'<circle class="apple-fruit" cx="{q[0] + r * math.cos(a):.2f}" '
                               f'cy="{-(q[1] + r * math.sin(a)):.2f}" r=".32"/>')
    out.append('</g>')

    # Grape vines: 4 trellis rows with posts
    out.append('<g id="lm-8">')
    for row in F['grape_vines']['rows']:
        r = P(row)
        out.append(f'<path class="trellis" d="{poly_d(r, False)}"/>')
        for p in along(r, 3.0):
            out.append(f'<rect class="post" x="{p[0] - .3:.2f}" y="{-p[1] - .3:.2f}" width=".6" height=".6"/>')
    out.append('</g>')

    # Scenery trees
    bt = P([F['big_tree']['centre']])[0]
    out.append(f'<g id="lm-bigtree"><circle class="shade-tree" cx="{bt[0]:.1f}" cy="{-bt[1]:.1f}" r="6.5"/>'
               f'<circle class="shade-tree-in" cx="{bt[0] - 1:.1f}" cy="{-bt[1] - 1:.1f}" r="3.8"/></g>')
    out.append('<g id="lm-conifers">')
    for p in P(F['nw_conifers']['pts']):
        out.append(conifer(p, 3.0))
    out.append('</g><g id="lm-treerow">')
    for p in along(P(F['ne_tree_row']['line']), 6.5)[1:-1]:
        out.append(conifer(p + rng.normal(0, 0.4, 2), 2.7))
    out.append('</g>')
    for p in P(F['orchard_edge_tree']['pts']):
        out.append(conifer(p, 2.2))

    # Gravel hill (4): ramps + loop island
    gh = F['gravel_hill']
    out.append('<g id="lm-4">')
    bcen = np.array([66.2, 131.4])
    u = np.array([math.cos(math.radians(GRID)), math.sin(math.radians(GRID))])
    v = np.array([-u[1], u[0]])  # points away from the barn's yard-side (west) wall
    # Earth ramp centred on the west wall, climbing 8 ft to the big sliding doors.
    ramp = [bcen + v * 5.75 - u * 4.6, bcen + v * 5.75 + u * 4.6, bcen + v * 16 + u * 5.4, bcen + v * 16 - u * 5.4]
    out.append(f'<path class="ramp" d="{poly_d(ramp)}"/>')
    out.append(f'<path class="ramp-edge" d="M{svgpt(ramp[0])} L{svgpt(ramp[3])} M{svgpt(ramp[1])} L{svgpt(ramp[2])}"/>')
    up = bcen + v * 13.5
    out.append(f'<path class="slope" d="M{svgpt(up)} L{svgpt(bcen + v * 8)} M{svgpt(bcen + v * 9.5 + u * 1.2)} '
               f'L{svgpt(bcen + v * 8)} L{svgpt(bcen + v * 9.5 - u * 1.2)}"/>')
    isl = P(gh['island'])
    out.append(f'<path class="pad" d="{poly_d(isl)}"/>')
    pc = isl.mean(0)
    out.append(f'<text class="unknown" x="{pc[0]:.1f}" y="{-pc[1] + 1.1:.1f}">?</text>')
    out.append('</g>')

    # Buildings, snapped to the farm grid
    house_c = P([F['farmhouse']['centre']])[0]
    blds = {
        1: ('house', rect(house_c, 11, 13, GRID)),
        3: ('barn', rect((66.2, 131.4), 22.5, 11.5, GRID)),
        2: ('wood', rect((66.2, 131.4) + 14.1 * np.array([math.cos(math.radians(GRID)), math.sin(math.radians(GRID))]), 5.6, 11.5, GRID)),
        9: ('redbld', rect(P([(1027, 776)])[0], 11, 7, GRID + 15)),
        11: ('redbld', rect(P([(1182, 793)])[0], 6, 3.6, GRID + 10)),
        12: ('glass', rect(P([(1248, 835)])[0], 10, 4.5, GRID - 90 + 10)),
        17: ('play', rect(P([F['playhouse']['centre']])[0], 2.6, 2.6, GRID)),
    }
    for n, (cls, q) in blds.items():
        q = np.array(q)
        out.append(f'<g id="lm-{n}">')
        if n == 3:  # 8 ft stone foundation shows as a stone rim around the barn
            out.append(f'<path class="stone" d="{poly_d(rect((66.2, 131.4), 23.3, 12.3, GRID))}"/>')
        out.append(f'<path class="bld {cls}" d="{poly_d(q)}"/>')
        mid_a, mid_b = (q[0] + q[3]) / 2, (q[1] + q[2]) / 2
        out.append(f'<path class="ridge" d="M{svgpt(mid_a)} L{svgpt(mid_b)}"/>')
        if n == 3:
            # Upper floor: two tractor-size sliding doors at the top of the ramp, opening left and right.
            w = bcen + v * 6.25
            for s in (-1, 1):
                out.append(f'<path class="door" d="M{svgpt(w)} L{svgpt(w + u * 3.7 * s)}"/>')
                tipp = w + u * (5.6 * s)
                out.append(f'<path class="door-arrow" d="M{svgpt(w + u * 4.2 * s)} L{svgpt(tipp)} '
                           f'M{svgpt(tipp - u * 0.8 * s + v * 0.6)} L{svgpt(tipp)} L{svgpt(tipp - u * 0.8 * s - v * 0.6)}"/>')
            # Ground floor, south end: small door and a big sliding door with a basketball hoop (no net).
            se = bcen - u * 12.05
            out.append(f'<path class="door" d="M{svgpt(se + v * 3.6)} L{svgpt(se - v * 0.4)}"/>')
            out.append(f'<path class="door small" d="M{svgpt(se - v * 2.4)} L{svgpt(se - v * 3.5)}"/>')
            hoop = se - u * 0.9 + v * 1.6
            out.append(f'<circle class="hoop" cx="{hoop[0]:.1f}" cy="{-hoop[1]:.1f}" r=".45"/>')
        out.append('</g>')
    # Corn crib: round wire mesh with a cone cap
    bc = P([F['grain_bin']['centre']])[0]
    out.append(f'<g id="lm-10"><circle class="crib" cx="{bc[0]:.1f}" cy="{-bc[1]:.1f}" r="2.2"/>'
               f'<circle class="crib-cap" cx="{bc[0]:.1f}" cy="{-bc[1]:.1f}" r=".7"/></g>')
    # Windmill
    wm = P([F['windmill']['centre']])[0]
    tk = wm + np.array([-1.8, -2.6])
    out.append(f'<g id="lm-6"><circle class="rotor" cx="{wm[0]:.1f}" cy="{-wm[1]:.1f}" r="2.6"/>'
               f'<path class="tower" d="{poly_d(rect(wm, 2.6, 2.6, GRID))}"/>'
               f'<path class="tower-x" d="{poly_d(rect(wm, 2.6, 2.6, GRID))} M{svgpt(rect(wm, 2.6, 2.6, GRID)[0])} L{svgpt(rect(wm, 2.6, 2.6, GRID)[2])} M{svgpt(rect(wm, 2.6, 2.6, GRID)[1])} L{svgpt(rect(wm, 2.6, 2.6, GRID)[3])}"/>'
               f'<circle class="tank" cx="{tk[0]:.1f}" cy="{-tk[1]:.1f}" r=".9"/></g>')
    # Wood burner
    wb = P([F['wood_burner']['centre']])[0]
    out.append(f'<g id="lm-15"><rect class="rust" x="{wb[0] - 1.1:.1f}" y="{-wb[1] - .45:.1f}" width="2.2" height=".9" rx=".45"/>'
               f'<circle class="stack" cx="{wb[0] + 0.7:.1f}" cy="{-wb[1]:.1f}" r=".3"/></g>')
    # Clothes lines: two T-posts, four lines
    e0, e1 = P(F['clothes_lines']['ends'])
    d = (e1 - e0) / np.linalg.norm(e1 - e0)
    n_ = np.array([-d[1], d[0]])
    out.append('<g id="lm-16">')
    for e in (e0, e1):
        out.append(f'<path class="tpost" d="M{svgpt(e - n_ * 1.2)} L{svgpt(e + n_ * 1.2)}"/>')
    for o in (-0.9, -0.3, 0.3, 0.9):
        out.append(f'<path class="line" d="M{svgpt(e0 + n_ * o)} L{svgpt(e1 + n_ * o)}"/>')
    out.append('</g>')
    out.append('</g>')  # end clip

    # Downhill arrows and spot heights (relative to the barnyard)
    out.append('<g id="lm-slopes">')

    def downhill(p, q):
        p, q = np.asarray(p, float), np.asarray(q, float)
        d = (q - p) / np.linalg.norm(q - p)
        nn = np.array([-d[1], d[0]])
        return (f'<path class="slope" d="M{svgpt(p)} L{svgpt(q)} M{svgpt(q - d * 2 + nn * 1.3)} '
                f'L{svgpt(q)} L{svgpt(q - d * 2 - nn * 1.3)}"/>')

    for x in (20, 88):
        out.append(downhill((x, g.y_top - 6), (x, g.y_low + 22)))
    wmid = g.A + (g.H - g.A) * 0.45
    out.append(downhill(wmid - g.n * 3, wmid + g.n * 17))
    out.append(downhill(g.A + (g.H - g.A) * 0.15 - g.n * 2, g.A + (g.H - g.A) * 0.15 + g.n * 12))
    out.append(f'<path class="slope-line" d="M{svgpt(g.A)} L{svgpt(g.H)}"/>')
    out.append(f'<path class="slope-line" d="M{svgpt((bd[:, 0].min(), g.y_top))} L{svgpt((bd[:, 0].max(), g.y_top))}"/>')

    def spot(p, text, anchor='middle'):
        return f'<text class="spot" text-anchor="{anchor}" x="{p[0]:.1f}" y="{-p[1]:.1f}">{text}</text>'

    out.append(spot((88, g.y_top + 2.2), 'slope starts · 0 ft'))
    out.append(spot((89, 17), 'lowest · ≈ −13 ft?'))
    west_pt = bd[np.argmin(bd[:, 0])]
    out.append(spot(west_pt + (9, 1), '≈ −10 ft?', 'start'))
    out.append(spot((50, 117), 'barnyard · 0 ft'))
    out.append('</g>')

    # Property line on top
    out.append(f'<path class="propline" d="{poly_d(bd)}"/>')

    # Badges (placed beside each landmark)
    spots = {
        1: house_c + (-1, 9.5), 2: (77, 145.5), 3: (66.2, 131.4) - (u * 5), 4: bcen + v * 19.5, 5: (34, 146),
        6: wm + (-5.5, 1.5), 7: (14, 117), 8: P([(912, 770)])[0] + (-3, -3.5), 9: P([(1027, 776)])[0] + (7.5, -1),
        10: bc + (5.2, 1.5), 11: P([(1182, 793)])[0] + (5.2, 1.0), 12: P([(1248, 835)])[0] + (2, -6),
        13: (49, 50), 14: (39, 6), 15: wb + (0, 4.6), 16: (e0 + e1) / 2 + n_ * 4.2, 17: P([F['playhouse']['centre']])[0] + (4.5, -1.5),
    }
    for n, p in spots.items():
        out.append(badge(n, np.asarray(p, float), f'lm-{n}'))

    # North arrow and scale bar
    ax, ay = maxx - 10, maxy - 8
    out.append(f'<g class="north"><path d="M{ax:.1f},{-ay + 7:.1f} L{ax:.1f},{-ay - 5:.1f} M{ax - 2.4:.1f},{-ay - 2:.1f} L{ax:.1f},{-ay - 5.5:.1f} L{ax + 2.4:.1f},{-ay - 2:.1f}"/>'
               f'<text x="{ax:.1f}" y="{-ay + 11.5:.1f}">N</text></g>')
    sx, sy = maxx - 52, miny + 7
    out.append(f'<g class="scale"><rect x="{sx:.1f}" y="{-sy - 1:.1f}" width="20" height="1.4"/><rect class="alt" x="{sx + 20:.1f}" y="{-sy - 1:.1f}" width="20" height="1.4"/>'
               f'<text x="{sx:.1f}" y="{-sy - 2.6:.1f}">0</text><text x="{sx + 20:.1f}" y="{-sy - 2.6:.1f}">20</text><text x="{sx + 40:.1f}" y="{-sy - 2.6:.1f}">40 m</text>'
               f'<text x="{sx:.1f}" y="{-sy + 4.6:.1f}" class="ft">≈ 130 ft</text></g>')
    out.append('</svg>')
    return '\n'.join(out)


if __name__ == '__main__':
    import sys
    open(sys.argv[1] if len(sys.argv) > 1 else 'out/map.svg', 'w').write(render())
