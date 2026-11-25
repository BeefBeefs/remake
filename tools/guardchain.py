#!/usr/bin/env python3
"""guardchain.py <ep> <scenario> <block> : climb call-graph from a block to status entries, printing guard conditions."""
import json,sys,collections,os
ep,sc,tb=sys.argv[1],sys.argv[2],int(sys.argv[3])
p=None
for e in range(int(ep),0,-1):
    q=f'public/data/ep{e}/scenario/{sc}.script.json'
    if os.path.exists(q): p=q;break
d=json.load(open(p));B=d['blocks']
calls=collections.defaultdict(list)
for bi,b in enumerate(B):
    for s in b:
        if s[0]==0 and len(s[1])==4: calls[s[1][3][1]].append((bi,s))
entry={r[3]:r for r in d['status']}
def nm(o): return {1:str(o[1]),4:f'V{o[1]}',5:f'L{o[1]}',10:f'g10:{o[1]}',11:f'g11:{o[1]}',12:f'q{o[1]}'}.get(o[0],str(o))
OP={0:'==',1:'!=',2:'>',3:'<'}
res=[]
def climb(bi,conds,seen):
    if bi in seen: return
    seen=seen|{bi}
    if bi in entry: res.append((entry[bi][1:3],conds[::-1]))
    for cb,s in calls[bi]:
        a,op,b2,_=s[1]; climb(cb,conds+[f'{nm(a)}{OP.get(op[1],op[1])}{nm(b2)}'],seen)
climb(tb,[],frozenset())
print(p)
for r in res[:6]: print(r)
if len(sys.argv)>4 and sys.argv[4]=='sets':
    for bi,b in enumerate(B):
        for s in b:
            if s[0]==1 and s[1][0]==[4,1000001] and s[1][1][0]==1 and s[1][1][1]>=0:
                res.clear(); climb(bi,[],frozenset()); print('V1=',s[1][1][1],'blk',bi,res[:2])
