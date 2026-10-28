"""Assemble the blueprint page from the template, the map SVG and the landmark notes."""
import html
import math
import sys
import numpy as np
import blueprint as b
import render_svg
import terrain

OUT = sys.argv[1] if len(sys.argv) > 1 else 'out/farm-blueprint.html'

LEGEND = [
    ('lm-1', '1', 'Farmhouse', 'Same spot as today\'s house'),
    ('lm-2', '2', 'Wooden garage', 'Northeast end of the barn'),
    ('lm-3', '3', 'Large red barn', '≈ 22 × 11 m on an 8 ft stone foundation'),
    ('lm-4', '4', 'Earth ramp up to barn', 'Centred on the barn\'s west wall'),
    ('lm-5', '5', 'Gravel driveway', 'All gravel, graded for parking'),
    ('lm-6', '6', 'Tall aluminum windmill', 'West corner of the house'),
    ('lm-7', '7', 'Apple tree orchard', 'The west wing'),
    ('lm-8', '8', 'Grape vines', 'Four trellis rows'),
    ('lm-9', '9', 'Red wooden garage', 'Bottom of the yard'),
    ('lm-10', '10', 'Wire corn crib', 'Below the barn'),
    ('lm-11', '11', 'Red wooden shed', 'Beside the corn crib'),
    ('lm-12', '12', 'Clear plexiglass greenhouse', 'East of the shed'),
    ('lm-13', '13', 'Christmas tree rows', 'Scotch pine, Douglas fir, white pine, blue spruce, west to east'),
    ('lm-14', '14', 'Pumpkin patch', 'Lowest ground on the farm'),
    ('lm-15', '15', 'Rusted barrel stove', 'Near the west road corner'),
    ('lm-16', '16', 'Clothes lines', 'East of the house'),
    ('lm-17', '17', 'Kids\' playhouse', 'By the northeast trees'),
    ('lm-ground', '·', 'Contour lines', 'Each line is 2 ft lower'),
    ('lm-slopes', '·', 'Slopes', 'Arrows point downhill'),
    ('lm-bigtree', '·', 'Big shade tree', 'Unnumbered in your sketch'),
    ('lm-conifers', '·', 'Evergreens by the road', 'Unnumbered'),
    ('lm-treerow', '·', 'Northeast tree row', '"TREES" in your sketch'),
    ('lm-paths', '·', 'Dashed paths and south lane', 'Unnumbered'),
]

