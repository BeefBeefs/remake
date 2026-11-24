// Variant item bonuses: Power Short Sword (+attack %), Speed Short Sword (+speed), Fire Gem (+1 Fire), unidentified items give nothing.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=01000004'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(800);
console.log(JSON.stringify(await p.evaluate(()=>{
  const w=window.game.win, db=w.db, i=w.inv, out={}; i.entries.length=0;
  const f=n=>db.sections.flat().find(x=>x.name===n); const sw=f('Short Sword'), pw=f('Power Short Sword'), sp=f('Speed Short Sword'), gem=f('Fire Gem');
  i.add(sw); i.toggleEquip(i.entries[0]); out.base=[w.stats().atkMax,w.stats().speed];
  i.entries.length=0; i.add(pw); i.toggleEquip(i.entries[0]); out.power=[w.stats().atkMax,w.bonusLines(pw)]; i.entries[0].unid=true; out.powerUnid=w.stats().atkMax; i.entries.length=0;
  i.add(sp); i.toggleEquip(i.entries[0]); out.speed=[w.stats().speed,w.bonusLines(sp)];
  i.add(gem); i.toggleEquip(i.entries[1]); out.fire=w.attrLv(0); out.gem=w.bonusLines(gem); return out; })));
console.log(errs); await b.close();
