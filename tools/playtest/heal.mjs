// Syria (NPC 12000002) heals HP/MP/dog via sentences 42/43/63 (compare) and 7/8 (restore).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=00000000'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(800);
console.log(JSON.stringify(await p.evaluate(()=>{
  const g=window.game, vm=g.vm, out=[];
  for(const q of [[0,0],[0,1],[0,2],[1,1],[1,2],[2,1],[2,2],[3,1],[3,2]]){
    vm.globals.clear(); vm.vars.set('4:1000002',0); vm.globals.set('q:'+q[0],q[1]); g.hud.hp=10; g.hud.mp=1;
    const m=[]; vm.talk(12000002); let n=0; while(vm.pending&&n++<12){ m.push(vm.pending.msg-1000000); vm.advance(0); }
    out.push(q.join('=')+' msgs '+m.join(',')+' hp '+g.hud.hp+'/'+g.hud.hpMax+' mp '+g.hud.mp+'/'+g.hud.mpMax);
  } return out; })));
console.log(errs); await b.close();
