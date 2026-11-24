#!/usr/bin/env python3
"""Convert an .njp (and optional .caf) into web-friendly files.

  convert.py njp <in.njp> <outdir> [name]   -> name.json + name_<n>.png  (index atlases)
  convert.py caf <in.caf> <out.json>

Atlas PNGs are 'LA': L = palette index (0..255), A = 255 where index != 0. The renderer applies
palettes at load time (palettes are in the json), so palette swaps / tinting stay possible.
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import njp, caf
from PIL import Image

ATLAS_W, ATLAS_H = 2048, 2048

def pack(n):
    order = sorted(range(len(n.images)), key=lambda i: (-n.images[i]['h'], -n.images[i]['w']))
    places = {}          # image index -> (sheet, x, y)
    sheet = 0; x = y = shelf = 0
    for i in order:
        w, h = n.images[i]['w'], n.images[i]['h']
        if w == 0 or h == 0: places[i] = (0, 0, 0); continue
        if x + w > ATLAS_W: x = 0; y += shelf; shelf = 0
        if y + h > ATLAS_H: sheet += 1; x = y = shelf = 0
        places[i] = (sheet, x, y); x += w + 1; shelf = max(shelf, h + 1)
    return places, sheet + 1

def convert_njp(path, outdir, name=None):
    name = name or os.path.splitext(os.path.basename(path))[0]
    n = njp.parse(open(path, 'rb').read())
    assert n.end == n.size, 'parse mismatch'
    places, nsheets = pack(n)
    sheets = [Image.new('LA', (ATLAS_W, ATLAS_H), (0, 0)) for _ in range(nsheets)]
    for i, im in enumerate(n.images):
        if im['w'] == 0 or im['h'] == 0: continue
        s, x, y = places[i]
        rows = njp.indices(im)
        tile = Image.new('LA', (im['w'], im['h']), (0, 0)); px = tile.load()
        for yy, row in enumerate(rows):
            for xx, v in enumerate(row):
                if v: px[xx, yy] = (v, 255)
        sheets[s].paste(tile, (x, y))
    os.makedirs(outdir, exist_ok=True)
    used = [i for i in range(nsheets)]
    # crop sheets to used height
    for s, sh in enumerate(sheets):
        maxy = max([places[i][2] + n.images[i]['h'] for i in places if places[i][0] == s] or [1])
        sh.crop((0, 0, ATLAS_W, maxy)).save(os.path.join(outdir, f'{name}_{s}.png'), optimize=True)
    meta = dict(
        magic=n.magic, sheets=nsheets,
        images=[[places[i][0], places[i][1], places[i][2], im['w'], im['h']] for i, im in enumerate(n.images)],
        # pattern: [defaultPalette, [[imageIndex, x, y, scaleX/1000, scaleY/1000], ...]]
        patterns=[[p['defpal'], [[q['img'], q['x'], q['y'], q['c'], q['d']] for q in p['parts']]] for p in n.patterns],
        palettes=[''.join('%02x%02x%02x' % c for c in pal[:256]) for pal in n.palettes],
    )
    json.dump(meta, open(os.path.join(outdir, name + '.json'), 'w'), separators=(',', ':'))
    return meta

def convert_caf(path, out):
    r = caf.parse(open(path, 'rb').read())
    # anims[a] = {attr, dirs: [ {frames: n, layers: [ [ [dur, pattern, flags] ...] ] } x9 ]}
    anims = []
    for a in r['anims']:
        dirs = []
        for d in a['dirs']:
            dirs.append(dict(frames=d['val'], layers=[[[f[1], f[2], f[3]] for f in s] for s in d['seqs']]))
        anims.append(dict(attr=a['attr'], dirs=dirs))
    json.dump(dict(version=r['ver'], anims=anims), open(out, 'w'), separators=(',', ':'))

if __name__ == '__main__':
    if sys.argv[1] == 'njp': convert_njp(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None)
    elif sys.argv[1] == 'caf': convert_caf(sys.argv[2], sys.argv[3])
