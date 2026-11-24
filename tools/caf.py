"""Parser for .caf character animation files (CHRAnimation000-002), derived from RKC_RPGSCRN.dll."""
import struct, sys

def parse(d):
    magic = d[:16].split(b'\0')[0].decode()
    ver = int(magic[-3:])
    p = 16
    def u16():
        nonlocal p; v, = struct.unpack_from('<H', d, p); p += 2; return v
    def s16():
        nonlocal p; v, = struct.unpack_from('<h', d, p); p += 2; return v
    def u32():
        nonlocal p; v, = struct.unpack_from('<I', d, p); p += 4; return v
    n = u32()
    anims = []
    for i in range(n):
        a = dict(attr=u16(), dirs=[])
        for dr in range(9):
            k = u32()
            dd = dict(val=None, seqs=[])
            dd['val'] = u16()
            for j in range(k):
                m = u32()
                frames = []
                for f in range(m):
                    fa = u16(); fb = u16()
                    if ver <= 1: fx = s16()
                    pat = u32(); fd = u16()
                    frames.append((fa, fb, pat, fd))
                dd['seqs'].append(frames)
            a['dirs'].append(dd)
        anims.append(a)
    return dict(magic=magic, ver=ver, anims=anims, end=p, size=len(d))

if __name__ == '__main__':
    r = parse(open(sys.argv[1], 'rb').read())
    print(r['magic'], len(r['anims']), 'end', r['end'], 'of', r['size'])
