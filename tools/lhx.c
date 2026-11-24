// minimal LHA (lh0/lh5, level 2 headers) extractor for SFX exes
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
static uint8_t *in; static size_t ipos, iend; static uint32_t bb; static int bcnt;
static void fill(int n){ while(n>0){ if(bcnt==0){ bb=(ipos<iend)?in[ipos++]:0; bcnt=8;} int t=n<bcnt?n:bcnt; (void)t; break;} }
// simple bit reader
static uint64_t acc; static int abits;
static void need(int n){ while(abits<n){ acc=(acc<<8)|((ipos<iend)?in[ipos++]:0); abits+=8; } }
static uint32_t getbits(int n){ if(!n) return 0; need(n); uint32_t v=(acc>>(abits-n))&((1u<<n)-1); abits-=n; return v; }
static uint32_t peek(int n){ need(n); return (acc>>(abits-n))&((1u<<n)-1); }
typedef struct { int fixed; int fsym; int cnt[18]; int *sorted; int n; } Tab;
static void mk(Tab*t,uint8_t*len,int n){ t->n=n; memset(t->cnt,0,sizeof t->cnt); t->fixed=-1; free(t->sorted); t->sorted=malloc(sizeof(int)*(n+1));
  for(int i=0;i<n;i++) t->cnt[len[i]]++; t->cnt[0]=0; int off[18]; off[1]=0; for(int l=1;l<17;l++) off[l+1]=off[l]+t->cnt[l];
  for(int i=0;i<n;i++) if(len[i]) t->sorted[off[len[i]]++]=i; }
static void fixedtab(Tab*t,int sym){ t->fixed=sym; }
static int dec(Tab*t){ if(t->fixed>=0) return t->fixed; int code=0,first=0,idx=0; for(int l=1;l<=16;l++){ code|=getbits(1); int c=t->cnt[l]; if(code-c<first) return t->sorted[idx+(code-first)]; idx+=c; first+=c; first<<=1; code<<=1; } return 0; }
#define NC 510
#define NP 14
#define NT 19
static Tab ct,pt,tt; static uint8_t clen[NC],plen[NT>NP?NT:NP];
static void read_pt_len(Tab*t,int nn,int nbit,int isp){ int n=getbits(nbit); uint8_t l[32]={0};
  if(n==0){ int c=getbits(nbit); fixedtab(t,c); return; }
  int i=0; while(i<n){ int c=peek(3); if(c==7){ int m=1<<12; uint32_t b=peek(16); while(b&m){ m>>=1; c++; } getbits(c<7?3:c-3);} else getbits(3);
    l[i++]=c; if(i==isp){ c=getbits(2); while(--c>=0) l[i++]=0; } }
  mk(t,l,nn); }
static void read_c_len(){ int n=getbits(9); if(n==0){ int c=getbits(9); fixedtab(&ct,c); return; }
  memset(clen,0,sizeof clen); int i=0; while(i<n){ int c=dec(&tt); if(c<=2){ if(c==0)c=1; else if(c==1)c=getbits(4)+3; else c=getbits(9)+20; while(--c>=0) clen[i++]=0; } else clen[i++]=c-2; }
  mk(&ct,clen,NC); }
static int lh5(uint8_t*out,size_t osz){ size_t o=0; int bs=0; acc=0;abits=0;
  while(o<osz){ if(bs==0){ bs=getbits(16); read_pt_len(&tt,NT,5,3); read_c_len(); read_pt_len(&pt,NP,4,-1); }
    bs--; int j=dec(&ct); if(j<256) out[o++]=j; else { int len=j-256+3; int p=dec(&pt); if(p) p=(1<<(p-1))+getbits(p-1); 
      if((size_t)p+1>o){ return -1; } for(int k=0;k<len&&o<osz;k++){ out[o]=out[o-p-1]; o++; } } }
  return 0; }
int main(int argc,char**argv){ FILE*f=fopen(argv[1],"rb"); fseek(f,0,SEEK_END); long sz=ftell(f); fseek(f,0,SEEK_SET); in=malloc(sz); fread(in,1,sz,f); fclose(f);
  long pos=-1; for(long i=2;i<sz-8;i++) if(!memcmp(in+i,"-lh5-",5)&&in[i-2]>=20&&in[i-1]==0&&in[i+18]==2){pos=i-2;break;}
  if(pos<0){puts("no archive");return 1;}
  while(pos+26<sz){ uint8_t*h=in+pos; int hs=h[0]|h[1]<<8; if(hs==0) break; if(memcmp(h+2,"-lh",3)) break;
    uint32_t pk=*(uint32_t*)(h+7), os=*(uint32_t*)(h+11); int lvl=h[20]; if(lvl!=2){printf("level %d unsupported\n",lvl);break;}
    char name[256]="out.bin"; int p=24; while(p+2<=hs){ int ns=h[p]|h[p+1]<<8; if(!ns)break; if(h[p+2]==1){ int l=ns-3; memcpy(name,h+p+3,l); name[l]=0;} p+=ns; }
    printf("%s method=%c packed=%u orig=%u\n",name,h[5],pk,os);
    uint8_t*out=malloc(os); if(h[5]=='0') memcpy(out,in+pos+hs,os); else { ipos=pos+hs; iend=pos+hs+pk; if(lh5(out,os)) printf("  decode error\n"); }
    if(argc>2){ char path[512]; snprintf(path,sizeof path,"%s/%s",argv[2],name); FILE*g=fopen(path,"wb"); fwrite(out,1,os,g); fclose(g);} free(out);
    pos+=hs+pk; }
  return 0; }
