// Extra gear slots: max HP/MP from armor, M.Defense, walking speed, attribute harmony.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=01000004'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(1000);
console.log(JSON.stringify(await p.evaluate(async()=>{
  const g=window.game, w=g.win, i=w.inv, wait=ms=>new Promise(r=>setTimeout(r,ms)), out={}; i.entries.length=0; await wait(300);
  const f=n=>w.db.sections.flat().find(x=>x.name===n);
  out.hp0=g.hud.hpMax; i.add(f('Stamina Leather Cloth')); i.toggleEquip(i.entries[0]); await wait(300); out.hpStamina=g.hud.hpMax;
  i.entries.length=0; i.add(f('Wizard\'s Leather Cloth')); i.toggleEquip(i.entries[0]); await wait(300); out.mdef=w.mdef(); w.status=true; await wait(200);
  out.mp0=g.hud.mpMax; i.entries.length=0; i.add(f("Mind's Leather Cloth")); i.toggleEquip(i.entries[0]); await wait(300); out.mpMind=g.hud.mpMax;
  i.entries.length=0; w.attr=[10,10,0,0,0,0,0,0]; out.harm=g.harmony().on; w.attr=[0,0,0,0,0,0,0,0]; return out; })));
console.log(errs); await b.close();
