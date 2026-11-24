// Merchant Malse (NPC 12000001): identify + repair services (sentences 4/9/52/55), durability wear and sell/ identify values.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=00000000'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(800);
console.log(JSON.stringify(await p.evaluate(()=>{
  const g=window.game, w=g.win, db=w.db, vm=g.vm, log=[];
  const sw=db.sections[0].find(i=>i.name==='Speed Short Sword'), ar=db.sections[1].find(i=>i.name==='Protective Leather Cloth');
  w.inv.entries.length=0; w.inv.add(sw,{unid:true}); w.inv.add(ar); w.inv.toggleEquip(w.inv.entries[0]); w.inv.toggleEquip(w.inv.entries[1]); w.gold=5000;
  w.inv.entries[1].dur=10; w.inv.entries[0].dur=100;
  vm.globals.set('11:6',2); vm.globals.set('q:0',1);
  const run=(label,choices)=>{ const m=[]; vm.talk(12000001); let n=0; const ch=[...choices];
    while(vm.pending&&n++<12){ const pd=vm.pending; m.push(pd.msg-1000000+(pd.resultVar?'?':'')); vm.advance(pd.resultVar?(ch.shift()??0):0); } log.push(label+': '+m.join(',')+' gold='+w.gold+' needsId='+w.needsIdentify()+' dur='+w.inv.entries.map(e=>e.dur)); };
  run('menu',[3]);          // QUIT
  run('identify',[1,0]);    // Identify -> YES
  run('repair',[2,0]);      // Repair -> first row...
  return log; })));
console.log(errs); await b.close();
