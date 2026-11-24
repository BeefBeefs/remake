// Remote Town (scenario 0): for each quest state combination talk to every NPC and print the message ids.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=00000000'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(800);
const talkAll=(set)=>p.evaluate((set)=>{const g=window.game, vm=g.vm; for(const [q,s] of set) vm.globals.set('q:'+q,s);
  const chars=[...new Set(vm.data.status.filter(s=>s[1]===0).map(s=>s[2]))].filter(c=>c>=12000000&&c<13000000); const out=[];
  for(const c of chars){ const m=[]; for(let k=0;k<2;k++){ vm.talk(c); let n=0; while(vm.pending&&n++<30){ m.push(vm.pending.msg-1000000); vm.advance(0);} m.push('|'); } out.push(c-12000000+':'+m.join(',')); }
  return {q:[...vm.globals].filter(([k])=>k.startsWith('q:')).map(([k,v])=>k.slice(2)+'='+v).join(' '), out, gold:g.win.gold}; }, set);
for (const set of [[],[[0,1]],[[0,2]],[[1,1]],[[1,2]],[[2,1]],[[2,2]],[[3,1]],[[3,2],[5,2]]]) console.log(JSON.stringify(await talkAll(set)));
console.log(errs); await b.close();
