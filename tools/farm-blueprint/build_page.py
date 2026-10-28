"""Assemble the blueprint page from the template, the map SVG and the landmark notes."""
import html
import math
import sys
import numpy as np
import blueprint as b
import render_svg
import terrain

OUT = sys.argv[1] if len(sys.argv) > 1 else 'out/farm-blueprint.html'

from notes import CARDS, CHANGES, LEGEND


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
                   + (f'<div class="read"><span class="label">Still open</span><ol>{qhtml}</ol></div>' if qs
                      else '<p class="settled">Nothing open. This landmark is settled.</p>')
                   + '</article>')
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


def barn_ramp_side():
    """West (ramp) side: black roof slope with the painted tree, white trim, paved ramp, well and sandbox."""
    star = render_svg.conifer((80, -36.5), 3.2, 'f-house').replace('class="f-house"', 'class="f-house el-thin"')
    return ('<rect class="f-stone" x="10" y="97" width="140" height="15"/>' + stones(10, 150, 97, 112) +
            '<path class="f-shingle el-line" d="M4 70 L156 70 L148 34 L12 34 Z"/>'
            '<path class="f-douglas el-thin" d="M80 38 L99 67 H61 Z"/><rect class="f-wood" x="78" y="66" width="4" height="3"/>' + star +
            '<rect class="f-barn el-line" x="10" y="70" width="140" height="27"/>'
            '<path class="el-trim" d="M11 71 V96 M149 71 V96 M10 70.5 H150"/>'
            '<rect class="f-barn el-trim" x="57" y="73" width="23" height="24"/><rect class="f-barn el-trim" x="80" y="73" width="23" height="24"/>'
            '<path class="el-trim thin" d="M57 73 L80 97 M80 73 L57 97 M80 73 L103 97 M103 73 L80 97"/>'
            '<path class="el-line f-none" d="M54 80 H40 M44 77 L40 80 L44 83 M106 80 H120 M116 77 L120 80 L116 83"/>'
            '<path class="f-asphalt el-line" d="M57 97 H103 L110 112 H50 Z"/>'
            '<ellipse class="f-stone el-line" cx="28" cy="109" rx="8" ry="3.5"/><ellipse class="f-roof" cx="28" cy="108.5" rx="4.5" ry="1.6"/>'
            '<rect class="f-wood el-line" x="122" y="106" width="16" height="6"/><rect class="f-cover el-thin" x="121" y="104.5" width="18" height="2"/>'
            '<text class="el-label" x="28" y="119">well</text><text class="el-label" x="130" y="119">sandbox</text>')


def barn_south_end():
    """South gable end: fieldstone lower level with the giant sliding door, walk-through door and hoop."""
    return ('<rect class="f-stone" x="34" y="92" width="92" height="20"/>' + stones(34, 126, 92, 112) +
            '<path class="f-barn el-line" d="M34 92 V56 L80 24 L126 56 V92 Z"/>'
            '<path class="el-trim" d="M35 91 V57 M125 91 V57 M36 56.5 L80 25.5 L124 56.5"/>'
            '<path class="el-roofedge" d="M26 61.5 L80 20 L134 61.5"/>'
            '<path class="el-thin" d="M50 91.5 H116"/>'
            '<rect class="f-barn el-trim" x="58" y="93" width="46" height="19"/>'
            '<path class="el-trim thin" d="M58 93 L104 112 M104 93 L58 112"/>'
            '<rect class="f-barn el-trim" x="64" y="99" width="8" height="13"/>'
            '<rect class="f-house el-line" x="84" y="93.5" width="13" height="7"/><rect class="f-none el-thin" x="88" y="96.5" width="5" height="3"/>'
            '<ellipse class="f-none el-hoop" cx="90.5" cy="101.3" rx="3.4" ry="1.1"/>')


