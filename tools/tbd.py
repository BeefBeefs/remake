#!/usr/bin/env python3
"""Table.Tbd ("TABLE DATA V000"): 16-byte magic, u32 1, RCLIB-L block.
Decoded: u32 tableCount, then per table: u32 tableNo, rows, cols; rows*cols i32 values; rows*cols strings (u32 length + cp932 bytes)."""
import sys, os, struct
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rclib
def parse(path):
    d = open(path, 'rb').read()
    out = rclib.lz(d, 0x14)[0]
    n, = struct.unpack_from('<I', out, 0); off = 4; tabs = {}
    for _ in range(n):
        no, rows, cols = struct.unpack_from('<3I', out, off); off += 12
        vals = struct.unpack_from('<%di' % (rows * cols), out, off); off += 4 * rows * cols
        strs = []
        for _ in range(rows * cols):
            l, = struct.unpack_from('<I', out, off); off += 4
            strs.append(bytes(255 - c for c in out[off:off + l]).decode('cp932', 'replace')); off += l
        tabs[no] = dict(rows=rows, cols=cols, v=list(vals), s=strs if any(strs) else None)
    assert off == len(out)
    return tabs