# (number, name, in your sketch, how I'd build it, [confirmed], [(qid, question)])
CARDS = [
    ('1', 'Farmhouse',
     'A gable-roofed house with its door on the southwest side, facing the end of the driveway. Windmill at its west corner, evergreens toward the road, clothes lines to the east.',
     'On today\'s house site, about 11 × 13 m, square to the barn.',
     ['Stood in the same place as today\'s house.'],
     [('1b', 'One storey or two? Siding colour and roof colour?'),
      ('1c', 'Front porch? Which side was the door you actually used?'),
      ('1d', 'Chimney, attached garage, or anything else on the house?')]),
    ('2', 'Wooden garage',
     'A small square building at the northeast end of the barn, drawn as its own box touching the barn.',
     'A wing across the barn\'s northeast end, the end facing the house drive. Today that end has a separate red roof.',
     [],
     [('2a', 'Attached to the barn, or a separate building right next to it?'),
      ('2b', 'Which way did its door face: toward the house, or somewhere else?'),
      ('2c', 'Weathered bare wood, or painted?')]),
    ('3', 'Large red barn',
     'A long rectangle with its ridge line down the middle, running from the garage (2) down toward the corn crib (10).',
     'About 22 × 11 m, red walls on an 8 ft stone foundation. Side views are drawn further down.',
     ['Same barn, same place as today.',
      'Stone foundation about 8 ft high, so the second floor is reached by the earth ramp.',
      'Two very large sliding doors at the top of the ramp, opening left and right, big enough for tractors.',
      'Ground floor on the south side: a small door and a large sliding door with a basketball hoop (no net).'],
     [('3b', 'Roof shape: plain peak (gable) or the bent barn roof (gambrel)? Roof colour?'),
      ('3c', 'White trim? A hay loft door, cupola or weathervane?'),
      ('3e', 'The "south side" doors: on the short end facing the corn crib (as drawn), or on the long wall facing east?'),
      ('3f', 'The stone: rounded grey and brown fieldstones, or squared cut stone?')]),
    ('4', 'Earth ramp up to the barn',
     'Two hatched slopes on the barn\'s west side, and a loop of gravel around a small rectangle.',
     'An earth ramp about 9 m wide and 10 m long, centred on the barn\'s west wall, climbing 8 ft to the sliding doors.',
     ['An earth ramp up to the second-floor doors.',
      'Centred on the barn (it was too far north in v1).'],
     [('4a', 'What was the small rectangle you drew beside the ramp: a concrete pad, an old foundation, a trough, something parked?'),
      ('4c', 'The loop you drew around it: could you drive all the way around?'),
      ('4d', 'Was the ramp grass-covered or gravel on top? Stone walls along its sides?')]),
    ('5', 'Gravel driveway',
     'Enters from the road about halfway along, runs to the house, then opens into a big gravel area down past the barn to the red garage (9).',
     'One continuous gravel yard with no grass inside it.',
     ['All open gravel, graded into a very large area for driving and parking cars. No grass inside it.'],
     [('5b', 'Any gate, mailbox, sign or culvert at the entrance?'),
      ('5c', 'Any parked equipment that was always there (tractor, truck, trailer)?'),
      ('5d', 'Does the outline of the gravel on the map match your memory, for example reaching up to the house and around the south end of the barn?')]),
    ('6', 'Tall aluminum windmill',
     'A spoked wheel on a tall tower right at the house\'s west corner, with a solid black dot at its foot.',
     'A classic water-pumping windmill: many-bladed wheel, tail vane, galvanized lattice tower.',
     [],
     [('6a', 'How tall: above the house roof, or about twice the house?'),
      ('6b', 'What was the black dot: a well cap, a water tank, a pump, a concrete pad?'),
      ('6c', 'Did it still spin? Any writing on the tail vane?')]),
    ('7', 'Apple tree orchard',
     'About 50 apple trees filling the west wing between the big tree and the grape vines, with a wavy line along its west edge.',
     'Loose rows about 6 m apart. Its west half sits on the west slope.',
     [],
     [('7a', 'Roughly how many trees? Neat rows or scattered?'),
      ('7b', 'How big: could you climb them, or were they small?'),
      ('7c', 'The wavy line on the orchard\'s west side: hedge, brush, fence, or the edge of the mowed grass?')]),
    ('8', 'Grape vines',
     'Four straight parallel lines between the orchard and the red garage.',
     'Four trellis rows of wire between wooden posts, about 15 m long.',
     [],
     [('8a', 'Four rows? About how long?'),
      ('8b', 'Wood or metal posts? Any arbor you could walk under?')]),
    ('9', 'Red wooden garage',
     'A long building at the bottom-left of the yard with a small box at its southwest end (where the 9 is).',
     'About 11 × 7 m, red, gable roof, beside the gravel.',
     [],
     [('9a', 'Which way did its big door face?'),
      ('9b', 'Is the small box at its end a door, a lean-to, or just where you wrote the number?'),
      ('9c', 'Roof colour?')]),
    ('10', 'Wire corn crib',
     'A circle with a dot in the middle, seen from above, just below the barn.',
     'A round wire-mesh crib about 4.4 m (14 ft) across with a metal cone cap.',
     ['A round wire-mesh corn crib (option B).'],
     [('10b', 'How tall compared with the barn?'),
      ('10c', 'Full of yellow corn ears, half full, or empty?')]),
    ('11', 'Red wooden shed',
     'A small rectangle beside the crib, with a little circle at its bottom corner.',
     'About 6 × 3.5 m, red, gable roof.',
     [],
     [('11a', 'What was the circle at its corner: a barrel, a stump, a well, a door?'),
      ('11b', 'What was kept in it?')]),
    ('12', 'Clear plexiglass greenhouse',
     'A long rectangle with a double line on one side, east of the shed.',
     'About 10 × 4.5 m of clear panels on a frame.',
     [],
     [('12a', 'Peaked roof, or a curved hoop roof?'),
      ('12b', 'Wood frame or metal? Did it sit on a low wall?')]),
    ('13', 'Christmas tree rows',
     'A block of evergreens with a slanted top edge, bigger trees on all four corners and one tree drawn dark with an X through it.',
     'Neat north–south lines 8 ft apart, trees about 6.5 ft apart along each line. 29 lines, about 570 trees.',
     ['Four kinds in bands from west to east: Scotch pine, Douglas fir, white pine, blue spruce.',
      'Very neat, tidy lines running south to north.',
      'Sizes: 15% knee high or below, 50% about 6 ft, 35% 8 to 10 ft.'],
     [('13c', 'What is the tree with the X: a special tree, a dead one, one you cut? (Circled on the map.)'),
      ('13e', 'Were the sizes mixed tree by tree, or did whole lines or patches share one size?'),
      ('13f', 'Did each kind get about the same number of lines? (The map gives each about 7.)'),
      ('13g', 'Were the four corner trees bigger than the rest, as your sketch shows? What kind?')]),
    ('14', 'Pumpkin patch',
     'Two rows of P\'s across the whole south end, below a lane, running to the south property line.',
     'Rows of sprawling vines and pumpkins filling the south strip, the lowest ground on the farm.',
     ['The lowest point of the property.'],
     [('14a', 'Did it really fill the whole width of the south end?'),
      ('14b', 'Anything else grown there, like sweet corn or a garden?'),
      ('14c', 'What was just past the south line: a field, woods, a fence?')]),
    ('15', 'Old rusted barrel stove',
     'A box on short legs with a tall pipe, out near the west road corner, far from the house.',
     'A rusty barrel stove on four legs with a tall stovepipe.',
     ['A barrel or box stove on short legs with a tall stovepipe (option B).'],
     [('15b', 'Was there a woodpile or chopping block next to it?'),
      ('15c', 'Was it still used, or just old junk left in the yard?')]),
    ('16', 'Clothes lines',
     'Two posts with lines strung between them, east of the house.',
     'Two T-shaped posts about 15 m apart with four lines.',
     [],
     [('16a', 'How many lines? Metal or wood posts?')]),
    ('17', 'Kids\' small playhouse',
     'A tiny peaked house east of the clothes lines, near the northeast tree row. Something small sits on its roof.',
     'About 2.5 × 2.5 m with a door and windows.',
     [],
     [('17a', 'Colour? Door, windows, little porch?'),
      ('17b', 'What is on the roof in your drawing: a chimney, a bell, a little tower?')]),
    ('·', 'Trees, paths and blank areas',
     'Unnumbered in your sketch: a big tree beside the stove, five evergreens between the road and the house, the "TREES" row along the northeast line, dashed paths, and a lane between the Christmas trees and the pumpkins.',
     'Drawn as you sketched them. The blank areas are lawn for now.',
     [],
     [('S1', 'The big tree by the stove: what kind (oak, maple, willow)? Any rope swing or treehouse?'),
      ('S2', 'The "TREES" row along the northeast line: evergreens or leafy trees? A solid windbreak or spaced out?'),
      ('S3', 'The dashed lines: mowed paths, tractor tracks, or fences?'),
      ('S4', 'The lane between the Christmas trees and the pumpkins: a dirt two-track you drove on?'),
      ('S5', 'The blank areas east of the barn and along the east line: lawn, hay field or crops?')]),
    ('·', 'The land as a whole',
     'Your sketch shows the layout. These answers decide the ground under it.',
     'Contours on the map follow the two slopes you described. The drop sizes are my guesses.',
     ['From an east–west line at the north tip of the Christmas trees, the land falls gradually south to the pumpkin patch, the lowest point.',
      'Everything west of a line from the orchard\'s west side to the farmhouse slopes down to the west.'],
     [('T1', 'How much lower was the pumpkin patch than the barnyard: a few feet, about one storey (10 ft), or more? I guessed 13 ft.'),
      ('T2', 'How much lower was the west road corner than the orchard? I guessed 10 ft.'),
      ('T3', 'North of the house, did the ground between the house and the road also fall toward the road, or stay level?'),
      ('T4', 'Was everything east of the barn (clothes lines, playhouse, east lawn) level with the barnyard?'),
      ('T5', 'Any steep banks or ditches besides the barn ramp, for example along the road?'),
      ('G2', 'Do you know the acreage? It fixes the scale (my estimate is about 4.6 acres).'),
      ('G3', 'Was the property line back then the same as the red line today?'),
      ('G4', 'Was the road along the northwest side gravel or paved?'),
      ('G5', 'What surrounded the farm: neighbours\' houses, cornfields, woods? Was the lane outside the northeast line there?'),
      ('G6', 'Any fences, gates, a creek or a pond back then?'),
      ('G7', 'Roughly which years are you picturing, and which season?')]),
]

