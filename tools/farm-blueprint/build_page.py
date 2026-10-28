"""Assemble the blueprint page from the template, the map SVG and the landmark notes."""
import html
import sys
import render_svg

OUT = sys.argv[1] if len(sys.argv) > 1 else 'out/farm-blueprint.html'

LEGEND = [
    ('lm-1', '1', 'Farmhouse', 'On the site of today\'s house'),
    ('lm-2', '2', 'Wooden garage', 'Northeast end of the barn'),
    ('lm-3', '3', 'Large red barn', '≈ 22 × 11 m'),
    ('lm-4', '4', 'Gravel hill up to barn', 'Ramp and loop, west side'),
    ('lm-5', '5', 'Gravel driveway', 'Road entrance to the whole yard'),
    ('lm-6', '6', 'Tall aluminum windmill', 'West corner of the house'),
    ('lm-7', '7', 'Apple tree orchard', 'The west wing'),
    ('lm-8', '8', 'Grape vines', 'Four trellis rows'),
    ('lm-9', '9', 'Red wooden garage', 'Bottom of the yard'),
    ('lm-10', '10', 'Corn grain bin', 'Below the barn'),
    ('lm-11', '11', 'Red wooden shed', 'Beside the bin'),
    ('lm-12', '12', 'Clear plexiglass greenhouse', 'East of the shed'),
    ('lm-13', '13', 'Christmas tree rows', 'Block with paths around it'),
    ('lm-14', '14', 'Pumpkin patch', 'Full width at the south end'),
    ('lm-15', '15', 'Rusted wood burner', 'Near the west road corner'),
    ('lm-16', '16', 'Clothes lines', 'East of the house'),
    ('lm-17', '17', 'Kids\' playhouse', 'By the northeast trees'),
    ('lm-bigtree', '·', 'Big shade tree', 'Unnumbered in your sketch'),
    ('lm-conifers', '·', 'Evergreens by the road', 'Unnumbered'),
    ('lm-treerow', '·', 'Northeast tree row', '"TREES" in your sketch'),
    ('lm-paths', '·', 'Dashed paths and south lane', 'Unnumbered'),
]

