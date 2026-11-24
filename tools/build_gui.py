#!/usr/bin/env python3
"""Convert System/** sprite sets (HUD, fonts, title, select screens) into public/data/ep1/gui/<Dir>_<name>.*"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import convert
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
SRC = os.path.join(ROOT, 'assets', 'ep1', 'System'); OUT = os.path.join(ROOT, 'data', 'ep1', 'gui')
for d in sorted(os.listdir(SRC)):
    pd = os.path.join(SRC, d, 'Pattern')
    if not os.path.isdir(pd): continue
    for f in sorted(os.listdir(pd)):
        b, e = os.path.splitext(f)
        if e.lower() == '.njp' or e.lower() == '.sdw':
            name = f'{d}_{b}' + ('_sdw' if e.lower() == '.sdw' else '')
            try:
                m = convert.convert_njp(os.path.join(pd, f), OUT, name)
                print(name, m['magic'], len(m['patterns']), 'patterns', len(m['images']), 'images')
            except Exception as ex:
                print('FAIL', name, repr(ex))
