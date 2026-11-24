// Goblin Shaman (model 5): casts bolts from range; monsters stagger when hit.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=01000004'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(1000);
console.log(JSON.stringify(await p.evaluate(async()=>{
  const g=window.game, sh=g.actors.find(a=>a.enemy&&a.rec.model===5&&a.alive); if(!sh) return 'no shaman';
  // park the hero 250px from the shaman on open ground, hide the other monsters
  for(const a of g.actors) if(a!==sh&&a.enemy) a.hidden=true;
  g.player.x=sh.x+200; g.player.y=sh.y+40; g.hud.hp=g.hud.hpMax=500;
  let shots=0,seen=0, t0=g.hud.hp; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<60;i++){ await wait(100); const n=g.bullets.length; if(n>seen) shots+=n-seen; seen=n; g.player.x=sh.x+200; g.player.y=sh.y+40; }
  const out={name:sh.rec.name, shots, hpLost:t0-g.hud.hp, dist:Math.round(Math.hypot(g.player.x-sh.x,g.player.y-sh.y))};
  // stagger
  const x0=sh.x; g.damage(sh,1); await wait(80); out.stun=sh.stun>0; await wait(400); out.moved=Math.round(sh.x-x0); return out; })));
console.log(errs); await b.close();
