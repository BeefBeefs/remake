// Town warehouse: chest object 10000300 (sentence 41) opens the storage panel; store and take out items.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=00000000'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(1000);
const info=await p.evaluate(()=>{const g=window.game,z=g.zones.find(z=>z.rec.id===10000300); if(!z) return null; g.win.inv.entries.length=0; g.win.inv.add(g.win.db.sections[0][0]); g.win.inv.add(g.win.db.sections[0].find(i=>i.name==='Speed Short Sword'),{unid:true}); g.player.x=z.x+40; g.player.y=z.y+60; return {x:z.x,y:z.y};});
console.log('chest', JSON.stringify(info)); if(!info){ await b.close(); process.exit(1); }
await p.waitForTimeout(700);
const pt=await p.evaluate(()=>{const g=window.game,z=g.zones.find(z=>z.rec.id===10000300),f=z.set_.pattern(z.rec.pat); return [z.x-g.camX+f.ox+f.canvas.width/2, z.y-g.camY+f.oy+f.canvas.height/2];});
const box=await p.evaluate(()=>{const r=document.querySelector('canvas').getBoundingClientRect(); return [r.left,r.top,r.width/640,r.height/480];});
await p.mouse.click(box[0]+pt[0]*box[2], box[1]+pt[1]*box[3]); await p.waitForTimeout(400);
await p.screenshot({path:'/tmp/wh_open.png'});
console.log('open', await p.evaluate(()=>!!window.game.shop));
// store the first inventory item: click its cell in the item window (GRID 335,71)
await p.mouse.click(box[0]+(335+16)*box[2], box[1]+(71+16)*box[3]); await p.waitForTimeout(200);
console.log('stored', await p.evaluate(()=>[window.game.win.inv.entries.length, window.game.win.wh.entries.length]));
await p.mouse.click(box[0]+(15+16)*box[2], box[1]+(40+16)*box[3]); await p.waitForTimeout(200);
console.log('taken back', await p.evaluate(()=>[window.game.win.inv.entries.length, window.game.win.wh.entries.length]));
await p.mouse.click(box[0]+(335+16)*box[2], box[1]+(71+16)*box[3]); await p.waitForTimeout(200);
await p.screenshot({path:'/tmp/wh_stored.png'});
console.log(errs); await b.close();
