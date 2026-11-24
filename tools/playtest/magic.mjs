import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('requestfailed',r=>errs.push('fail '+r.url())); p.on('response',r=>{ if(r.status()>=400) errs.push(r.status()+' '+r.url()); });
await p.goto('http://localhost:8123/play.html?skip=male&scenario=00000001'); await p.waitForFunction(()=>window.app?.scene?.magic,null,{timeout:40000}); await p.waitForTimeout(800);
await p.evaluate(()=>{ const m=window.app.scene.magic; m.learn(606); m.learn(601); });   // a new hero knows no spell any more (learning rule: career.ts)
const item=()=>p.evaluate(()=>window.game.win.item);
console.log('item at start', await item());
await p.keyboard.press('m'); await p.waitForTimeout(150);
await p.mouse.move(120,320); await p.waitForTimeout(80); await p.mouse.down(); await p.waitForTimeout(50); await p.mouse.up(); await p.waitForTimeout(150);
console.log('bar after click on row (known[5]?)', await p.evaluate(()=>[...window.game.magic.bar]), 'item', await item());
await p.keyboard.press('m'); await p.waitForTimeout(100);
await p.evaluate(()=>{const g=window.game; g.hud.mp=150; g.hud.hp=g.hud.hpMax;});
const en = await p.evaluate(()=>{const g=window.game; const es=g.actors.filter(a=>a.enemy&&a.alive).sort((a,b)=>Math.hypot(a.x-g.player.x,a.y-g.player.y)-Math.hypot(b.x-g.player.x,b.y-g.player.y)); 
  for (const e of es) for (let k=0;k<16;k++){ const ang=k*Math.PI/8, px=e.x+Math.cos(ang)*160, py=e.y+Math.sin(ang)*160; let ok=!g.map.blockedReal(px,py); for(let t=0;t<=1&&ok;t+=0.05) if(g.map.blockedReal(px+(e.x-px)*t, py+(e.y-py)*t)) ok=false; if(ok){ g.player.x=px; g.player.y=py; e.stats.dmg=[0,0]; return {name:e.name,hp:e.hp,id:es.indexOf(e)}; } }
  return null;});
console.log('enemy', JSON.stringify(en)); await p.waitForTimeout(400);
const scr = await p.evaluate(()=>{const g=window.game; const e=g.actors.filter(a=>a.enemy&&a.alive).sort((a,b)=>Math.hypot(a.x-g.player.x,a.y-g.player.y)-Math.hypot(b.x-g.player.x,b.y-g.player.y))[0]; return [e.x-g.camX, e.y-g.camY-40, e.hp, e.name];});
console.log('target', scr);
await p.keyboard.press('F2'); await p.mouse.move(scr[0],scr[1]); await p.waitForTimeout(60); await p.mouse.down({button:'right'}); await p.waitForTimeout(60); await p.mouse.up({button:'right'});
await p.waitForTimeout(150); await p.screenshot({path:'/tmp/m5.png'}); await p.waitForTimeout(800);
console.log('after bolt', await p.evaluate(()=>{const g=window.game; const e=g.actors.filter(a=>a.enemy&&a.name==='Goblin').sort((a,b)=>Math.hypot(a.x-g.player.x,a.y-g.player.y)-Math.hypot(b.x-g.player.x,b.y-g.player.y))[0]; return [e&&e.hp, g.hud.mp, g.floaters.map(f=>f.s)];}));
console.log('errors',errs); await b.close();
