import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const route=[['00000001',0],['00000003',1],['00000005',0],['00000006',0],['00010000',0],['00010000',2],['00010001',0],['00010002',0],['00010003',0],['00010004',0]];
const b = await chromium.launch({args:['--no-sandbox']}); const p = await b.newPage({viewport:{width:640,height:480}});
const errs=[]; p.on('pageerror',e=>errs.push('ERR '+e.message)); p.on('console',m=>{ if(/unimplemented|error/i.test(m.text()) && !/404/.test(m.text())) errs.push(m.text().slice(0,140)); });
await p.goto(`http://localhost:8123/play.html?skip=male&scenario=00000000`);
await p.waitForFunction(()=>window.app?.scene?.win,null,{timeout:30000}); await p.waitForTimeout(500);
for (const [sc,entry] of route) {
  const prev=await p.evaluate(()=>window.app.scene.scenario);
  await p.evaluate(([sc,e])=>window.app.scene.exit(Number(sc),e),[sc,entry]);
  try { await p.waitForFunction(s=>window.app.scene?.scenario===s && window.app.scene.win && !window.app.scene.leaving,sc,{timeout:30000}); } catch(e){ console.log('FAILED to arrive',sc); break; }
  await p.waitForTimeout(500);
  const info=await p.evaluate(()=>{ const s=window.app.scene; const bosses=s.actors.filter(a=>a.enemy&&a.rec.boss!==undefined).map(a=>a.rec.name);
    return {sc:s.scenario, pos:[Math.round(s.player.x),Math.round(s.player.y)], blocked:s.map.blockedReal(s.player.x,s.player.y), open:s.openArea(s.player.x,s.player.y), hud:{lv:s.hud.level,hp:s.hud.hp}, enemies:s.actors.filter(a=>a.enemy).length, bosses, banner:s.banner?.text}; });
  console.log(prev,'->',JSON.stringify(info));
}
// kill every boss in the current scene to fire death scripts
const kills=await p.evaluate(()=>{ const s=window.app.scene; const r=[]; for(const a of s.actors.filter(a=>a.enemy&&a.rec.boss!==undefined)){ a.hp=1; s.hurtEnemy(a); r.push([a.rec.name,a.alive]); } return r; });
console.log('boss kills',JSON.stringify(kills)); await p.waitForTimeout(800);
console.log(JSON.stringify(await p.evaluate(()=>{const s=window.app.scene; return {dialog:!!s.dialog, exp:s.totalExp, level:s.hud.level, gold:s.win.gold, quests:[...s.vm.vars.entries()].filter(([k,v])=>v).length}})));
console.log('errors',errs.slice(0,8)); await b.close();
