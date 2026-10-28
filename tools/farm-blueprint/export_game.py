"""Export the locked farm blueprint as game map data (real-world metres, x east, y north).

Usage: python3 export_game.py <out.json>
The game scales everything up (see apps/game/src/farm/layout.ts), so racers are miniatures.
"""
import json
import sys
import numpy as np
import blueprint as b
import render_svg
import terrain


def clean(o):
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, np.ndarray):
        return clean(o.tolist())
    if isinstance(o, (np.floating, float)):
        return round(float(o), 2)
    if isinstance(o, np.integer):
        return int(o)
    return o


def main(out_path):
    render_svg.render()  # fills render_svg.LAYOUT with everything it places
    L = dict(render_svg.LAYOUT)
    g = terrain.Ground()
    bd = np.array(b.blueprint()['boundary'])
    ne, west = bd[1], bd[-1]
    names = dict(terrain.SPECIES)
    L['christmas_trees'] = [
        {'x': t['x'], 'y': t['y'], 'species': t['species'], 'heightFt': terrain.SIZES[t['size']][3]}
        for t in L['christmas_trees']
    ]
    data = {
        'version': 10,
        'units': 'metres (real), x east, y north, origin at the SW property corner',
        'farmGridDeg': render_svg.GRID,
        'boundary': bd,
        'terrain': {
            'southDrop': terrain.SOUTH_DROP_M,
            'westDrop': terrain.WEST_DROP_M,
            'houseRise': terrain.HOUSE_RISE_M,
            'yTop': g.y_top,
            'yLow': g.y_low,
            'yBarn': g.y_barn,
            'yHouse': g.H[1],
            'westA': g.A,
            'westN': g.n,
            'westL': g.L_w,
        },
        'speciesNames': names,
        'neighbourWoods': [ne + np.array([13.0, -24.0]), west + np.array([4.0, -52.0])],
        **L,
    }
    json.dump(clean(data), open(out_path, 'w'), separators=(',', ':'))
    print('wrote', out_path, {k: len(v) if isinstance(v, list) else '' for k, v in L.items() if isinstance(v, list)})


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'farmLayout.json')
