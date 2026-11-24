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
        head = struct.unpack_from('<8i', d, i - 32)
        kind, model = ('partner', ident - 10000) if ident >= 10000 else ('people', pre[3])
        col = d[j:j + 4]
        rec_extra = {}
        # Monster record shapes (head = 8 x i32 before the length-prefixed name):
        #   normal : (4|6, 4, 4, tier, power*1000, 0, spawn#, model)
        #   boss A : (0, 1000, 1000, 1000, 0, bossId, spawn#, model)      e.g. Red Goblin, Black Hammer
        #   boss B : (200, 200, 0, 1, -65, bossId, 0, model)              e.g. Spike Centinel
        if head[1] == 4 and head[2] == 4: kind, model, rec_extra = 'enemy', head[7], dict(power=head[4] / 1000)
        elif head[0] == 0 and head[1:4] == (1000, 1000, 1000): kind, model, rec_extra = 'enemy', head[7], dict(power=1.0, boss=head[5])
        elif head[0] == 200 and head[1] == 200 and head[4] == -65: kind, model, rec_extra = 'enemy', head[7], dict(power=1.0, boss=head[5])
        out.append(dict(name=d[i+4:i+4+L].decode(), kind=kind, model=model, id=ident, a=w[1], b=w[2], dir=w[7], radius=w[0], col=col[:3].hex(), **rec_extra))
    return out
if __name__ == '__main__': print(json.dumps(parse(sys.argv[1]), indent=1))

def map_name(path):
    m = re.search(rb'Map\\([A-Za-z0-9_\-]+)\.map', open(path, 'rb').read(), re.I)
    return m.group(1).decode() if m else None