# (number, name, what I read in the sketch, how I'd build it, [(qid, question)])
CARDS = [
    ('1', 'Farmhouse',
     'A gable-roofed house with its door on the southwest side, facing the end of the driveway. Windmill at its west corner, evergreens toward the road, clothes lines to the east.',
     'Placed on today\'s house site, about 11 × 13 m, square to the barn.',
     [('1a', 'Is today\'s house the same farmhouse, or at least on the same spot?'),
      ('1b', 'One storey or two? Siding colour and roof colour?'),
      ('1c', 'Front porch? Which side was the door you actually used?'),
      ('1d', 'Chimney, attached garage, or anything else on the house?')]),
    ('2', 'Wooden garage',
     'A small square building at the northeast end of the barn, drawn as its own box touching the barn.',
     'Built as a wing across the barn\'s northeast end, the end facing the house drive. Today that end has a separate red roof.',
     [('2a', 'Attached to the barn, or a separate building right next to it?'),
      ('2b', 'Which way did its door face: toward the house, or somewhere else?'),
      ('2c', 'Weathered bare wood, or painted?')]),
    ('3', 'Large red barn',
     'A long rectangle with its ridge line down the middle, long side running from the garage (2) down toward the bin (10).',
     'About 22 × 11 m on today\'s barn footprint, red walls.',
     [('3a', 'Is today\'s barn the same barn?'),
      ('3b', 'Roof shape: plain peak (gable) or the bent "hip" barn roof (gambrel)? See the options below. Roof colour?'),
      ('3c', 'White trim, big sliding doors, hay loft door, cupola or weathervane?'),
      ('3d', 'Stone or concrete lower level showing on any side?')]),
    ('4', 'Gravel hill up to barn',
     'Two hatched slopes on the barn\'s west side, and a loop of gravel going around a small rectangle. I read the hatching as a raised earth ramp up to the barn\'s upper doors. For now the map shows one ramp near the garage end.',
     'A gravel ramp climbing to the barn wall, with a loop around a grassy island holding the rectangle.',
     [('4a', 'What was the rectangle inside the loop: a concrete pad, an old foundation, a trough, something parked?'),
      ('4b', 'How tall was the hill? Could you drive up it into the barn\'s upper floor?'),
      ('4c', 'Did the loop go all the way around so you could circle it?')]),
    ('5', 'Gravel driveway',
     'Enters from the road about halfway along, runs to the house, then opens into a big gravel area reaching down past the barn to the red garage (9), with a pocket at the bottom.',
     'One continuous gravel farmyard. Today\'s drive follows the same line on its west edge.',
     [('5a', 'Was the whole area gravel, or a gravel drive around grass in the middle?'),
      ('5b', 'Any gate, mailbox, sign or culvert at the entrance?'),
      ('5c', 'Any parked equipment that was always there (tractor, truck, trailer)?')]),
    ('6', 'Tall aluminum windmill',
     'A spoked wheel on a tall tower right at the house\'s west corner, with a solid black dot at its foot.',
     'A classic water-pumping windmill: many-bladed wheel, tail vane, galvanized lattice tower.',
     [('6a', 'How tall: above the house roof, or about twice the house?'),
      ('6b', 'What was the black dot: a well cap, a water tank, a pump, a concrete pad?'),
      ('6c', 'Did it still spin? Any writing on the tail vane?')]),
    ('7', 'Apple tree orchard',
     'About 50 apple trees ("a") filling the west wing between the big tree and the grape vines, with a wavy line along its west edge.',
     'Loose rows about 6 m apart, trees about 4–5 m wide.',
     [('7a', 'Roughly how many trees? Neat rows or scattered?'),
      ('7b', 'How big: could you climb them, or were they small?'),
      ('7c', 'The wavy line on the orchard\'s west side: hedge, brush, fence, or the edge of the mowed grass?')]),
    ('8', 'Grape vines',
     'Four straight parallel lines between the orchard and the red garage.',
     'Four trellis rows of wire between wooden posts, about 15 m long.',
     [('8a', 'Four rows? About how long?'),
      ('8b', 'Wood or metal posts? Any arbor you could walk under?')]),
    ('9', 'Red wooden garage',
     'A long building at the bottom-left of the yard with a small box at its southwest end (where the 9 is).',
     'About 11 × 7 m, red, gable roof, beside the gravel.',
     [('9a', 'Which way did its big door face?'),
      ('9b', 'Is the small box at its end a door, a lean-to, or just where you wrote the number?'),
      ('9c', 'Roof colour?')]),
    ('10', 'Corn grain bin',
     'A circle with a dot in the middle, seen from above: something round with a pointed top, just below the barn.',
     'About 5 m across. Three possible versions are drawn below.',
     [('10a', 'Which option is it: A, B or C?'),
      ('10b', 'How tall compared with the barn?')]),
    ('11', 'Red wooden shed',
     'A small rectangle beside the bin, with a little circle at its bottom corner.',
     'About 6 × 3.5 m, red, gable roof.',
     [('11a', 'What was the circle at its corner: a barrel, a stump, a well, a door?'),
      ('11b', 'What was kept in it?')]),
    ('12', 'Clear plexiglass greenhouse',
     'A long rectangle with a double line on one side, east of the shed.',
     'About 10 × 4.5 m of clear panels on a frame.',
     [('12a', 'Peaked roof, or a curved hoop roof?'),
      ('12b', 'Wood frame or metal? Did it sit on a low wall?')]),
    ('13', 'Christmas tree rows',
     'A block of evergreens with a straight slanted top edge, bigger trees on all four corners and one tree drawn dark with an X through it. Dashed paths run along its west and east sides.',
     'Rows of young trees about 3 m apart. Today this whole area is dense forest, so these trees grew up.',
     [('13a', 'What kind: spruce, pine or fir? All the same size, or rows of different ages?'),
      ('13b', 'How tall back then: knee high, over your head?'),
      ('13c', 'What is the tree with the X: a special tree, a dead one, one you cut?'),
      ('13d', 'Which way did the rows run?')]),
    ('14', 'Pumpkin patch',
     'Two rows of P\'s across the whole south end, below a lane, running to the south property line.',
     'Rows of sprawling vines and pumpkins filling the south strip.',
     [('14a', 'Did it really fill the whole width of the south end?'),
      ('14b', 'Anything else grown there, like sweet corn or a garden?'),
      ('14c', 'What was just past the south line: a field, woods, a fence?')]),
    ('15', 'Old rusted wood burner',
     'A box on short legs with a tall pipe, out near the west road corner, far from the house.',
     'A rusty metal stove with its chimney pipe. Two versions are drawn below.',
     [('15a', 'Which option is it: A or B?'),
      ('15b', 'Was there a woodpile or chopping block next to it?'),
      ('15c', 'Was it still used, or just old junk left in the yard?')]),
    ('16', 'Clothes lines',
     'Two posts with lines strung between them, east of the house.',
     'Two T-shaped posts about 15 m apart with four lines.',
     [('16a', 'How many lines? Metal or wood posts?')]),
    ('17', 'Kids\' small playhouse',
     'A tiny peaked house east of the clothes lines, near the northeast tree row. Something small sits on its roof.',
     'About 2.5 × 2.5 m with a door and windows.',
     [('17a', 'Colour? Door, windows, little porch?'),
      ('17b', 'What is on the roof in your drawing: a chimney, a bell, a little tower?')]),
    ('·', 'Trees, paths and blank areas',
     'Unnumbered in your sketch: a big tree beside the wood burner, five evergreens between the road and the house, the "TREES" row along the northeast line, dashed paths, and a lane between the Christmas trees and the pumpkins.',
     'Drawn as you sketched them. The blank areas are lawn for now.',
     [('S1', 'The big tree by the wood burner: what kind (oak, maple, willow)? Any rope swing or treehouse?'),
      ('S2', 'The "TREES" row along the northeast line: evergreens or leafy trees? A solid windbreak or spaced out?'),
      ('S3', 'The dashed lines: mowed paths, tractor tracks, or fences?'),
      ('S4', 'The lane between the Christmas trees and the pumpkins: a dirt two-track you drove on?'),
      ('S5', 'The blank areas east of the barn and along the east line: lawn, hay field or crops?')]),
    ('·', 'The land as a whole',
     'Your sketch shows the layout. These answers decide the ground under it.',
     'Flat lawn and gravel everywhere until we know more.',
     [('G1', 'Was the land flat, or did it slope? Where was the highest and lowest ground?'),
      ('G2', 'Do you know the acreage? It fixes the scale (my estimate is about 4.6 acres).'),
      ('G3', 'Was the property line back then the same as the red line today?'),
      ('G4', 'Was the road along the northwest side gravel or paved?'),
      ('G5', 'What surrounded the farm: neighbours\' houses, cornfields, woods?'),
      ('G6', 'Any fences, gates, a creek or a pond back then?'),
      ('G7', 'Roughly which years are you picturing, and which season?')]),
]


