// Kill every monster of the boss-room scenarios through the real damage path and check the quest completion polled by the script (status 5).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const ctx = await b.newContext({viewport:{width:640,height:480}});
for (const [sc,q] of [['00010004',3],['01020002',6],['01030002',7],['01040002',8],['01050002',10],['00010005',null],['01000002',null]]) {
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(`http://localhost:8123/play.html?skip=male&scenario=${sc}`); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(800);
  const r = await p.evaluate(async (q)=>{ const g=window.game; const vm=g.vm;
    if (q!==null) { vm.globals.set(`q:${q}`,1); }
    const mons=g.actors.filter(a=>a.enemy&&a.alive); const names=[...new Set(mons.map(a=>a.name))];
    const before=vm.globals.get(`q:${q}`);
    for (const a of mons) g.damage(a, 999999);
    await new Promise(r=>setTimeout(r,800));
    const drops=g.ground.map(d=>d.item?.name||('gold '+d.gold)).slice(0,8);
    return {n:mons.length,names,before,after:vm.globals.get(`q:${q}`),msgs:vm.queue.map(m=>m.text.slice(0,50)), dlg:!!g.dlg, drops, chests:g.zones.filter(z=>z.rec.type===1&&z.visible).length}; }, q);
  console.log(sc, JSON.stringify(r)); if (errs.length) console.log('ERR', errs.slice(0,2));
  await p.close();
}
await b.close();
