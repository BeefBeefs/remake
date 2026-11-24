// Attribute levels: elemental medicines raise one attribute and lower its opposite; White Medicine resets; levels scale attack/defense.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=01000004'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(800);
console.log(JSON.stringify(await p.evaluate(async()=>{
  const g=window.game, w=g.win, i=w.inv, wait=ms=>new Promise(r=>setTimeout(r,ms)), out={}; i.entries.length=0;
  i.add(w.db.sections[0][0]); i.toggleEquip(i.entries[0]); out.atk0=w.stats().atkMax;
  const use=n=>{ const e=i.entries.find(x=>x.item.name===n); if(!e){ i.add(w.db.sections[3].find(x=>x.name===n)); } g.useItem(i.entries.find(x=>x.item.name===n)); };
  for(let k=0;k<4;k++) use('Fire Medicine'); out.fire=[...w.attr]; out.atk4=w.stats().atkMax;
  use('Water Medicine'); out.water=[...w.attr]; use('White Medicine'); out.reset=[...w.attr];
  w.status=true; await wait(300); return out; })));
await p.screenshot({path:'/tmp/attr.png'}); console.log(errs); await b.close();
