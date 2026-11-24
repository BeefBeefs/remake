// For every Episode 1 scenario: fire each status-4 (monster killed) handler through the real VM and report quest/global changes + dialogs. Optional arg: scenario ids.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const ids = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync('public/data/ep1/scenario').filter(f=>f.endsWith('.script.json')).map(f=>f.slice(0,8));
const b = await chromium.launch({args:['--no-sandbox']}); const ctx = await b.newContext({viewport:{width:640,height:480}});
for (const sc of ids) {
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  try {
    await p.goto(`http://localhost:8123/play.html?skip=male&scenario=${sc}`); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(800);
    const r = await p.evaluate(()=>{ const g=window.game, vm=g.vm; const out=[];
      const kills=vm.data.status.filter(s=>s[1]===4).map(s=>s[2]);
      for (const c of kills) { const before=JSON.stringify([...vm.globals]); const had=vm.event(4,c); const after=JSON.stringify([...vm.globals]);
        out.push({c, msgs: vm.queue.map(q=>q.msg), changed: before!==after ? after : null}); vm.queue.length=0; vm.talking=false; }
      return {kills:out, mons:g.actors.filter(a=>a.enemy).length}; });
    if (r.kills.length) console.log(sc, 'monsters', r.mons, JSON.stringify(r.kills.map(k=>[k.c-14000000, k.msgs.length, k.changed?'G':'-'])));
  } catch(e){ errs.push(String(e)); }
  if (errs.length) console.log(sc,'ERR',errs.slice(0,2));
  await p.close();
}
await b.close();
