// Two-handed arms disable the shield; arms classes (ranged = class 5).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=00000000'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(800);
console.log(JSON.stringify(await p.evaluate(()=>{const w=window.game.win,db=w.db,i=w.inv; i.entries.length=0;
  const sh=db.sections[1].find(x=>x.f['0']===2&&x.name===x.type), one=db.sections[0][0], two=db.sections[0].find(x=>x.name==='Zweihander'), bow=db.sections[0].find(x=>x.name==='Wood Bowgun');
  i.add(sh); i.add(one); i.add(two); i.add(bow); const E=n=>i.toggleEquip(i.entries[n]); const out={shield:sh.name};
  E(0); E(1); out.oneHand=w.stats().defense; E(2); out.twoHand=w.stats().defense; out.shieldOff=w.shieldOff(i.entries[0]);
  out.ranged=[db.constructor.name&&bow.f['0'], one.f['0']]; E(3); out.bow=w.stats().atkMax; return out;})));
console.log(errs); await b.close();