CHANGES = [
    ('House and barn', 'Confirmed on the same spots as today\'s house and barn.'),
    ('Barn', 'Now sits on an 8 ft stone foundation (grey rim on the map). Two tractor-size sliding doors at the top of the ramp, and a small door plus a big sliding door with a netless basketball hoop on the south end.'),
    ('Earth ramp', 'Moved to the centre of the barn\'s west wall and widened to suit the double doors. The gravel loop\'s grass island is gone.'),
    ('Gravel yard', 'Marked as solid gravel with no grass anywhere inside it.'),
    ('Corn crib', 'Drawn as a round wire-mesh crib with a cone cap.'),
    ('Wood burner', 'Drawn as a barrel stove on legs with a stovepipe.'),
    ('Christmas trees', '569 trees in 29 neat south-to-north lines. Scotch pine, Douglas fir, white pine and blue spruce from west to east, each with your mix of sizes.'),
    ('Ground', 'Contour lines every 2 ft and downhill arrows for the south slope to the pumpkin patch and the west slope beyond the orchard–house line.'),
]


def legend():
    out = []
    for tag, n, name, sub in LEGEND:
        out.append(f'<li><button type="button" data-lm="{tag}"><span class="num">{n}</span>'
                   f'<span>{html.escape(name)}</span><span class="sub">{html.escape(sub)}</span></button></li>')
    return ''.join(out)


