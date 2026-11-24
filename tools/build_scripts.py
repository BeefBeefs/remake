#!/usr/bin/env python3
"""Scenario.Scs -> public/data/ep1/scenario/<id>.script.json {flags, messages, status:[[net,status,char,block]], blocks:[[[type,[[kind,val]..]]..]..]}"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scs, epaths
src, out = os.path.join(epaths.assets(), 'Scenario'), os.path.join(epaths.data(), 'scenario')
os.makedirs(out, exist_ok=True)
ok = 0
for sc in sorted(os.listdir(src)):
    p = os.path.join(src, sc, 'Scenario.Scs')
    if not os.path.exists(p): continue
    try:
        d = open(p, 'rb').read(); s = scs.parse(d); assert s['end'] == s['size']
    except Exception as e:
        print('skip', sc, e); continue
    json.dump(dict(
        flags=[[a, b] for a, b in s['flagsA']], messages={str(a): b.replace('　', ' ') for a, b in s['messages']},
        status=[list(x) for x in s['status']],
        blocks=[[[t, [list(c) for c in cmds]] for t, cmds in b] for b in s['blocks']]),
        open(os.path.join(out, sc + '.script.json'), 'w'), separators=(',', ':'))
    ok += 1
print(ok, 'scripts written')
