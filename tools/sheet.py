#!/usr/bin/env python3
"""Contact sheet of an .njp's patterns: sheet.py in.njp out.png [first] [count] [cols]"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import njp
from PIL import Image, ImageDraw
def render(n, i):
    p = n.patterns[i]; parts = [q for q in p['parts'] if q['img'] < len(n.images)]
    if not parts: return None
    ims = [(njp.to_rgba(n.images[q['img']], n.palettes[p['defpal']]), q['x'], q['y']) for q in parts]
    x0 = min(x for _, x, _ in ims); y0 = min(y for _, _, y in ims)
    x1 = max(x + im.width for im, x, _ in ims); y1 = max(y + im.height for im, _, y in ims)
    c = Image.new('RGBA', (x1 - x0, y1 - y0), (0, 0, 0, 0))
    for im, x, y in ims: c.alpha_composite(im, (x - x0, y - y0))
    return c
if __name__ == '__main__':
    path, out = sys.argv[1:3]; first = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    count = int(sys.argv[4]) if len(sys.argv) > 4 else 60; cols = int(sys.argv[5]) if len(sys.argv) > 5 else 10
    n = njp.parse(open(path, 'rb').read())
    tiles = [(i, render(n, i)) for i in range(first, min(first + count, len(n.patterns)))]
    cw = min(300, max([t.width for _, t in tiles if t] + [16])) + 4; ch = min(200, max([t.height for _, t in tiles if t] + [16])) + 14
    rows = (len(tiles) + cols - 1) // cols
    S = Image.new('RGBA', (cols * cw, rows * ch), (60, 60, 90, 255)); d = ImageDraw.Draw(S)
    for k, (i, t) in enumerate(tiles):
        x, y = (k % cols) * cw, (k // cols) * ch
        d.text((x + 1, y), str(i), fill=(255, 255, 0, 255))
        if t: S.alpha_composite(t.crop((0, 0, cw - 4, ch - 14)), (x + 2, y + 12))
    S.save(out); print(S.size, len(n.patterns))