def cards():
    out = []
    for n, name, read, build, confirmed, qs in CARDS:
        qhtml = ''.join(f'<li><span class="qid">{q}</span><span>{html.escape(t)}</span></li>' for q, t in qs)
        chtml = ''
        if confirmed:
            chtml = ('<div class="read"><span class="label">You confirmed</span><ul class="confirmed">' +
                     ''.join(f'<li>{html.escape(c)}</li>' for c in confirmed) + '</ul></div>')
        wide = ' wide' if name == 'The land as a whole' else ''
        out.append(f'<article class="card{wide}"><div class="card-head"><span class="num">{n}</span><h3>{html.escape(name)}</h3></div>'
                   f'<div class="read"><span class="label">In your sketch</span><p>{html.escape(read)}</p></div>'
                   f'<div class="read"><span class="label">How I\'m building it</span><p>{html.escape(build)}</p></div>'
                   f'{chtml}'
                   f'<div class="read"><span class="label">Still open</span><ol>{qhtml}</ol></div></article>')
    return ''.join(out)


def changes():
    return ''.join(f'<div><dt>{html.escape(k)}</dt><dd>{html.escape(v)}</dd></div>' for k, v in CHANGES)


GROUND = '<line class="el-ground" x1="4" y1="112" x2="156" y2="112"/>'


def fig(letter, caption, body, link=None, picked=False):
    ref = f' <a href="{link[1]}" target="_blank" rel="noopener">{link[0]}</a>' if link else ''
    tag = '<span class="picked">Your pick</span>' if picked else ''
    return (f'<figure><svg viewBox="0 0 160 120" aria-hidden="true">{body}{GROUND}</svg>'
            f'<figcaption>{tag}<b>{letter}</b>{caption}{ref}</figcaption></figure>')


def stones(x0, x1, y0, y1):
    """Rows of fieldstones as rounded rects."""
    out = []
    rng = np.random.default_rng(3)
    y = y0
    while y < y1 - 1:
        h = min(5.0, y1 - y)
        x = x0 + rng.uniform(0, 3)
        out.append(f'<rect class="f-stone el-thin" x="{x0}" y="{y:.1f}" width="{x - x0:.1f}" height="{h:.1f}"/>' if x > x0 + 0.5 else '')
        while x < x1:
            w = min(rng.uniform(5, 9), x1 - x)
            out.append(f'<rect class="f-stone el-thin" x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="1.4"/>')
            x += w
        y += h
    return ''.join(out)


