#!/usr/bin/env python3
"""Convert a map (Ground/.Gnd + Object/.Obl + Pattern/.Lst) to JSON plus the sprite sets it uses.

  convert_map.py <name> [<name> ...]   e.g. convert_map.py 3rd_2-1
Writes public/data/ep1/maps/<name>.json and public/data/ep1/pat/<file>{.json,_N.png}.
Cell format (see docs/FORMATS.md): base tile (index into the concatenated leading ground sets), decor slot, decor pattern.
Obl records are 42 bytes: i32 x, i32 y (world coords), 9 x i16 (slot, pattern, -1, 1000, flags, 0, 1000, 1000, 1000), 4 x i32 judgement rect.
World -> real pixels: rx = (wx - wy) * 15 / 100, ry = (wx + wy) * 10 / 100  (RKC_RPGSCRN defaults).
"""
import sys, os, json, base64, struct
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rclib, njp, convert

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
SRC = os.path.join(ROOT, 'assets', 'ep1', 'Map')
OUT = os.path.join(ROOT, 'data', 'ep1')

def find(dirname, name, exts):
    for f in os.listdir(os.path.join(SRC, dirname)):
        b, e = os.path.splitext(f)
        if b.lower() == name.lower() and e.lower() in exts: return os.path.join(SRC, dirname, f)
    raise FileNotFoundError((dirname, name))

def outname(f):
    b, e = os.path.splitext(f)
    return b + ('_sdw' if e.lower() == '.sdw' else '')

def convert_map(name):
    lst = open(find('Pattern', name, ('.lst',)), 'rb').read().decode('cp932', 'replace').split('\n')
    lst = [l.strip() for l in lst[:64]]
    lst = [l if l and l != '?' else '' for l in lst]
    g = open(find('Ground', name, ('.gnd',)), 'rb').read()
    W, H, cw, ch = struct.unpack_from('<4I', g, 16)
    cells, _, _ = rclib.lz(g, 16 + 24 + 1)
    assert len(cells) == W * H * 6
    # judge/area block (second RCLIB block)
    first_end = 16 + 24 + 1 + 16 + struct.unpack_from('<I', g, 16 + 24 + 1 + 12)[0]
    jraw, _, _ = rclib.lz(g, first_end + 1)
    # walkability grid: u16 per 160x160 world-unit cell (header words 8,9 of the file = 160,160)
    jcw, jch = struct.unpack_from('<2I', g, 32)  # (read before use below)
    # grid covers the whole (rotated) map rectangle: a = world x in [0, amax], b = world y in [bmin, bmax]
    import math
    Rw, Rh = W * cw, H * ch
    amax = (Rh * 10 + Rw * 100 / 15 * 1.0) / 2; bmin = -Rw * 100 / 15 / 2; bmax = Rh * 10 / 2
    JW = int(amax // jcw) + 2; OB = math.ceil(-bmin / jch) + 1; JH = OB + math.ceil(bmax / jch) + 1
    assert len(jraw) == JW * JH * 2, len(jraw)
    jv = struct.unpack('<%dH' % (JW * JH), jraw)
    marker = [i for i, x in enumerate(jv) if x & 0x8000]
    judge = bytes(min(x & 0x7fff, 255) for x in jv)
    o = open(find('Object', name, ('.obl',)), 'rb').read()
    n, = struct.unpack_from('<I', o, 16)
    objs = []
    for i in range(n):
        p = 20 + i * 42
        x, y = struct.unpack_from('<ii', o, p)
        slot, pat = struct.unpack_from('<hh', o, p + 8)
        objs.append([x, y, slot, pat])
    # leading ground sets: entries whose first image is a full chip
    ground = 0
    sets = {}
    for i, f in enumerate(lst):
        if not f: continue
        if f not in sets:
            sets[f] = convert.convert_njp(os.path.join(SRC, 'Pattern', f), os.path.join(OUT, 'pat'), outname(f))
    for i, f in enumerate(lst):
        if not f: break
        m = sets[f]
        if m['images'] and m['images'][0][3] == cw and m['images'][0][4] == ch and not f.lower().endswith('.sdw'): ground += 1
        else: break
    # spawn: the flagged marker cell if it is walkable, else the walkable cell nearest to the centroid of the objects
    def free(gx, gy): return 0 <= gx < JW and 0 <= gy < JH and judge[gy * JW + gx] == 0
    def to_cell(a, b): return int((a + jcw) // jcw), int((b + OB * jch) // jch)
    spawn = None
    if marker and free(marker[0] % JW, marker[0] // JW): spawn = (marker[0] % JW, marker[0] // JW)
    elif objs:
        cx, cy = to_cell(sum(o[0] for o in objs) / len(objs), sum(o[1] for o in objs) / len(objs))
        for r in range(0, 400):
            c = [(x, y) for y in range(cy - r, cy + r + 1) for x in range(cx - r, cx + r + 1) if max(abs(x - cx), abs(y - cy)) == r and free(x, y)]
            if c: spawn = c[0]; break
    spawn = [spawn[0] * jcw - jcw + jcw // 2, spawn[1] * jch - OB * jch + jch // 2] if spawn else None   # world (a, b)
    os.makedirs(os.path.join(OUT, 'maps'), exist_ok=True)
    meta = dict(name=name, w=W, h=H, chipW=cw, chipH=ch, groundSlots=ground,
                lst=[outname(f) if f else '' for f in lst],
                cells=base64.b64encode(cells).decode(), judge=base64.b64encode(judge).decode(),
                judgeW=JW, judgeH=JH, judgeCell=jcw, judgeOrigin=[jcw, OB * jch], marker=[[i % JW, i // JW] for i in marker], spawn=spawn, objects=objs)
    json.dump(meta, open(os.path.join(OUT, 'maps', name + '.json'), 'w'), separators=(',', ':'))
    return meta

if __name__ == '__main__':
    for nm in sys.argv[1:]:
        m = convert_map(nm); print(nm, m['w'], m['h'], 'ground slots', m['groundSlots'], 'objects', len(m['objects']))
