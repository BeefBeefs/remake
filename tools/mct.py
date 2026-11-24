#!/usr/bin/env python3
"""Scenario.Mct (MCED DATA) character records -> list of dicts.
Record (found by scanning for a length-prefixed ASCII name): i32 x4 [flag, -65, id, model] u32 len name[len] 4 bytes colour
then i32 x9 [radius, worldA, worldB, rect(-80,-80,79,79), facing, 3]."""
import re, struct, json, sys
def parse(path):
    d = open(path, 'rb').read(); out = []
    for i in range(0x300, len(d) - 60):
        L, = struct.unpack_from('<I', d, i)
        if not 3 <= L <= 16 or not re.fullmatch(rb"[A-Za-z][A-Za-z ']*", d[i+4:i+4+L]): continue
        j = i + 4 + L
        pre = struct.unpack_from('<4i', d, i - 16); w = struct.unpack_from('<9i', d, j + 4)
        if w[3:7] != (-80, -80, 79, 79): continue
        ident = pre[2]
        kind, model = ('partner', ident - 10000) if ident >= 10000 else ('people', pre[3])
        out.append(dict(name=d[i+4:i+4+L].decode(), kind=kind, model=model, id=ident, a=w[1], b=w[2], dir=w[7], radius=w[0]))
    return out
if __name__ == '__main__': print(json.dumps(parse(sys.argv[1]), indent=1))
