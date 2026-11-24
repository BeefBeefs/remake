import struct,sys,os,collections
src,dst=sys.argv[1],sys.argv[2]
d=open(src,'rb').read()
assert d[:8]==b'SMAFile\0'
ver,unk,cnt=struct.unpack_from('<III',d,8)
p=20; ents=[]
for i in range(cnt):
    nl,=struct.unpack_from('<I',d,p); p+=4
    name=d[p:p+nl].decode('cp932'); p+=nl
    sz,=struct.unpack_from('<I',d,p); p+=4
    ents.append((name,p,sz)); p+=sz
print('count',cnt,'end',p,'filesize',len(d))
ext=collections.Counter()
for name,o,sz in ents:
    rel=name.replace('\\','/')
    ext[os.path.splitext(rel)[1].lower()]+=1
    if dst!='-':
        t=os.path.join(dst,rel); os.makedirs(os.path.dirname(t),exist_ok=True)
        open(t,'wb').write(d[o:o+sz])
print(ext)
