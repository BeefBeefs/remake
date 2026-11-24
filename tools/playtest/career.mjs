// Career change: available after level 5 + enough melee/magic/ranged use; the Status window button opens a choice list; growth table follows the career.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=00000000'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(1000);
const box=await p.evaluate(()=>{const r=document.querySelector('canvas').getBoundingClientRect(); return [r.left,r.top,r.width/640,r.height/480];});
const click=(x,y)=>p.mouse.click(box[0]+x*box[2], box[1]+y*box[3]);
const st=()=>p.evaluate(()=>{const g=window.game; return {career:g.win.career, opts:g.win.careerOpts, lvl:g.hud.level, mpMax:g.hud.mpMax, hpMax:g.hud.hpMax};});
console.log('start', JSON.stringify(await st()));
await p.evaluate(()=>{const g=window.game; g.totalExp=g.expTable[3]+1; g.syncExp(); g.usage.magic=40; g.usage.melee=10; g.win.status=true;}); await p.waitForTimeout(300);
console.log('lvl5 + magic use', JSON.stringify(await st()));
await click(60,396); await p.waitForTimeout(150); await p.screenshot({path:'/tmp/career.png'});
const pick = await p.evaluate(()=>{const w=window.game.win; return w.careerMenu;}); console.log('menu', pick);
const y0=388-18-18; await click(60,y0+18+9); await p.waitForTimeout(200);
console.log('after pick', JSON.stringify(await st()));
console.log(errs); await b.close();
