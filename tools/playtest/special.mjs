// Gargoyle bolt (anim 7) and golem slam (anim 5) special attacks.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); 
for (const [sc,model] of [['01050002',3],['01000003',4]]) {
  const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(`http://localhost:8123/play.html?skip=male&scenario=${sc}`); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(1000);
  console.log(sc, JSON.stringify(await p.evaluate(async(model)=>{
    const g=window.game, m=g.actors.find(a=>a.enemy&&a.rec.model===model&&a.alive); if(!m) return 'none';
    for(const a of g.actors) if(a!==m&&a.enemy) a.hidden=true;
    g.hud.hp=g.hud.hpMax=9999; const wait=ms=>new Promise(r=>setTimeout(r,ms)); const seen=new Set(); let bullets=0, seenB=0, hp0=g.hud.hp;
    const dist = model===3?220:70;
    for(let i=0;i<80;i++){ g.player.x=m.x+dist; g.player.y=m.y; await wait(100); seen.add(m.animOv); if(g.bullets.length>seenB) bullets+=g.bullets.length-seenB; seenB=g.bullets.length; }
    return {name:m.rec.name, anims:[...seen], bullets, hpLost:hp0-g.hud.hp}; }, model)), errs);
}
await b.close();