def barn_ramp_side(roof):
    # 22.5 m barn at ~6.2 px/m: stone 97-112, walls 69-97, doors 57-103 at the top of the ramp.
    if roof == 'gable':
        roof_d = 'M6 70 L80 30 L154 70 Z'
    else:
        roof_d = 'M6 70 L20 46 L80 30 L140 46 L154 70 Z'
    return ('<rect class="f-stone" x="10" y="97" width="140" height="15"/>' + stones(10, 150, 97, 112) +
            '<rect class="f-barn el-line" x="10" y="69" width="140" height="28"/>'
            f'<path class="f-roof el-line" d="{roof_d}"/>'
            '<rect class="f-barn el-line" x="57" y="72" width="23" height="25"/><rect class="f-barn el-line" x="80" y="72" width="23" height="25"/>'
            '<path class="el-thin" d="M57 72 L80 97 M80 72 L57 97 M80 72 L103 97 M103 72 L80 97"/>'
            '<path class="el-thin" d="M30 71 H130"/>'
            '<path class="el-line f-none" d="M57 64 H38 M43 61 L38 64 L43 67 M103 64 H122 M117 61 L122 64 L117 67"/>'
            '<path class="f-gravel el-line" d="M57 97 H103 L110 112 H50 Z"/>'
            '<path class="el-thin" d="M60 101 H100 M57 105 H103 M54 109 H106" opacity=".6"/>')


def barn_south_end():
    # 11.5 m end at ~8 px/m: stone lower level 92-112 (8 ft), walls 56-92, roof to 24.
    return ('<rect class="f-stone" x="34" y="92" width="92" height="20"/>' + stones(34, 126, 92, 112) +
            '<rect class="f-barn el-line" x="34" y="56" width="92" height="36"/>'
            '<path class="f-roof el-line" d="M28 58 L80 22 L132 58 Z"/>'
            '<rect class="f-wood el-line" x="42" y="96" width="8" height="16"/>'
            '<rect class="f-barn el-line" x="68" y="90" width="34" height="22"/><path class="el-thin" d="M68 90 L102 112 M102 90 L68 112"/>'
            '<path class="el-thin" d="M60 89 H112"/>'
            '<rect class="f-house el-line" x="78" y="91" width="14" height="9"/><rect class="f-none el-thin" x="82" y="95" width="6" height="4"/>'
            '<ellipse class="f-none el-hoop" cx="85" cy="101.5" rx="4" ry="1.4"/>')


def tree(species, cx, h_ft, ppf=8.2):
    """Side-view tree, h_ft tall, standing on y=112."""
    h = h_ft * ppf
    top, base = 112 - h, 112
    w = h * 0.62
    if species == 'douglas':
        tiers = 4
        d = ''.join(f'M{cx:.1f} {top + i * h * 0.2:.1f} L{cx + w / 2 * (0.45 + 0.55 * (i + 1) / tiers):.1f} {top + (i + 1.4) * h * 0.21:.1f} '
                    f'L{cx - w / 2 * (0.45 + 0.55 * (i + 1) / tiers):.1f} {top + (i + 1.4) * h * 0.21:.1f} Z ' for i in range(tiers))
        return f'<rect class="f-wood" x="{cx - h * .03:.1f}" y="{base - h * .1:.1f}" width="{h * .06:.1f}" height="{h * .1:.1f}"/><path class="f-douglas el-thin" d="{d}"/>'
    if species == 'blue':
        pts = [(cx, top)]
        n = 7
        for i in range(1, n + 1):
            y = top + h * 0.92 * i / n
            pts.append((cx + w / 2 * 0.95 * i / n, y))
            if i < n:
                pts.append((cx + w / 2 * 0.95 * i / n * 0.72, y))
        left = [(2 * cx - x, y) for x, y in reversed(pts[1:])]
        d = 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts + left) + ' Z'
        return f'<rect class="f-wood" x="{cx - h * .03:.1f}" y="{base - h * .08:.1f}" width="{h * .06:.1f}" height="{h * .08:.1f}"/><path class="f-blue el-thin" d="{d}"/>'
    if species == 'white':  # soft, open cone of long-needled tiers
        out = f'<rect class="f-wood" x="{cx - h * .03:.1f}" y="{base - h * .1:.1f}" width="{h * .06:.1f}" height="{h * .1:.1f}"/>'
        for i in range(6):
            y = top + h * (0.1 + 0.145 * i)
            rx = w / 2 * (0.18 + 0.16 * i)
            out += f'<ellipse class="f-white el-thin" cx="{cx:.1f}" cy="{y:.1f}" rx="{rx:.1f}" ry="{h * .09:.1f}"/>'
        return out
    # scotch pine: dense yellow-green tufts sheared into a full cone
    out = f'<rect class="f-rust" x="{cx - h * .03:.1f}" y="{base - h * .1:.1f}" width="{h * .06:.1f}" height="{h * .1:.1f}"/>'
    rows = 6
    for i in range(rows):
        y = top + h * (0.08 + 0.15 * i)
        n = i + 1
        half = w / 2 * (0.12 + 0.8 * i / (rows - 1))
        for j in range(n):
            x = cx if n == 1 else cx - half + 2 * half * j / (n - 1)
            out += f'<circle class="f-scotch el-thin" cx="{x:.1f}" cy="{y:.1f}" r="{h * .085:.1f}"/>'
    return out


