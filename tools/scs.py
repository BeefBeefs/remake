#!/usr/bin/env python3
"""Scenario.Scs ("ScenaScriptV000") parser, layout taken from RKC_RPG_SCRIPT::ReadBinary (0x10005590).
 magic[16]
 u32 n; n x (u32 id, u32 value)                      -- flag list A (net flags?)
 u32 n; n x (u32 id, u32 value)                      -- flag list B (temp flags?)
 u32 n; n x (u32 id, u32 len, len bytes (bit-inverted cp932))   -- messages
 u32 n; n x (u32 a, u32 b, u32 c, u32 d)             -- status table
 u32 n (blocks); per block: u32 m; m x sentence{ u32 id; u32 k; k x (u32 opcode, u32 operand) }
"""
import struct, sys

def parse(d):
    assert d[:13] == b'ScenaScriptV0', d[:16]
    off = 16
    def u32():
        nonlocal off
        v, = struct.unpack_from('<I', d, off); off += 4; return v
    def i32():
        nonlocal off
        v, = struct.unpack_from('<i', d, off); off += 4; return v
    flagsA = [(u32(), i32()) for _ in range(u32())]
    flagsB = [(u32(), i32()) for _ in range(u32())]
    msgs = []
    for _ in range(u32()):
        mid = u32(); l = u32()
        msgs.append((mid, bytes(~x & 255 for x in d[off:off + l]).decode('cp932', 'replace'))); off += l
    status = [(u32(), u32(), u32(), u32()) for _ in range(u32())]
    blocks = []
    for _ in range(u32()):
        sents = []
        for _ in range(u32()):
            sid = u32(); k = u32()
            cmds = [(u32(), i32()) for _ in range(k)]
            sents.append((sid, cmds))
        blocks.append(sents)
    return dict(flagsA=flagsA, flagsB=flagsB, messages=msgs, status=status, blocks=blocks, end=off, size=len(d))

if __name__ == '__main__':
    s = parse(open(sys.argv[1], 'rb').read())
    print({k: (len(v) if isinstance(v, list) else v) for k, v in s.items()})