def farmhouse():
    """Road-side view from the photo at ~3 px per ft: front gable on the left, wing with porch on the right."""
    siding = ''.join(f'<path class="el-siding" d="M{x0} {y} H{x1}"/>' for y in range(56, 104, 3)
                     for x0, x1 in ((21, 73), (75, 118)))
    return ('<path class="f-shingle el-line" d="M70 52 L124 52 L119 31 L74 31 Z"/>'
            '<rect class="f-chimney el-thin" x="86" y="19" width="7" height="13"/>'
            '<rect class="f-stone" x="20" y="104" width="99" height="8"/>' + stones(20, 119, 104, 112) +
            '<rect class="f-siding" x="74" y="52" width="45" height="52"/>'
            '<path class="f-siding" d="M20 104 V54 L47 22 L74 54 V104 Z"/>' + siding +
            '<path class="el-roofedge" d="M14 59 L47 19 L80 59"/>'
            '<path class="el-blue" d="M21 55 V104 M73 56 V104 M118 53 V104 M74 52.5 H120"/>'
            '<path class="el-blue f-siding" d="M44 36 l3 -3 l3 3 l0 3 l-3 3 l-3 -3 z"/>'
            '<rect class="el-blue f-glass" x="37" y="60" width="9" height="15"/><rect class="el-blue f-glass" x="48" y="60" width="9" height="15"/>'
            '<rect class="el-blue f-glass" x="32" y="82" width="9" height="16"/><rect class="el-blue f-glass" x="42" y="82" width="9" height="16"/><rect class="el-blue f-glass" x="52" y="82" width="9" height="16"/>'
            '<rect class="el-blue f-glass" x="94" y="58" width="9" height="13"/>'
            '<path class="f-shingle el-thin" d="M73 74 L131 74 L133 79 L73 79 Z"/>'
            '<rect class="el-blue f-glass" x="82" y="83" width="7" height="17"/><rect class="el-blue f-glass" x="98" y="83" width="8" height="15"/>'
            '<path class="el-trim thin" d="M78 79 V104 M129 79 V104 M75 92 H131 M75 104 H131"/>' +
            ''.join(f'<path class="el-trim thin" d="M{x} 92 V104"/>' for x in range(81, 129, 4)) +
            '<rect class="f-siding el-thin" x="75" y="104" width="56" height="7"/>' +
            ''.join(f'<path class="el-thin" d="M{x} 104 l6 7 M{x + 6} 104 l-6 7"/>' for x in range(75, 129, 6)))


def orchard_tree(kind):
    """Side view at ~7 px per ft: apple ~13 ft with branches trained so fruit hangs ~5 ft up."""
    out = '<rect class="f-wood" x="77" y="62" width="6" height="50"/>'
    five_ft = 112 - 5 * 7
    if kind == 'apple':
        out += ''.join(f'<path class="el-thin f-none" d="M80 {y0} Q{80 + dx} {y0 - 8} {80 + dx * 1.5} {five_ft}"/>'
                       for y0, dx in ((52, -26), (52, 26), (44, -18), (44, 18), (40, -34), (40, 34)))
        out += ''.join(f'<circle class="f-orchard el-thin" cx="{x}" cy="{y}" r="{r}"/>'
                       for x, y, r in ((80, 34, 15), (62, 44, 13), (98, 44, 13), (47, 56, 10), (113, 56, 10), (80, 50, 12)))
        out += ''.join(f'<circle class="f-apple" cx="{80 + dx * 1.5}" cy="{five_ft + 2}" r="2.6"/>' for dx in (-34, -26, -18, 18, 26, 34))
        out += f'<path class="el-zero" d="M8 {five_ft} H30"/><text class="el-label start" x="8" y="{five_ft - 3}">5 ft</text>'
    elif kind == 'pear':
        out += ''.join(f'<ellipse class="f-orchard el-thin" cx="{x}" cy="{y}" rx="{rx}" ry="{ry}"/>'
                       for x, y, rx, ry in ((80, 40, 16, 26), (70, 52, 11, 15), (90, 52, 11, 15)))
        out += ''.join(f'<path class="f-pear el-thin" d="M{x} {y} q2.4 0 2.4 3 q0 2.8 -2.4 2.8 q-2.4 0 -2.4 -2.8 q0 -3 2.4 -3 z"/>'
                       for x, y in ((70, 52), (90, 48), (80, 62), (74, 36), (88, 32)))
    else:
        out += ''.join(f'<circle class="f-orchard el-thin" cx="{x}" cy="{y}" r="{r}"/>'
                       for x, y, r in ((80, 46, 20), (64, 56, 12), (96, 56, 12)))
        out += ''.join(f'<circle class="f-cherry" cx="{x}" cy="{y}" r="1.8"/><circle class="f-cherry" cx="{x + 3}" cy="{y + 1}" r="1.8"/>'
                       for x, y in ((66, 58), (88, 40), (96, 60), (76, 52), (84, 64)))
    return out


