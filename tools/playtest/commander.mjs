// Cold Svalt commander (12000000) quest ladder: complete quests 4..10 one after the other and talk to him each time; prints the message ids, his state variable, gold/exp and the quest states.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=01000000'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(800);
const talk=(done)=>p.evaluate((done)=>{const g=window.game, vm=g.vm; for(const q of done) vm.globals.set('q:'+q,2);
  const m=[]; for(let k=0;k<3;k++){ vm.talk(12000000); let n=0; while(vm.pending&&n++<30){ m.push(vm.pending.msg); vm.advance(0);} m.push('|'); }
  return {m:m.join(','), v2:vm.vars.get('4:1000002'), q:[...vm.globals].filter(([k])=>k.startsWith('q:')).map(([k,v])=>k.slice(2)+'='+v).join(' '), gold:g.win.gold, exp:g.totalExp, inv:g.win.inv.entries.length}; }, done);
let done=[]; console.log('start',JSON.stringify(await talk(done)));
for (const q of [4,5,6,7,8,9,10]) { done.push(q); console.log('after q'+q, JSON.stringify(await talk(done))); }
console.log(errs); await b.close();