def species_fig(sp, name):
    body = ''.join(tree(sp, cx, hf) for cx, hf in ((24, 1.5), (68, 6), (122, 9)))
    body += ''.join(f'<text class="el-label" x="{cx}" y="119">{t}</text>' for cx, t in ((24, 'knee'), (68, '6 ft'), (122, '9 ft')))
    return body


def profile(title, a, c, marks, g, length_note):
    """Cross-section from a to c (metres), heights exaggerated 5x."""
    a, c = np.asarray(a, float), np.asarray(c, float)
    L = np.linalg.norm(c - a)
    bd = np.array(b.blueprint()['boundary'])
    ts = np.linspace(0, 1, 160)
    pts = a + (c - a) * ts[:, None]
    hs = np.array([g.h(x, y) for x, y in pts])
    W, top, zero_y, k = 600.0, 20.0, 46.0, 5 * 5.5  # px per metre horizontally ~ W/L; vertical 5x
    sx = (W - 40) / L
    vy = sx * 5
    path = ' L'.join(f'{20 + t * L * sx:.1f} {zero_y - hh * vy:.1f}' for t, hh in zip(ts, hs))
    base = 130
    svg = [f'<svg viewBox="0 0 600 140" aria-hidden="true" class="profile">',
           f'<path class="f-lawn el-line" d="M20 {base} L{path} L{W - 20:.1f} {base} Z"/>',
           f'<line class="el-zero" x1="20" y1="{zero_y}" x2="{W - 20}" y2="{zero_y}"/>',
           f'<text class="el-label start" x="22" y="{zero_y - 4}">barnyard level</text>']
    for name, p in marks:
        p = np.asarray(p, float)
        t = float(np.clip((p - a) @ (c - a) / (L * L), 0, 1))
        x = 20 + t * L * sx
        hh = g.h(*(a + (c - a) * t))
        y = zero_y - hh * vy
        svg.append(f'<line class="el-tick" x1="{x:.1f}" y1="{y - 2:.1f}" x2="{x:.1f}" y2="{y - 14:.1f}"/>')
        anchor = ' start' if x < 90 else (' end' if x > W - 90 else '')
        svg.append(f'<text class="el-label{anchor}" x="{x - 3 if anchor == " end" else x:.1f}" y="{y - 17:.1f}">{html.escape(name)}</text>')
    low = hs.min()
    svg.append(f'<text class="el-label end" x="{W - 22}" y="{base - 6}">{length_note} · lowest ≈ {low / terrain.FT:.0f} ft · heights ×5</text>')
    svg.append('</svg>')
    return f'<figure class="wide-fig"><figcaption><b>{title}</b></figcaption>{"".join(svg)}</figure>'


def profiles():
    g = terrain.Ground()
    F = b.F
    P = lambda q: np.array(b.sk(q))
    bd = np.array(b.blueprint()['boundary'])
    x_ns = 52.0
    ys = [y for y in np.arange(0, 215, 0.5) if render_svg.inside((x_ns, y), bd)]
    ns = profile('North to south, through the yard, the Christmas trees and the pumpkin patch',
                 (x_ns, max(ys)), (x_ns, min(ys)),
                 [('house side', (x_ns, 160)), ('gravel yard', (x_ns, 138)), ('Christmas trees begin', (x_ns, g.y_top)),
                  ('pumpkin patch', (x_ns, 8))], g, f'{max(ys) - min(ys):.0f} m long')
    west = bd[np.argmin(bd[:, 0])]
    barn = np.array([66.2, 131.4])
    we = profile('West to east, from the road corner to the barn',
                 west + (1, 0), barn,
                 [('road corner', west + (3, 0)), ('stove', P([F['wood_burner']['centre']])[0]),
                  ('big tree', P([F['big_tree']['centre']])[0]), ('orchard', P([(900, 560)])[0]),
                  ('gravel yard', P([(1050, 560)])[0]), ('barn', barn)], g, f'{np.linalg.norm(barn - west):.0f} m long')
    return ns + we


