// Warrior Triple Attack: right click with the sword selected strikes three times (+40 %).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=01000004'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(1000);
console.log(JSON.stringify(await p.evaluate(async()=>{
  const g=window.game, inp=g.app.input, wait=ms=>new Promise(r=>setTimeout(r,ms)), out={};
  const e=g.actors.find(a=>a.enemy&&a.alive&&a.rec.model!==5); for(const a of g.actors) if(a!==e&&a.enemy) a.hidden=true;
  { const i=g.win.inv; i.entries.length=0; i.add(g.win.db.sections[0][0]); i.toggleEquip(i.entries[0]); } e.hp=e.hpMax=99999; g.hud.hp=g.hud.hpMax=99999; g.player.x=e.x-30; g.player.y=e.y; g.magic.sel=8;
  const run=async()=>{ const h0=e.hp; let hits=0, last=e.hp, tl=0; g.player.x=e.x-30; g.player.y=e.y; await wait(100); inp.x=e.x-g.camX; inp.y=e.y-g.camY-20; g.app.rawRight=true; for(let i=0;i<40;i++){ await wait(100); tl=Math.max(tl,g.tripleLeft); if(e.hp<last){hits++; last=e.hp;} } return {hits,maxTripleLeft:tl}; };
  g.hud.level=12; g.win.career=0; out.mercenary=await run();
  g.win.career=1; g.tripleCd=0; g.target=null; out.warrior=await run();
  g.win.career=1; g.hud.level=3; g.tripleCd=0; g.target=null; out.lowLevel=await run(); return out; })));
console.log(errs); await b.close();
