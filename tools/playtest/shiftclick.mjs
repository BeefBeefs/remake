// Shift + mouse = attack in place; Ctrl = run; plain CapsLock swaps equipment sets.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=01000004'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(1000);
console.log(JSON.stringify(await p.evaluate(async()=>{
  const g=window.game, inp=g.app.input, wait=ms=>new Promise(r=>setTimeout(r,ms));
  const e=g.actors.find(a=>a.enemy&&a.alive&&a.rec.model!==5); for(const a of g.actors) if(a!==e&&a.enemy) a.hidden=true;
  e.hp=e.hpMax=9999; g.hud.hp=g.hud.hpMax=9999; g.player.x=e.x-30; g.player.y=e.y; const out={};
  // shift + click far from the hero: he stays, swings at air
  await wait(100); const x0=g.player.x, y0=g.player.y;
  inp.keys.add('shift'); inp.x=500; inp.y=100; inp.down=true; await wait(800);
  out.airMoved=Math.round(Math.hypot(g.player.x-x0,g.player.y-y0)); inp.down=false; inp.keys.delete('shift');
  // shift + click on the adjacent enemy: he hits it without moving
  g.player.x=e.x-30; g.player.y=e.y; await wait(100); const h0=e.hp, px=g.player.x;
  inp.keys.add('shift'); inp.x=e.x-g.camX; inp.y=e.y-g.camY-20; inp.down=true; await wait(1500);
  out.dmg=h0-e.hp; out.moved=Math.round(Math.abs(g.player.x-px)); inp.down=false; inp.keys.delete('shift');
  // ctrl = run
  g.player.x=e.x-300; g.player.y=e.y-300; g.target=null; await wait(100); const a0=g.player.x;
  inp.keys.add('d'); inp.keys.add('control'); await wait(500); out.ctrlRun=Math.round(g.player.x-a0); inp.keys.delete('control'); const b0=g.player.x; await wait(500); out.walk=Math.round(g.player.x-b0); inp.keys.delete('d');
  // plain capslock
  const s0=g.win.inv.set; inp.pressed.add('capslock'); await wait(100); out.set=[s0,g.win.inv.set]; return out; })));
console.log(errs); await b.close();
