#!/usr/bin/env python3
"""Convert NPC/partner/enemy models used by the given scenarios to public/data/ep1/actors/<kind>/<n>.*"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import convert, mct
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
src, out = os.path.join(root, 'assets', 'ep1'), os.path.join(root, 'data', 'ep1')
DIR = dict(people='PEOPLE', partner='PARTNER', enemy='ENEMY')
def convert_actor(kind, n):
    s = os.path.join(src, 'Character', DIR[kind], '%08d' % n); o = os.path.join(out, 'actors', kind)
    if not os.path.isdir(s): return False
    if os.path.exists(os.path.join(o, f'{n}.caf.json')): return True
    os.makedirs(o, exist_ok=True)
    convert.convert_njp(os.path.join(s, 'Animation.Njp'), o, str(n))
    convert.convert_njp(os.path.join(s, 'Animation.Sdw'), o, f'{n}_sdw')
    convert.convert_caf(os.path.join(s, 'Animation.Caf'), os.path.join(o, f'{n}.caf.json'))
    return True
if __name__ == '__main__':
    for sc in sys.argv[1:]:
        recs = mct.parse(os.path.join(src, 'Scenario', sc, 'Scenario.Mct'))
        recs = [r for r in recs if convert_actor(r['kind'], r['model']) or print('skip (no model):', r['name'], r['kind'], r['model'])]
        os.makedirs(os.path.join(out, 'scenario'), exist_ok=True)
        json.dump(dict(map=mct.map_name(os.path.join(src, 'Scenario', sc, 'Scenario.Mct')), actors=recs), open(os.path.join(out, 'scenario', sc + '.actors.json'), 'w'))