def options():
    mesh = ''.join(f'<line class="el-thin" x1="{x}" y1="46" x2="{x}" y2="112" opacity=".6"/>' for x in range(56, 106, 6)) + \
           ''.join(f'<line class="el-thin" x1="52" y1="{y}" x2="108" y2="{y}" opacity=".6"/>' for y in range(50, 112, 6))
    crib = ('<rect class="f-corn" x="52" y="46" width="56" height="66"/>' + mesh +
            '<rect class="f-none el-line" x="52" y="46" width="56" height="66"/><path class="f-steel el-line" d="M48 46 L80 24 L112 46 Z"/>')
    stove = ('<path class="el-line" d="M54 112 L58 92 M106 112 L102 92 M64 112 L66 94 M96 112 L94 94"/>'
             '<rect class="f-rust el-line" x="48" y="62" width="64" height="32" rx="14"/><circle class="f-roof el-line" cx="60" cy="78" r="7"/>'
             '<rect class="f-rust el-line" x="98" y="24" width="6" height="38"/>')
    windmill = ('<path class="el-line f-none" d="M66 112 L76 30 M94 112 L84 30 M68 96 H92 M70 78 H90 M72 60 H88 M74 44 H86 M66 112 L90 78 M94 112 L70 78 M68 96 L88 60 M92 96 L72 60"/>'
                '<circle class="f-steel el-line" cx="80" cy="22" r="17"/>' +
                ''.join(f'<line class="el-thin" x1="80" y1="22" x2="{80 + 17 * math.cos(a * 0.3927):.1f}" y2="{22 + 17 * math.sin(a * 0.3927):.1f}"/>' for a in range(16)) +
                '<path class="f-steel el-line" d="M88 22 H128 L136 12 V32 L128 26 H88"/><circle class="f-roof" cx="80" cy="22" r="3"/>'
                '<circle class="f-roof el-line" cx="46" cy="106" r="6"/>')
    sets = [
        ('3 · The barn, as I now picture it', [
            fig('A', 'Ramp side with a gable roof: two tractor-size doors sliding left and right at the top of the earth ramp, on the 8 ft stone foundation.', barn_ramp_side('gable')),
            fig('B', 'Ramp side with a gambrel roof. Which roof is right (3b)?', barn_ramp_side('gambrel'), ('Gambrel roofs', 'https://en.wikipedia.org/wiki/Gambrel')),
            fig('S', 'South end: ground floor in the stone, with the small door and the big sliding door with its netless hoop.', barn_south_end(), ('Bank barns', 'https://en.wikipedia.org/wiki/Bank_barn')),
        ]),
        ('13 · The four kinds, west to east', [
            fig('1', 'Scotch pine: dense yellow-green tufts sheared into a full cone, orange-brown bark. Westernmost lines.', species_fig('scotch', 'Scotch pine')),
            fig('2', 'Douglas fir: soft, dense dark-green cone.', species_fig('douglas', 'Douglas fir')),
            fig('3', 'White pine: softer, more open blue-green tiers of long needles.', species_fig('white', 'White pine')),
            fig('4', 'Blue spruce: stiff, sharp silver-blue cone. Easternmost lines.', species_fig('blue', 'Blue spruce')),
        ]),
        ('Your picks', [
            fig('10', 'Wire-mesh corn crib with a cone cap.', crib, ('Corn crib photos', 'https://en.wikipedia.org/wiki/Corn_crib'), picked=True),
            fig('15', 'Rusty barrel stove on short legs with a tall stovepipe.', stove, ('Barrel stove', 'https://en.wikipedia.org/wiki/Barrel_stove'), picked=True),
            fig('6', 'Windmill as I picture it: many-bladed wheel, tail vane, lattice tower, the black dot at its foot (6a–6c still open).', windmill, ('Water-pumping windmills', 'https://en.wikipedia.org/wiki/Windpump')),
        ]),
    ]
    return ''.join(f'<div class="optset"><h3>{t}</h3><div class="optrow">{"".join(figs)}</div></div>' for t, figs in sets)


page = open('page_template.html').read()
for k, v in {'{{MAP}}': render_svg.render(), '{{LEGEND}}': legend(), '{{CARDS}}': cards(), '{{OPTIONS}}': options(),
             '{{CHANGES}}': changes(), '{{PROFILES}}': profiles()}.items():
    page = page.replace(k, v)
open(OUT, 'w').write(page)
print('wrote', OUT, len(page))
