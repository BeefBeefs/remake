import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const edges = JSON.parse(fs.readFileSync('/tmp/edges.json'));
const b = await chromium.launch({args:['--no-sandbox']}); const p = await b.newPage({viewport:{width:640,height:480}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(/unimplemented/i.test(m.text())) errs.push(m.text().slice(0,120)); });
const out={};
for (const sc of Object.keys(edges).sort()) {
  await p.goto(`http://localhost:8123/play.html?skip=male&scenario=${sc}`);
  await p.waitForFunction(()=>window.app?.scene?.win,null,{timeout:30000}); await p.waitForTimeout(400);
  const entries=[...new Set(edges[sc].map(e=>e[1]))];
  out[sc]=await p.evaluate((entries)=>{
    const s=window.app.scene, res={entries:{}};
    const w2r=(wx,wy)=>[(wx-wy)*15/100,(wx+wy)*10/100];
    const targets=[];
    for(const z of s.zones){ const id=z.rec.id; if(id>=10000000&&id<10000100){ const r=z.rec.rect; const [x,y]=w2r(z.rec.a+(r[0]+r[2])/2,z.rec.b+(r[1]+r[3])/2); targets.push({k:'exit'+(id-10000000),x,y}); } }
    for(const a of s.actors){ if(a.rec.kind==='people') targets.push({k:'npc:'+a.rec.name,x:a.x,y:a.y}); else if(a.enemy&&a.rec.boss!==undefined) targets.push({k:'boss:'+a.rec.name,x:a.x,y:a.y}); }
    const STEP=8; let OX=0,OY=0;
    const flood=(sx,sy)=>{ OX=sx; OY=sy; const seen=new Set(), q=[[0,0]]; const key=(i,j)=>i*100003+j; seen.add(key(0,0));
      while(q.length){ const [i,j]=q.pop(); for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){ const ni=i+di,nj=j+dj,k=key(ni,nj); if(seen.has(k)||Math.abs(ni)>1600||Math.abs(nj)>1600) continue; if(s.map.blockedReal(OX+ni*STEP,OY+nj*STEP)) continue; seen.add(k); q.push([ni,nj]); } }
      return seen; };
    const reach=(seen,t)=>{ const ci=Math.round((t.x-OX)/STEP), cj=Math.round((t.y-OY)/STEP); for(let di=-10;di<=10;di++)for(let dj=-10;dj<=10;dj++){ if(seen.has((ci+di)*100003+cj+dj)) return true; } return false; };
    for(const e of entries){ const pt=s.entryPoint(e); if(!pt){ res.entries[e]='NO ENTRY POINT'; continue; } const seen=flood(pt[0],pt[1]); res.entries[e]={size:seen.size, reach:targets.filter(t=>reach(seen,t)).map(t=>t.k)}; }
    const mk=s.map.markerReal(); if(mk){ const seen=flood(mk[0],mk[1]); res.entries.M={size:seen.size, reach:targets.filter(t=>reach(seen,t)).map(t=>t.k)}; }
    res.targets=targets.map(t=>t.k); return res;
  }, entries);
  
}
fs.writeFileSync('/tmp/reach.json',JSON.stringify(out)); console.log('errors',errs.slice(0,5)); await b.close();
