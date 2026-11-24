import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await b.newPage({viewport:{width:640,height:480}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(`http://localhost:8123/play.html?skip=male&scenario=00000001`);
await p.waitForFunction(()=>window.app?.scene?.win,null,{timeout:20000});
const r = await p.evaluate(()=>{ const s=window.app.scene; const en=s.actors.filter(a=>a.rec.st&&a.rec.st.dlv>=0).slice(0,12);
  const out=[]; let gold=0,items=0,exp0=s.totalExp;
  for(const a of en){ const n0=s.ground.length; a.hp=0; s.ground.length=0; s.hurtEnemy? s.hurtEnemy(a,1):0; out.push([a.rec.name,a.stats.exp,a.stats.gold,a.stats.goldChance,s.ground.map(g=>g.item?g.item.name:g.gold+'G')]); }
  return {out,exp:s.totalExp-exp0}; });
console.log(JSON.stringify(r)); console.log('errors',errs); await b.close();
