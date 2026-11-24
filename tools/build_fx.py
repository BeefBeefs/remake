#!/usr/bin/env python3
"""Convert effect sprite sets (Character/OPTION/<folder>/Animation.(Njp|Caf)) to public/data/ep1/fx/<folder>.*
Script effect ids 20000+k (sentence 36) are taken as the k-th folder of `Character\\Option\\*.*` in sorted order (GUESS: the exe enumerates that directory)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import convert
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
src, out = os.path.join(root, 'assets', 'ep1', 'Character', 'OPTION'), os.path.join(root, 'data', 'ep1', 'fx')
if __name__ == '__main__':
    os.makedirs(out, exist_ok=True)
    names = sorted(n for n in os.listdir(src) if os.path.exists(os.path.join(src, n, 'Animation.Njp')))
    for n in names:
        convert.convert_njp(os.path.join(src, n, 'Animation.Njp'), out, n)
        convert.convert_caf(os.path.join(src, n, 'Animation.Caf'), os.path.join(out, n + '.caf.json'))
    import json; json.dump(sorted(os.listdir(src)), open(os.path.join(out, 'index.json'), 'w'))
    print(len(names), 'effect sets')
