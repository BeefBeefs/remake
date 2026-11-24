#!/usr/bin/env python3
"""Static guards of every quest-accept site (sentence 62 state 1) in the effective scripts of an episode chain: for each quest, the path of blocks from a handler to the site and the
conditions (sentence 0) that must hold on the way. Operands: v:N = quest state of N, g10/g11:N globals, L:N object local, V:N var. usage: tools/questguards.py [ep=4] [quest ...]"""
import json, glob, os, sys, collections
ep = int(sys.argv[1]) if len(sys.argv) > 1 else 4
want = set(map(int, sys.argv[2:]))
files = {}
for e in range(1, ep + 1):
    for f in glob.glob(f'public/data/ep{e}/scenario/*.script.json'): files[os.path.basename(f)[:8]] = f
OPS = {0: '==', 1: '!=', 2: '<', 3: '>', 4: '<=', 5: '>='}   # GUESS for 2..5, 0 and 1 are verified
def opnd(o):
    k, v = o
    return {1: str(v), 4: f'V{v}', 5: f'L{v}', 10: f'g10:{v}', 11: f'g11:{v}', 12: f'q{v}', 8: 'mode', 6: f'x{v}', 7: f'y{v}', 9: f'hit{v}', 3: f'E{v}'}.get(k, f'k{k}:{v}')
out = collections.defaultdict(list)
for sc, f in sorted(files.items()):
    d = json.load(open(f)); B = d['blocks']
    calls = collections.defaultdict(list)
    for bi, b in enumerate(B):
        for si, s in enumerate(b):
            if s[0] == 0 and len(s[1]) == 4: calls[s[1][3][1]].append((bi, si, s))
    entry = collections.defaultdict(list)
    for typ, kind, char, blk in d['status']: entry[blk].append((typ, kind, char))
    for bi, b in enumerate(B):
        for s in b:
            if s[0] == 62 and s[1][1] == [1, 1]:
                q = s[1][0][1]
                if want and q not in want: continue
                # climb to handlers, collecting conditions
                paths = []
                def climb(blk, conds, seen):
                    if blk in seen or len(paths) > 6: return
                    seen = seen | {blk}
                    if blk in entry: paths.append((entry[blk], conds[::-1]))
                    for cb, si, cs in calls.get(blk, []):
                        a, op, b2, _ = cs[1]
                        climb(cb, conds + [f'{opnd(a)} {OPS.get(op[1], "op"+str(op[1]))} {opnd(b2)}'], seen)
                climb(bi, [], frozenset())
                out[q].append((sc, bi, paths))
for q in sorted(out):
    print(f'quest {q}')
    for sc, bi, paths in out[q]:
        for hd, conds in paths: print(f'  {sc} blk {bi} <- {hd[0]}  if {" and ".join(conds) or "-"}')