def legend():
    out = []
    for tag, n, name, sub in LEGEND:
        out.append(f'<li><button type="button" data-lm="{tag}"><span class="num">{n}</span>'
                   f'<span>{html.escape(name)}</span><span class="sub">{html.escape(sub)}</span></button></li>')
    return ''.join(out)


def cards():
    out = []
    for n, name, read, build, qs in CARDS:
        qhtml = ''.join(f'<li><span class="qid">{q}</span><span>{html.escape(t)}</span></li>' for q, t in qs)
        wide = ' wide' if name == 'The land as a whole' else ''
        out.append(f'<article class="card{wide}"><div class="card-head"><span class="num">{n}</span><h3>{html.escape(name)}</h3></div>'
                   f'<div class="read"><span class="label">In your sketch</span><p>{html.escape(read)}</p></div>'
                   f'<div class="read"><span class="label">How I\'d build it</span><p>{html.escape(build)}</p></div>'
                   f'<div class="read"><span class="label">Questions</span><ol>{qhtml}</ol></div></article>')
    return ''.join(out)


GROUND = '<line class="el-ground" x1="4" y1="112" x2="156" y2="112"/>'


def fig(letter, caption, body, link=None):
    ref = f' <a href="{link[1]}" target="_blank" rel="noopener">{link[0]}</a>' if link else ''
    return (f'<figure><svg viewBox="0 0 160 120" aria-hidden="true">{body}{GROUND}</svg>'
            f'<figcaption><b>{letter}</b>{caption}{ref}</figcaption></figure>')