def playhouse():
    return ('<path class="f-barn el-line" d="M54 112 V78 L80 58 L106 78 V112 Z"/>'
            '<path class="el-trim" d="M55 111 V79 M105 111 V79"/>'
            '<path class="el-roofedge" d="M48 82 L80 56 L112 82"/>'
            '<rect class="f-barn el-trim" x="73" y="90" width="14" height="22"/>'
            '<rect class="f-glass el-trim" x="58" y="86" width="10" height="10"/><rect class="f-glass el-trim" x="92" y="86" width="10" height="10"/>')


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
    K = render_svg.K
    x_ns = 52.0 * K
    ys = [y for y in np.arange(0, 230, 0.5) if render_svg.inside((x_ns, y), bd)]
    ns = profile('North to south, through the yard, the Christmas trees and the pumpkin patch',
                 (x_ns, max(ys)), (x_ns, min(ys)),
                 [('house side', (x_ns, 160 * K)), ('gravel yard', (x_ns, 138 * K)), ('Christmas trees begin', (x_ns, g.y_top)),
                  ('pumpkin patch', (x_ns, 8 * K))], g, f'{max(ys) - min(ys):.0f} m long')
    west = bd[np.argmin(bd[:, 0])]
    barn = b.barn_centre()
    we = profile('West to east, from the road corner to the barn',
                 west + (1, 0), barn,
                 [('road corner', west + (3, 0)), ('stove', P([F['wood_burner']['centre']])[0]),
                  ('big tree', P([F['big_tree']['centre']])[0]), ('orchard', P([(900, 560)])[0]),
                  ('gravel yard', P([(1050, 560)])[0]), ('barn', barn)], g, f'{np.linalg.norm(barn - west):.0f} m long')
    return ns + we


