#!/usr/bin/env python3
"""Convert one episode patch: EP=2 python3 tools/build_episode.py  (or: python3 tools/build_episode.py 2)
Runs build_data (Item.Ibn / Table.Tbd when the patch has them), build_scripts, build_actors for every scenario of the patch, converts the maps those scenarios use
that no lower episode converted yet, and writes data/epN/manifest.json (every file the episode holds, relative to data/epN)."""
import os, sys, json, subprocess
if len(sys.argv) > 1: os.environ['EP'] = sys.argv[1]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import epaths, mct
here = os.path.dirname(os.path.abspath(__file__))
def run(script, *args): subprocess.run([sys.executable, os.path.join(here, script), *args], check=True, env=os.environ)
os.makedirs(epaths.data(), exist_ok=True)
run('build_data.py')
run('build_scripts.py')
ids = sorted(d for d in os.listdir(os.path.join(epaths.assets(), 'Scenario')))
run('build_actors.py', *ids)
import convert_map
need = []
for sc in ids:
    p = os.path.join(epaths.assets(), 'Scenario', sc, 'Scenario.Mct')
    m = mct.map_name(p) if os.path.exists(p) else None
    if m and m not in need and not epaths.lower_data(os.path.join('maps', m + '.json')): need.append(m)
for m in need:
    meta = convert_map.convert_map(m); print('map', m, meta['w'], meta['h'])
files = []
for dp, _, fs in os.walk(epaths.data()):
    for f in fs:
        if f != 'manifest.json': files.append(os.path.relpath(os.path.join(dp, f), epaths.data()).replace(os.sep, '/'))
json.dump(sorted(files), open(os.path.join(epaths.data(), 'manifest.json'), 'w'), separators=(',', ':'))
print('episode', epaths.EP, ':', len(files), 'files,', len(need), 'new maps')
