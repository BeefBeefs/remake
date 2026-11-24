// Profession spell tree: spells are learned when the level / profession allows them.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=01000004'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(800);
console.log(JSON.stringify(await p.evaluate(async()=>{
  const g=window.game, wait=ms=>new Promise(r=>setTimeout(r,ms)), out={}; out.start=[...g.magic.known];
  g.hud.level=8; await wait(200); out.merc8=[...g.magic.known];
  g.win.career=2; g.hud.level=12; await wait(200); out.wizard12=[...g.magic.known]; out.banner=g.banner?.text; return out; })));
console.log(errs); await b.close();
