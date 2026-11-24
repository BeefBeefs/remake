// Script effects (sentence 36): effect sprite sets load and spawn.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('requestfailed',r=>errs.push('fail '+r.url()));
for (const sc of ['00000001','00010003']) {
  await p.goto(`http://localhost:8123/play.html?skip=male&scenario=${sc}`); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(1000);
  let max=0; for(let i=0;i<30;i++){ await p.waitForTimeout(200); max=Math.max(max, await p.evaluate(()=>window.game.fxList.length)); }
  console.log(sc, 'sets', await p.evaluate(()=>[...window.game.fxSets.keys()]), 'max live', max);
}
await p.screenshot({path:'/tmp/fx.png'}); console.log(errs); await b.close();
