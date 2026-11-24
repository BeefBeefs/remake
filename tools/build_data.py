#!/usr/bin/env python3
"""Export game parameter tables to JSON: public/data/ep1/items.json (Item.Ibn) and tables.json (Table.Tbd)."""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ibn, tbd, epaths
A = os.path.join(epaths.assets(), 'System', 'Game', 'Parameter'); O = epaths.data()
os.makedirs(O, exist_ok=True)
if os.path.exists(os.path.join(A, 'Item.Ibn')):
    secs = ibn.parse_items(ibn.decode(open(os.path.join(A, 'Item.Ibn'), 'rb').read()))
    json.dump(secs, open(os.path.join(O, 'items.json'), 'w'), separators=(',', ':'))
    print('items', [len(s) for s in secs])
if os.path.exists(os.path.join(A, 'Table.Tbd')):
    tabs = tbd.parse(os.path.join(A, 'Table.Tbd'))
    json.dump(tabs, open(os.path.join(O, 'tables.json'), 'w'), separators=(',', ':'))
    print('tables', len(tabs))
