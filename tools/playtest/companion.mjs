import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error'&&!/404/.test(m.text())) errs.push(m.text()); });
await p.goto('http://localhost:8123/play.html?skip=male&scenario=00000000'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(1200);
const S=()=>p.evaluate(()=>{const g=window.game; return {partner:g.partner, pet:g.pet&&{n:g.pet.name,hp:Math.round(g.pet.hp),max:g.pet.maxHp,lv:g.pet.level,k:g.pet.kills,mode:g.pet.mode,st:g.pet.state}, dlg:g.dlg&&g.dlg.lines.join('|').slice(0,120), power:g.powerT>0, fight:Math.round(g.fightT), mines:g.mines.length}});
console.log('start', JSON.stringify(await S()));
// 1) hire via the keeper NPC dialog
const npc = await p.evaluate(()=>{const g=window.game; const a=g.actors.find(a=>a.rec.kind==='partner'&&a.rec.name==='Kerberos'); g.player.x=a.x-70; g.player.y=a.y+10; return {x:a.x,y:a.y,hidden:a.hidden}}); await p.waitForTimeout(400);
const pos = await p.evaluate(()=>{const g=window.game; const a=g.actors.find(a=>a.rec.kind==='partner'&&a.rec.name==='Kerberos'); return [a.x-g.camX, a.y-g.camY-30]});
await p.mouse.move(pos[0],pos[1]); await p.waitForTimeout(80); await p.mouse.down(); await p.waitForTimeout(50); await p.mouse.up(); await p.waitForTimeout(300);
console.log('after talk', JSON.stringify(await S()));
const pick = async(label)=>{ const r=await p.evaluate((label)=>{const g=window.game; const d=g.dlg; if(!d) return null; const b=g.dlgBox(); const o=d.opts.find(([l,c0,c1])=>d.lines[l].slice(c0,c1).includes(label)); return o?[b.x+12+o[1]*6+8, b.y+12+o[0]*13+6]:null;},label); if(!r) {console.log('no option',label); return;} await p.mouse.move(r[0],r[1]); await p.waitForTimeout(60); await p.mouse.down(); await p.waitForTimeout(50); await p.mouse.up(); await p.waitForTimeout(250); };
await pick('Check Status'); console.log('status dlg', JSON.stringify(await S()));
await pick('OK'); await p.waitForTimeout(200); console.log('after ok', JSON.stringify(await S()));
// talk again and swap
await p.mouse.move(pos[0],pos[1]); await p.mouse.down(); await p.waitForTimeout(50); await p.mouse.up(); await p.waitForTimeout(300);
await pick('Swap Dogs'); await p.waitForTimeout(1500); console.log('after swap', JSON.stringify(await S()));
const hidden = await p.evaluate(()=>window.game.actors.find(a=>a.rec.kind==='partner'&&a.rec.name==='Kerberos').hidden); console.log('keeper hidden', hidden);
await p.screenshot({path:'/tmp/pet1.png'});
await p.goto('http://localhost:8123/play.html?skip=male&scenario=00000001'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(1200); await p.evaluate(()=>window.game.swapPet(0)); await p.waitForTimeout(1500); console.log('swap direct', JSON.stringify(await S()));
// 2) combat: put a goblin near
const en = await p.evaluate(()=>{const g=window.game; const e=g.actors.find(a=>a.enemy&&!a.gen); if(!e) return null; e.revive(g.player.x+120,g.player.y+10); e.stats.dmg=[1,1]; return {name:e.name,hp:e.hp}});
console.log('enemy', JSON.stringify(en)); await p.waitForTimeout(100);
await p.waitForTimeout(3500); console.log('after fight', JSON.stringify(await S()), await p.evaluate(()=>{const e=window.game.actors.find(a=>a.enemy&&!a.gen); return e&&[e.hp,e.state]}));
await p.screenshot({path:'/tmp/pet2.png'});
// 3) space toggle
await p.keyboard.press(' '); await p.waitForTimeout(150); console.log('space', JSON.stringify((await S()).pet));
await p.keyboard.press(' '); await p.waitForTimeout(150);
// 4) meat
await p.evaluate(()=>{const g=window.game; g.pet.hp=20; const it=g.win.db.find(3,20000000); g.win.inv.entries.push({item:it,x:0,y:0,w:1,h:1,eq:false}); });
await p.keyboard.press('1'); await p.waitForTimeout(150); console.log('after meat', JSON.stringify((await S()).pet));
// 5) mine
await p.evaluate(()=>{const g=window.game; const it=g.win.db.find(4,1); const [w,h]=[2,2]; g.win.inv.entries.push({item:it,x:3,y:0,w,h,eq:false}); const e=g.actors.find(a=>a.enemy&&!a.gen); e.revive(g.player.x+400,g.player.y); });
await p.keyboard.press('b'); await p.waitForTimeout(100); console.log('mine laid', JSON.stringify(await S()), await p.evaluate(()=>window.game.win.mineStock));
await p.evaluate(()=>{const g=window.game; const m=g.mines[0]; const e=g.actors.find(a=>a.enemy&&!a.gen); e.revive(m.x+10,m.y); e.hp=500; e.maxHp=500; e.stats.dmg=[0,0]; window.__ehp=e.hp;}); await p.waitForTimeout(900);
console.log('after mine', JSON.stringify(await S()), await p.evaluate(()=>{const e=window.game.actors.find(a=>a.enemy&&!a.gen); return [window.__ehp, e.hp]}));
await p.screenshot({path:'/tmp/pet3.png'});
// 6) power
await p.evaluate(()=>{window.game.fightT=12000}); await p.waitForTimeout(100); await p.keyboard.press('p'); await p.waitForTimeout(150); console.log('power', JSON.stringify(await S()));
// 7) TAB jump and dash
await p.evaluate(()=>{const g=window.game; g.powerT=0; g.actors.filter(a=>a.enemy).forEach(a=>{a.hp=0; a.die();}); g.pet.mode='inactive'; g.pet.x=g.player.x+40; g.pet.y=g.player.y; });
await p.keyboard.down('Tab'); await p.mouse.move(250,200); await p.waitForTimeout(80); await p.mouse.down(); await p.waitForTimeout(60); await p.mouse.up(); await p.waitForTimeout(120);
const jp = await p.evaluate(()=>{const g=window.game; return [g.pet.state, Math.round(g.pet.x), Math.round(g.pet.y), Math.round(g.player.x)]}); console.log('tab click ->', JSON.stringify(jp));
await p.waitForTimeout(1200); console.log('landed', JSON.stringify(await p.evaluate(()=>{const g=window.game; return [g.pet.state, Math.round(g.pet.x-g.camX), Math.round(g.pet.y-g.camY)]})));
await p.mouse.move(400,250); await p.waitForTimeout(80); await p.mouse.down({button:'right'}); await p.waitForTimeout(60); await p.mouse.up({button:'right'}); await p.waitForTimeout(150);
console.log('tab right ->', JSON.stringify(await p.evaluate(()=>[window.game.pet.state])));
await p.waitForTimeout(900); await p.keyboard.up('Tab');
// 8) status via TAB+click on pet
const pp = await p.evaluate(()=>{const g=window.game; return [g.pet.x-g.camX, g.pet.y-g.camY-20]}); await p.keyboard.down('Tab'); await p.mouse.move(pp[0],pp[1]); await p.waitForTimeout(80); await p.mouse.down(); await p.waitForTimeout(60); await p.mouse.up(); await p.keyboard.up('Tab'); await p.waitForTimeout(200);
console.log('pet status', JSON.stringify(await S()));
await p.screenshot({path:'/tmp/pet4.png'});
// 9) save/load pet
console.log('save', JSON.stringify(await p.evaluate(()=>{const g=window.game; g.save(); const d=JSON.parse(localStorage.getItem('shadowflare_save_slot'+g.slot)); return d.pet;})));
console.log('errors', errs); await b.close();
