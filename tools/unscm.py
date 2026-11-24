#!/usr/bin/env python3
"""Unscramble an Episode 2-4 `Data.scm` (SFSetup.exe 0x40d1e0): after the 12-byte header ("SCRFile\\0" + version) the data is processed in blocks of B bytes
(B depends on the serial key; found here by brute force since the plain text must start with "SMAFile\\0"). Inside a block of n bytes, for i < n/2:
out[i] = in[n-1-i] ^ (B & 0xff), out[n-1-i] = in[i]. The result is an ordinary .sma container (tools/sma.py)."""
import sys
src, dst = sys.argv[1], sys.argv[2]
d = open(src, 'rb').read(); assert d[:8] == b'SCRFile\0'
d = d[12:]; n = len(d); tgt = b'SMAFile\0'
B = next(b for b in range(16, min(n, 1 << 26)) if all(d[b - 1 - i] ^ (b & 0xff) == tgt[i] for i in range(8)))
print('block size', B)
out = bytearray(n); k = B & 0xff
for o in range(0, n, B):
    blk = d[o:o + B]; m = len(blk); r = bytearray(blk)
    for i in range(m // 2):
        r[i] = blk[m - 1 - i] ^ k; r[m - 1 - i] = blk[i]
    out[o:o + m] = r
open(dst, 'wb').write(out); print(out[:20])
