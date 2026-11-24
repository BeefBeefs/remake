#!/usr/bin/env python3
"""Item.Ibn (SFItemDataV0000): 16-byte magic, u32 key?, u32 1, then an RCLIB-L block whose *bytes after the 16-byte
RCLIB header's start (file offset 0x28)* are passed through a 256-byte substitution table (built on the stack in
ShadowFlare.exe at 0x46302d..0x46376e).  out = lz(subst(file[0x28:]))."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rclib
SUBST = [190, 102, 179, 47, 1, 110, 109, 200, 31, 152, 165, 70, 118, 92, 61, 14, 170, 94, 157, 255, 234, 160, 13, 75, 117, 246, 97, 133, 93, 187, 220, 251, 139, 195, 79, 69, 4, 144, 129, 30, 107, 201, 211, 115, 198, 231, 36, 186, 50, 243, 192, 236, 87, 204, 196, 182, 193, 174, 175, 136, 242, 132, 206, 74, 252, 60, 159, 26, 86, 197, 226, 245, 71, 217, 215, 140, 205, 151, 240, 123, 49, 6, 229, 20, 230, 218, 72, 38, 172, 135, 154, 216, 166, 235, 146, 207, 15, 148, 65, 180, 116, 42, 209, 112, 28, 212, 176, 194, 9, 8, 22, 155, 253, 119, 29, 33, 158, 54, 53, 83, 62, 208, 213, 98, 88, 95, 99, 124, 181, 141, 43, 210, 137, 183, 153, 161, 48, 101, 84, 64, 150, 113, 254, 191, 244, 169, 91, 247, 34, 96, 90, 111, 250, 27, 121, 233, 23, 177, 0, 156, 126, 82, 41, 18, 44, 120, 5, 145, 85, 227, 162, 185, 248, 80, 149, 19, 128, 127, 17, 39, 203, 55, 78, 81, 21, 239, 167, 114, 77, 131, 73, 164, 105, 222, 32, 163, 103, 223, 16, 66, 57, 108, 45, 199, 35, 228, 221, 237, 214, 249, 89, 178, 173, 106, 125, 188, 238, 224, 58, 63, 202, 76, 37, 104, 147, 24, 51, 40, 11, 7, 3, 130, 2, 67, 138, 134, 219, 56, 52, 25, 100, 46, 122, 171, 241, 232, 68, 12, 184, 143, 168, 10, 142, 189, 225, 59]
def decode(d):
    b = bytearray(d)
    for i in range(0x28, len(b)): b[i] = SUBST[b[i]]
    return rclib.lz(bytes(b), 0x18)[0]
if __name__ == '__main__':
    out = decode(open(sys.argv[1], 'rb').read())
    if len(sys.argv) > 2: open(sys.argv[2], 'wb').write(out)
    print(len(out))

def parse_items(out):
    """-> list of sections; each = list of dict(name, type, f={index: value}) (zero fields omitted). Names are stored bit-inverted cp932."""
    import struct
    def rd(off):
        l, = struct.unpack_from('<I', out, off)
        return bytes(~x & 255 for x in out[off + 4:off + 4 + l]).decode('cp932', 'replace'), off + 4 + l
    RECSIZE = [804, 764, 672, 140, 100]   # data bytes per record, per section (found by scanning for the next name pair)
    off = 0; secs = []
    for R in RECSIZE:
        n, = struct.unpack_from('<I', out, off); off += 4; sec = []
        for _ in range(n):
            a, off = rd(off); b, off = rd(off)
            w = struct.unpack_from('<%di' % (R // 4), out, off); off += R
            sec.append(dict(name=a, type=b, f={i: v for i, v in enumerate(w) if v}))
        secs.append(sec)
    assert off == len(out)
    return secs
