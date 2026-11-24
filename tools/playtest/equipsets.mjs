// Change Equipment I/II (button + Shift+CapsLock), unidentified items cannot be equipped.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=00000000'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(800);
const st=()=>p.evaluate(()=>{const w=window.game.win,i=w.inv; return {set:i.set, eq:i.entries.map(e=>(e.eq?'E':'-')+(e.alt?'a':'-')).join(' '), atk:w.stats().atkMax};});
await p.evaluate(()=>{const w=window.game.win,db=w.db,i=w.inv; i.entries.length=0; i.add(db.sections[0][0]); i.add(db.sections[0].find(x=>x.name==='Long Sword')); i.add(db.sections[0].find(x=>x.name==='Speed Short Sword'),{unid:true}); i.toggleEquip(i.entries[0]); w.item=true;});
console.log('start', JSON.stringify(await st()));
await p.click('body',{position:{x:579,y:402}}); await p.waitForTimeout(100);
console.log('II (empty)', JSON.stringify(await st()));
await p.evaluate(()=>{const i=window.game.win.inv; i.toggleEquip(i.entries[1]); console.log(i.toggleEquip(i.entries[2]));});
console.log('II + long sword', JSON.stringify(await st()));
await p.click('body',{position:{x:551,y:402}}); await p.waitForTimeout(100);
console.log('back to I', JSON.stringify(await st()));
await p.keyboard.down('Shift'); await p.keyboard.press('CapsLock'); await p.keyboard.up('Shift'); await p.waitForTimeout(100);
console.log('shift+caps', JSON.stringify(await st()));
console.log('unid equip blocked:', await p.evaluate(()=>{const i=window.game.win.inv; return i.toggleEquip(i.entries[2])===false && !i.entries[2].eq;}));
console.log(errs); await b.close();
