import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const mk=(n,g,lv,sc,area)=>({v:1,slot:0,at:Date.now(),area,name:n,gender:g,scenario:sc,x:12967,y:9457,hud:{hp:150,hpMax:150,mp:150,mpMax:150,level:lv,exp:10,expMax:50,running:false},totalExp:120,gold:340,inv:[],vars:{},globals:[],ground:{}});
await p.addInitScript(([a,c])=>{ if(!localStorage.getItem('seeded')){ localStorage.setItem('shadowflare_save_slot0',JSON.stringify(a)); localStorage.setItem('shadowflare_save_slot3',JSON.stringify(c)); localStorage.setItem('seeded','1'); } },[mk('SHADOW','male',4,'00000001','Near the Remote Town'),mk('AYLA','female',13,'00010000','Dusty Ruins, B1F')]);
await p.goto('http://localhost:8123/play.html'); await p.waitForFunction(()=>window.app?.scene?.t,null,{timeout:30000}); await p.waitForTimeout(600);
const click=async(x,y)=>{ await p.mouse.move(x,y); await p.waitForTimeout(100); await p.mouse.down(); await p.waitForTimeout(60); await p.mouse.up(); await p.waitForTimeout(400); };
const cls=()=>p.evaluate(()=>window.app.scene.constructor.name);
await p.screenshot({path:'/tmp/m_title3.png'}); console.log('title entries',await p.evaluate(()=>window.app.scene.visible()));
await click(300,400); console.log('after LOAD:',await cls());
await click(450,260); // slot 4 (AYLA)
await click(600,458); await click(320,247); // OK then SINGLE
await p.waitForFunction(()=>window.app.scene.constructor.name==='GameScene'&&window.app.scene.win,null,{timeout:40000}); await p.waitForTimeout(800);
console.log('game:',JSON.stringify(await p.evaluate(()=>{const s=window.app.scene; return {name:s.name,gender:s.gender,slot:s.slot,level:s.hud.level,scenario:s.scenario,area:s.areaName()};})));
await p.evaluate(()=>window.app.scene.save()); console.log('slot3 area saved:',await p.evaluate(()=>JSON.parse(localStorage.getItem('shadowflare_save_slot3')).area), 'slot0 intact:',await p.evaluate(()=>JSON.parse(localStorage.getItem('shadowflare_save_slot0')).name));
// back to title, delete slot 0
await p.evaluate(()=>window.app.scene.leaving=true); await p.goto('http://localhost:8123/play.html'); await p.waitForFunction(()=>window.app?.scene?.t,null,{timeout:30000}); await p.waitForTimeout(500);
await click(300,400); await click(150,100); await click(100,458); await p.screenshot({path:'/tmp/m_del.png'}); await click(265,283); // YES
console.log('slots after delete:',await p.evaluate(()=>[0,1,2,3,4,5].map(i=>!!localStorage.getItem('shadowflare_save_slot'+i))));
console.log('errors',errs); await b.close();
