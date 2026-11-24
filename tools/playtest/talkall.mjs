// Talk to every scripted NPC/object of the given scenarios (default: all), auto-answering each message with option 0 then 1; reports unimplemented sentence warnings and stuck dialogs.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const ids = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync('public/data/ep1/scenario').filter(f=>f.endsWith('.script.json')).map(f=>f.slice(0,8));
const b = await chromium.launch({args:['--no-sandbox']}); const ctx = await b.newContext({viewport:{width:640,height:480}});
for (const sc of ids) {
  const p = await ctx.newPage(); const warns=[]; p.on('console',m=>{ if(/unimpl|unknown|sentence/i.test(m.text())) warns.push(m.text().slice(0,100)); }); p.on('pageerror',e=>warns.push('ERR '+e.message));
  await p.goto(`http://localhost:8123/play.html?skip=male&scenario=${sc}`); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(600);
  const r = await p.evaluate(()=>{ const g=window.game, vm=g.vm; const out=[];
    const chars=[...new Set(vm.data.status.filter(s=>s[1]===0).map(s=>s[2]))];
    for (const pick of [0,1]) for (const c of chars) {
      let steps=0, msgs=0; vm.talk(c);
      while (vm.pending && steps++<60) { msgs++; const q=vm.pending; vm.advance(q.resultVar ? pick : 0); }
      if (steps>=60) out.push(['STUCK',c]);
    }
    vm.queue.length=0; return {chars:chars.length,out}; });
  if (r.out.length || warns.length) console.log(sc, JSON.stringify(r), [...new Set(warns)].slice(0,4)); else console.log(sc,'ok',r.chars);
  await p.close();
}
await b.close();
