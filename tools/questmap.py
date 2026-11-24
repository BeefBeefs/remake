#!/usr/bin/env python3
"""Static quest map: for the effective scripts of an episode (overlay chain), every sentence-62 site (quest, state) with the scenario, block and the handlers (status rows)
that reach it through jumps (sentence 0 calls). usage: tools/questmap.py [ep=4] [quest ...]"""
import json, glob, os, sys, collections
ep = int(sys.argv[1]) if len(sys.argv) > 1 else 4
want = set(map(int, sys.argv[2:]))
files = {}
for e in range(1, ep + 1):
    for f in glob.glob(f'public/data/ep{e}/scenario/*.script.json'): files[os.path.basename(f)[:8]] = f
sites = collections.defaultdict(list)
for sc, f in sorted(files.items()):
    d = json.load(open(f)); B = d['blocks']
    calls = collections.defaultdict(set)   # block -> blocks it jumps to
    for bi, b in enumerate(B):
        for s in b:
            if s[0] == 0 and len(s[1]) == 4: calls[bi].add(s[1][3][1])
    entry = {}
    for typ, kind, char, blk in d['status']:
        entry.setdefault(blk, []).append((typ, kind, char))
    # reverse reachability
    rev = collections.defaultdict(set)
    for a, bs in calls.items():
        for c in bs: rev[c].add(a)
    def handlers(bi):
        seen, st, out = set(), [bi], []
        while st:
            x = st.pop()
            if x in seen: continue
            seen.add(x); out += entry.get(x, []); st += rev.get(x, [])
        return out
    for bi, b in enumerate(B):
        for s in b:
            if s[0] == 62 and s[1][0][0] == 1:
                q, state = s[1][0][1], s[1][1][1]
                sites[q].append((sc, bi, state, handlers(bi)))
for q in sorted(sites):
    if want and q not in want: continue
    print(f'quest {q}')
    for sc, bi, state, h in sites[q]: print(f'  {sc} block {bi} state {state} <- {h[:6]}')
