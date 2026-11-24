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
def convert_object_model(n):
    """OBJECT/<n>/Pattern.(njp|Njp) [+ Pattern.(sdw|Sdw) shadow, optional] -> objects/<n>[_sdw]; n = the Mct object record's type field."""
    o = os.path.join(out, 'objects'); os.makedirs(o, exist_ok=True)
    d = os.path.join(src, 'Character', 'OBJECT', '%08d' % n)
    for f in os.listdir(d):
        low = f.lower()
        if low == 'pattern.njp': convert.convert_njp(os.path.join(d, f), o, str(n))
        elif low == 'pattern.sdw': convert.convert_njp(os.path.join(d, f), o, f'{n}_sdw')
if __name__ == '__main__':
    for sc in sys.argv[1:]:
        recs = mct.parse(os.path.join(src, 'Scenario', sc, 'Scenario.Mct'))
        recs = [r for r in recs if (r['model'] < 0 and r['kind'] == 'enemy') or convert_actor(r['kind'], r['model']) or print('skip (no model):', r['name'], r['kind'], r['model'])]
        os.makedirs(os.path.join(out, 'scenario'), exist_ok=True)
        objs = mct.parse_objects(os.path.join(src, 'Scenario', sc, 'Scenario.Mct'))
        for t in sorted({o['type'] for o in objs if o['type'] >= 0}):
            if os.path.isdir(os.path.join(src, 'Character', 'OBJECT', '%08d' % t)): convert_object_model(t)
        json.dump(dict(map=mct.map_name(os.path.join(src, 'Scenario', sc, 'Scenario.Mct')), music=mct.music_index(os.path.join(src, 'Scenario', sc, 'Scenario.Mct')), actors=recs, objects=objs), open(os.path.join(out, 'scenario', sc + '.actors.json'), 'w'))
