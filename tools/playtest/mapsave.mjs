import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
await p.goto('http://localhost:8123/play.html?skip=male&scenario=00000001'); await p.waitForFunction(()=>window.app?.scene?.magic,null,{timeout:40000}); await p.waitForTimeout(800);
const G=()=>p.evaluate(()=>{const g=window.game; return {hp:g.hud.hp,mp:g.hud.mp,sel:g.magic.sel,bar:g.magic.bar,shots:g.shots.length,lv:[...g.magic.prog]}});
await p.keyboard.press('m'); await p.waitForTimeout(200); await p.screenshot({path:'/tmp/m1.png'});
await p.evaluate(()=>{const g=window.game; g.magic.learn(602); g.magic.learn(603); g.magic.learn(610); g.magic.learn(615); g.magic.learn(621); g.magic.learn(617); g.magic.learn(618);});
await p.waitForTimeout(100);
await p.mouse.move(120,70); await p.waitForTimeout(100); await p.screenshot({path:'/tmp/m2.png'});
await p.mouse.click(120,320+0); // click on row? (row 5 y=302..352)
await p.mouse.move(200,400); await p.waitForTimeout(100);
console.log('after click', JSON.stringify(await G()));
await p.keyboard.press('m'); await p.waitForTimeout(100);
// heal test
await p.evaluate(()=>{const g=window.game; g.hud.hp=30; g.hud.mp=150;});
await p.keyboard.press('F1'); await p.mouse.move(320,200); await p.mouse.down({button:'right'}); await p.waitForTimeout(60); await p.mouse.up({button:'right'}); await p.waitForTimeout(150);
console.log('after heal (F1)', JSON.stringify(await G()));
// bolt test vs enemy
const en = await p.evaluate(()=>{const g=window.game; const e=g.actors.filter(a=>a.enemy&&a.alive).sort((a,b)=>Math.hypot(a.x-g.player.x,a.y-g.player.y)-Math.hypot(b.x-g.player.x,b.y-g.player.y))[0]; if(!e) return null; g.player.x=e.x-180; g.player.y=e.y; return {hp:e.hp,name:e.name,x:e.x,y:e.y};});
console.log('enemy', JSON.stringify(en)); await p.waitForTimeout(300);
const scr = await p.evaluate(()=>{const g=window.game; const e=g.actors.filter(a=>a.enemy&&a.alive).sort((a,b)=>Math.hypot(a.x-g.player.x,a.y-g.player.y)-Math.hypot(b.x-g.player.x,b.y-g.player.y))[0]; return [e.x-g.camX, e.y-g.camY-40, e.hp, g.hud.mp];});
console.log('enemy screen', scr);
await p.keyboard.press('F2'); await p.mouse.move(scr[0],scr[1]); await p.mouse.down({button:'right'}); await p.waitForTimeout(60); await p.mouse.up({button:'right'});
await p.waitForTimeout(120); await p.screenshot({path:'/tmp/m3.png'}); await p.waitForTimeout(700);
console.log('after bolt', JSON.stringify(await G()), await p.evaluate(()=>{const g=window.game; const e=g.actors.filter(a=>a.enemy).sort((a,b)=>Math.hypot(a.x-g.player.x,a.y-g.player.y)-Math.hypot(b.x-g.player.x,b.y-g.player.y))[0]; return [e.hp, e.alive];}));
// map test
await p.keyboard.press('n'); await p.waitForTimeout(300); await p.screenshot({path:'/tmp/m4.png'});
await p.keyboard.down('ArrowRight'); await p.waitForTimeout(500); await p.keyboard.up('ArrowRight'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
console.log('pos', await p.evaluate(()=>[window.game.player.x,window.game.player.y,window.game.mapwin.encode()]).then(a=>JSON.stringify(a).slice(0,200)));
// save/restore roundtrip
const sv = await p.evaluate(()=>{const g=window.game; g.save(); const d=JSON.parse(localStorage.getItem('shadowflare_save_slot'+g.slot)); return {magic:d.magic, explored:Object.keys(d.explored||{})};});
console.log('saved', JSON.stringify(sv).slice(0,300));
console.log('errors',errs); await b.close();