def corrugations(x0, x1, y0, y1, step=4):
    return ''.join(f'<line class="el-thin" x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" opacity=".45"/>' for y in range(y0, y1, step))


def options():
    bin_a = ('<rect class="f-steel el-line" x="45" y="50" width="70" height="62"/>' + corrugations(45, 115, 54, 112) +
             '<path class="f-steel el-line" d="M41 50 L80 22 L119 50 Z"/><rect class="f-roof el-line" x="74" y="16" width="12" height="7"/>'
             '<path class="el-thin" d="M108 112 V40 M113 112 V42"/>' + ''.join(f'<line class="el-thin" x1="108" y1="{y}" x2="113" y2="{y}"/>' for y in range(48, 112, 6)))
    mesh = ''.join(f'<line class="el-thin" x1="{x}" y1="46" x2="{x}" y2="112" opacity=".6"/>' for x in range(56, 106, 6)) + \
           ''.join(f'<line class="el-thin" x1="52" y1="{y}" x2="108" y2="{y}" opacity=".6"/>' for y in range(50, 112, 6))
    bin_b = ('<rect class="f-corn" x="52" y="46" width="56" height="66"/>' + mesh +
             '<rect class="f-none el-line" x="52" y="46" width="56" height="66"/><path class="f-steel el-line" d="M48 46 L80 24 L112 46 Z"/>')
    bin_c = ('<path class="f-steel el-line" d="M48 112 V66 A32 32 0 0 1 112 66 V112 Z"/>' + corrugations(48, 112, 70, 112, 5) +
             '<circle class="f-roof el-line" cx="80" cy="34" r="4"/>')
    burner_a = ('<rect class="f-rust el-line" x="38" y="58" width="78" height="54" rx="3"/><path class="f-rust el-line" d="M34 60 Q77 40 120 60"/>'
                '<rect class="f-roof el-line" x="50" y="74" width="22" height="26"/><rect class="f-rust el-line" x="98" y="16" width="8" height="38"/>'
                '<rect class="f-roof el-line" x="96" y="12" width="12" height="5"/>')
    burner_b = ('<path class="el-line" d="M54 112 L58 92 M106 112 L102 92 M64 112 L66 94 M96 112 L94 94"/>'
                '<rect class="f-rust el-line" x="48" y="62" width="64" height="32" rx="14"/><circle class="f-roof el-line" cx="60" cy="78" r="7"/>'
                '<path class="f-none el-line" d="M98 62 V24 H104 V62" /><rect class="f-rust el-line" x="98" y="24" width="6" height="38"/>')
    roof_a = ('<rect class="f-barn el-line" x="30" y="56" width="100" height="56"/><path class="f-roof el-line" d="M24 58 L80 22 L136 58 Z"/>'
              '<path class="el-thin" d="M66 112 V78 H94 V112 M66 78 L94 112 M94 78 L66 112"/><rect class="f-house el-line" x="72" y="40" width="16" height="12"/>')
    roof_b = ('<rect class="f-barn el-line" x="30" y="60" width="100" height="52"/><path class="f-roof el-line" d="M24 62 L40 34 L80 20 L120 34 L136 62 Z"/>'
              '<path class="el-thin" d="M66 112 V80 H94 V112 M66 80 L94 112 M94 80 L66 112"/><rect class="f-house el-line" x="72" y="40" width="16" height="13"/>')
    ramp = ('<rect class="f-barn el-line" x="70" y="40" width="70" height="72"/><path class="f-roof el-line" d="M64 42 L105 16 L146 42 Z"/>'
            '<path class="f-gravel el-line" d="M10 112 Q40 112 70 74 V112 Z"/><rect class="f-roof el-line" x="70" y="58" width="5" height="18"/>'
            '<path class="el-thin" d="M20 108 L68 78" stroke-dasharray="3 3"/>')
    windmill = ('<path class="el-line f-none" d="M66 112 L76 30 M94 112 L84 30 M68 96 H92 M70 78 H90 M72 60 H88 M74 44 H86 M66 112 L90 78 M94 112 L70 78 M68 96 L88 60 M92 96 L72 60"/>'
                '<circle class="f-steel el-line" cx="80" cy="22" r="17"/>' +
                ''.join(f'<line class="el-thin" x1="80" y1="22" x2="{80 + 17 * __import__("math").cos(a * 0.3927):.1f}" y2="{22 + 17 * __import__("math").sin(a * 0.3927):.1f}"/>' for a in range(16)) +
                '<path class="f-steel el-line" d="M88 22 H128 L136 12 V32 L128 26 H88"/><circle class="f-roof" cx="80" cy="22" r="3"/>'
                '<circle class="f-roof el-line" cx="46" cy="106" r="6"/>')
    sets = [
        ('10 · Corn grain bin', [
            fig('A', 'Corrugated steel grain bin with a cone roof and side ladder.', bin_a, ('Grain bin photos', 'https://en.wikipedia.org/wiki/Grain_bin')),
            fig('B', 'Round wire-mesh corn crib: you could see the yellow ears through it.', bin_b, ('Corn crib photos', 'https://en.wikipedia.org/wiki/Corn_crib')),
            fig('C', 'Round bin with a dome top, closer to a sphere.', bin_c),
        ]),
        ('15 · Rusted wood burner', [
            fig('A', 'Outdoor wood furnace: a metal shed-shaped box with a front door and chimney, piping heat to a building.', burner_a, ('Outdoor wood boiler', 'https://en.wikipedia.org/wiki/Outdoor_wood-fired_boiler')),
            fig('B', 'Barrel or box stove on short legs with a tall stovepipe, like your drawing.', burner_b, ('Barrel stove', 'https://en.wikipedia.org/wiki/Barrel_stove')),
        ]),
        ('3 · Barn roof, and 4 · the gravel hill', [
            fig('A', 'Gable barn roof: one straight slope each side.', roof_a),
            fig('B', 'Gambrel barn roof: the bent roof most big red barns have.', roof_b, ('Gambrel roofs', 'https://en.wikipedia.org/wiki/Gambrel')),
            fig('4', 'How I picture the gravel hill: an earth ramp up to doors on the barn\'s upper floor.', ramp, ('Bank barns', 'https://en.wikipedia.org/wiki/Bank_barn')),
        ]),
        ('6 · Windmill, as I picture it', [
            fig('6', 'Many-bladed wheel, tail vane and a lattice tower, with the black dot as a well cap at its foot.', windmill, ('Water-pumping windmills', 'https://en.wikipedia.org/wiki/Windpump')),
        ]),
    ]
    return ''.join(f'<div class="optset"><h3>{t}</h3><div class="optrow">{"".join(figs)}</div></div>' for t, figs in sets)


page = open('page_template.html').read()
page = page.replace('{{MAP}}', render_svg.render()).replace('{{LEGEND}}', legend()).replace('{{CARDS}}', cards()).replace('{{OPTIONS}}', options())
open(OUT, 'w').write(page)
print('wrote', OUT, len(page))