def options():
    mesh = ''.join(f'<line class="el-thin" x1="{x}" y1="46" x2="{x}" y2="112" opacity=".6"/>' for x in range(56, 106, 6)) + \
           ''.join(f'<line class="el-thin" x1="52" y1="{y}" x2="108" y2="{y}" opacity=".6"/>' for y in range(50, 112, 6))
    crib = ('<rect class="f-sheet" x="52" y="46" width="56" height="66"/><rect class="f-corn" x="52" y="80" width="56" height="32"/>' + mesh +
            '<rect class="f-none el-line" x="52" y="46" width="56" height="66"/><path class="f-steel el-line" d="M48 46 L80 24 L112 46 Z"/>'
            '<path class="el-zero" d="M118 24 V112"/><text class="el-label start" x="121" y="70">8 ft</text>')
    stove = ('<path class="el-line" d="M54 112 L58 92 M106 112 L102 92 M64 112 L66 94 M96 112 L94 94"/>'
             '<rect class="f-rust el-line" x="48" y="62" width="64" height="32" rx="14"/><circle class="f-roof el-line" cx="60" cy="78" r="7"/>'
             '<rect class="f-rust el-line" x="98" y="24" width="6" height="38"/>'
             '<path class="el-scrap" d="M116 111 L142 107 M118 108 L140 111 M122 105 L138 109 M126 103 L134 108"/>')
    windmill = ('<path class="el-line f-none" d="M66 112 L76 30 M94 112 L84 30 M68 96 H92 M70 78 H90 M72 60 H88 M74 44 H86 M66 112 L90 78 M94 112 L70 78 M68 96 L88 60 M92 96 L72 60"/>'
                '<circle class="f-steel el-line" cx="80" cy="22" r="17"/>' +
                ''.join(f'<line class="el-thin" x1="80" y1="22" x2="{80 + 17 * math.cos(a * 0.3927):.1f}" y2="{22 + 17 * math.sin(a * 0.3927):.1f}"/>' for a in range(16)) +
                '<path class="f-steel el-line" d="M88 22 H128 L136 12 V32 L128 26 H88"/><circle class="f-roof" cx="80" cy="22" r="3"/>'
                '<path class="f-siding el-thin" d="M8 112 V62 L28 40 L48 62 V112 Z"/><path class="el-roofedge" d="M5 65 L28 39 L51 65"/>'
                '<text class="el-label" x="28" y="119">house</text>')
    sets = [
        ('1 · The farmhouse, from your photo', [
            fig('R', 'Road side: steep front gable with its octagonal vent on the left, wing on the right with the one-storey porch, white posts and railing, lattice skirt. White siding, slate-blue trim, dark shingles, buff brick chimney, fieldstone foundation.', farmhouse()),
        ]),
        ('3 · The barn, as I now picture it', [
            fig('W', 'West side: black shingle roof slope with the painted green Christmas tree and white star, white trim, two tractor-size doors sliding left and right at the top of the paved ramp. The old well to the north (left) and the sandbox to the south (right).', barn_ramp_side(), ('Bank barns', 'https://en.wikipedia.org/wiki/Bank_barn')),
            fig('S', 'South end: one giant sliding door in the fieldstone lower level, a walk-through door cut into it, and the netless hoop.', barn_south_end()),
        ]),
        ('7 · Orchard trees', [
            fig('A', 'Grafted apple, about 13 ft tall, branches trained so the apples hang about 5 ft up. Seven lines of these.', orchard_tree('apple')),
            fig('P', 'Pear, mixed with cherries in the two west lines.', orchard_tree('pear')),
            fig('C', 'Cherry, mixed with pears in the two west lines.', orchard_tree('cherry')),
        ]),
        ('13 · The four kinds, west to east', [
            fig('1', 'Scotch pine: dense yellow-green tufts sheared into a full cone, orange-brown bark. Westernmost lines.', species_fig('scotch', 'Scotch pine')),
            fig('2', 'Douglas fir: soft, dense dark-green cone.', species_fig('douglas', 'Douglas fir')),
            fig('3', 'White pine: softer, more open blue-green tiers of long needles.', species_fig('white', 'White pine')),
            fig('4', 'Blue spruce: stiff, sharp silver-blue cone. Easternmost lines.', species_fig('blue', 'Blue spruce')),
        ]),
        ('Smaller landmarks', [
            fig('10', 'Wire-mesh corn crib about 8 ft tall, half full of yellow ears.', crib, ('Corn crib photos', 'https://en.wikipedia.org/wiki/Corn_crib')),
            fig('15', 'Rusty barrel stove for burning garbage, with its small pile of scrap wood.', stove, ('Barrel stove', 'https://en.wikipedia.org/wiki/Barrel_stove')),
            fig('6', 'Windmill about 15 ft taller than the two-storey house. Still turning.', windmill, ('Water-pumping windmills', 'https://en.wikipedia.org/wiki/Windpump')),
            fig('17', 'Playhouse painted like the barn, red with white trim, black shingle roof.', playhouse()),
        ]),
    ]
    return ''.join(f'<div class="optset"><h3>{t}</h3><div class="optrow">{"".join(figs)}</div></div>' for t, figs in sets)


page = open('page_template.html').read()
for k, v in {'{{MAP}}': render_svg.render(), '{{LEGEND}}': legend(), '{{CARDS}}': cards(), '{{OPTIONS}}': options(),
             '{{CHANGES}}': changes(), '{{PROFILES}}': profiles()}.items():
    page = page.replace(k, v)
open(OUT, 'w').write(page)
print('wrote', OUT, len(page))
