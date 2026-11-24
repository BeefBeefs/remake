import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
await p.goto('http://localhost:8123/play.html?skip=male&scenario=00000001'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(1000);
await p.evaluate(()=>window.game.swapPet(0)); await p.waitForTimeout(1200);
// find an open spot ~150px right of the player
const tgt = await p.evaluate(()=>{const g=window.game; for(const [dx,dy] of [[150,0],[-150,0],[0,120],[0,-120],[120,80]]){ const x=g.player.x+dx,y=g.player.y+dy; if(!g.map.blockedReal(x,y)) return [x-g.camX, y-g.camY-30, x, y]; } return null; });
console.log('target', tgt);
await p.keyboard.down('Tab'); await p.mouse.move(tgt[0],tgt[1]); await p.waitForTimeout(80); await p.mouse.down(); await p.waitForTimeout(60); await p.mouse.up(); await p.waitForTimeout(150);
console.log('jumping', await p.evaluate(()=>[window.game.pet.state]));
await p.screenshot({path:'/tmp/jump.png'}); await p.waitForTimeout(1200);
console.log('landed', await p.evaluate((t)=>[window.game.pet.state, Math.round(window.game.pet.x), Math.round(window.game.pet.y), 'target', Math.round(t[2]), Math.round(t[3])], tgt));
await p.mouse.move(tgt[0]+60,tgt[1]); await p.waitForTimeout(60); await p.mouse.down({button:'right'}); await p.waitForTimeout(60); await p.mouse.up({button:'right'}); await p.waitForTimeout(250);
console.log('dash', await p.evaluate(()=>[window.game.pet.state]));
await p.screenshot({path:'/tmp/dash.png'});
await p.keyboard.up('Tab'); await b.close();
