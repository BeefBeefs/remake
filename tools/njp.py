"""Parser for .njp sprite files (NJudge/UniPat v003), derived from RKC_UPDIB.dll."""
import struct, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rclib

class Njp:
    pass

def parse(d):
    n = Njp()
    magic = d[:16]
    n.magic = magic.split(b'\0')[0].decode()
    n.ver = int(n.magic[-3:])
    n.judge = n.magic.startswith('UnitePat')        # type 1: pattern has 168-byte judgement block
    n.onebit = n.magic.startswith('ShadowLow')     # type 4: 1-bit masks
    p = 16
    count, = struct.unpack_from('<I', d, p); p += 4
    if n.ver >= 3: p += 4                              # total decoded bytes
    n.images = []
    for i in range(count):
        bpp, w, h, comp = struct.unpack_from('<IIII', d, p); p += 16
        if n.onebit: bpp = 1
        if bpp == 1: stride = ((w + 7)//8 + 3)//4*4
        elif bpp == 4: stride = (((w+1)//2) + 3)//4*4
        else: stride = (w + 3)//4*4
        if comp:
            data, osz, csz = rclib.lz(d, p); p += 16 + csz
        else:
            data = d[p:p+stride*h]; p += stride*h
        n.images.append(dict(bpp=bpp, w=w, h=h, stride=stride, data=data))
    npat, = struct.unpack_from('<I', d, p); p += 4
    if n.ver >= 3: p += 4                              # total parts
    n.patterns = []
    for i in range(npat):
        pc, = struct.unpack_from('<I', d, p); p += 4
        rect = struct.unpack_from('<4i', d, p); p += 16
        judge = None
        if n.judge:
            judge = d[p:p+168]; p += 168
        defpal = 0
        if n.ver >= 1:
            defpal, = struct.unpack_from('<I', d, p); p += 4
        parts = []
        for k in range(pc):
            a, img, x, y, b, c, e = struct.unpack_from('<IiiiIII', d, p); p += 28
            parts.append(dict(flag=a, img=img, x=x, y=y, b=b, c=c, d=e))
        n.patterns.append(dict(rect=rect, judge=judge, defpal=defpal, parts=parts))
    npal, = struct.unpack_from('<I', d, p); p += 4
    n.palettes = []
    for i in range(npal):
        raw = d[p:p+1024]; p += 1024
        n.palettes.append([(raw[j*4], raw[j*4+1], raw[j*4+2]) for j in range(256)])  # file order is R,G,B,x
    n.names = []
    if n.ver >= 2 and p + 4 <= len(d):
        flag, = struct.unpack_from('<I', d, p); p += 4
        if flag == 1:
            for i in range(npat):
                l, = struct.unpack_from('<I', d, p); p += 4
                n.names.append(d[p:p+l].decode('cp932', 'replace')); p += l
    n.end = p; n.size = len(d)
    return n

if __name__ == '__main__':
    n = parse(open(sys.argv[1], 'rb').read())
    print(n.magic, 'images', len(n.images), 'patterns', len(n.patterns), 'palettes', len(n.palettes), 'end', n.end, 'of', n.size)

def indices(im):
    """Return list of rows (top-down) of palette indices (or 0/1 for 1-bit masks)."""
    w, h, st, d, bpp = im['w'], im['h'], im['stride'], im['data'], im['bpp']
    rows = []
    for y in range(h):
        row = d[(h - 1 - y) * st:(h - y) * st]   # DIB is bottom-up
        if bpp == 8: r = list(row[:w])
        elif bpp == 4:
            r = []
            for b in row[:(w + 1)//2]: r += [b >> 4, b & 15]
            r = r[:w]
        else:
            r = [(row[x >> 3] >> (7 - (x & 7))) & 1 for x in range(w)]
        rows.append(r)
    return rows

def to_rgba(im, palette):
    """Palette index 0 is the transparent colour key."""
    from PIL import Image
    w, h = im['w'], im['h']
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0)); px = out.load()
    for y, row in enumerate(indices(im)):
        for x, v in enumerate(row):
            if v: px[x, y] = palette[v] + (255,)
    return out
