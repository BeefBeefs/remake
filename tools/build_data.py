#!/usr/bin/env python3
"""Export game parameter tables to JSON: public/data/ep1/items.json (Item.Ibn) and tables.json (Table.Tbd)."""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ibn, tbd
P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
A = os.path.join(P, 'assets', 'ep1', 'System', 'Game', 'Parameter'); O = os.path.join(P, 'data', 'ep1')
os.makedirs(O, exist_ok=True)
secs = ibn.parse_items(ibn.decode(open(os.path.join(A, 'Item.Ibn'), 'rb').read()))
json.dump(secs, open(os.path.join(O, 'items.json'), 'w'), separators=(',', ':'))
tabs = tbd.parse(os.path.join(A, 'Table.Tbd'))
json.dump(tabs, open(os.path.join(O, 'tables.json'), 'w'), separators=(',', ':'))
print('items', [len(s) for s in secs], 'tables', len(tabs))
