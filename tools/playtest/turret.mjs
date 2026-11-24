// Garam Goblin room (00010004): the pillar turrets (type 6) should shoot at the hero when he is within 2000 world units.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=00010004'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(1000);
await p.evaluate(()=>{const g=window.game; for(const a of g.actors) a.hidden=true; });
let maxB=0, hp0=await p.evaluate(()=>window.game.hud.hp);
for (let i=0;i<24;i++){ await p.waitForTimeout(250); const n=await p.evaluate(()=>window.game.bullets.length); maxB=Math.max(maxB,n); }
await p.screenshot({path:'/tmp/turret.png'});
console.log('max bullets',maxB,'hp',hp0,'->',await p.evaluate(()=>window.game.hud.hp), errs);
await b.close();
