// Monster attributes (Mct field 652) and the weakness wheel: Water level helps against Fire monsters.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=01000004'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(800);
console.log(JSON.stringify(await p.evaluate(()=>{
  const g=window.game, out={}; out.attrs=[...new Set(g.actors.filter(a=>a.enemy).map(a=>a.rec.name+':'+a.stats.attr))].slice(0,6);
  const w=g.win; out.neutral=g.wheel(0); w.attr[1]=5; out.waterVsFire=g.wheel(0); out.waterVsWater=g.wheel(1); w.attr[1]=0; w.attr[0]=-4; out.lowFire=g.wheel(0); return out; })));
console.log(errs); await b.close();
