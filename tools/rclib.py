import struct
MAGIC=b'RCLIB-L\x1a'
def lz(d, off=0):
    assert d[off:off+8]==MAGIC
    osz,csz=struct.unpack_from('<II',d,off+8)
    win=bytearray(4096); r=0xFEE
    out=bytearray(); i=off+16; end=min(len(d),off+16+csz) if csz else len(d)
    while i<end and len(out)<osz:
        flags=d[i]; i+=1
        for b in range(7,-1,-1):
            if i>=end or len(out)>=osz: break
            if flags>>b&1:
                if i+1>=end+0: break
                a=d[i]; c=d[i+1]; i+=2
                pos=a|(c&0xf0)<<4; ln=(c&0xf)+3
                for k in range(ln):
                    v=win[(pos+k)&0xfff]; out.append(v); win[r]=v; r=(r+1)&0xfff
            else:
                v=d[i]; i+=1; out.append(v); win[r]=v; r=(r+1)&0xfff
    return bytes(out[:osz]),osz,csz
if __name__=='__main__':
    import sys
    d=open(sys.argv[1],'rb').read(); o=d.find(MAGIC)
    out,osz,csz=lz(d,o); print('hdr off',o,'orig',osz,'comp',csz,'got',len(out),'filelen',len(d))
    if len(sys.argv)>2: open(sys.argv[2],'wb').write(out)
