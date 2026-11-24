#!/usr/bin/env python3
"""Convert the bundled Episode 1 data in public/assets/ep1 into web-ready files in public/data/ep1."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import convert
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
src, out = os.path.join(root, 'assets', 'ep1'), os.path.join(root, 'data', 'ep1')
os.makedirs(out, exist_ok=True)
for who in ('Male', 'Female'):
    n = who.lower()
    print('player', n)
    convert.convert_njp(os.path.join(src, 'Player', who, 'Animation00.Njp'), out, n)
    convert.convert_caf(os.path.join(src, 'Player', who, 'Animation00.Caf'), os.path.join(out, n + '.caf.json'))
