// Quest reachability by script, exploring EVERY dialogue branch (snapshot / restore of the VM state): for every scenario of an episode, fires all handlers repeatedly (talks answered with option 0, then 1, then 2; kills; zone events; polls)
// and records the highest state each quest (sentence 62) reaches: 1 accepted, 2 done. Quests whose conditions need items, other maps' flags or specific drops stay lower.
// CHEAT=1: the hero carries every item (hasItem always true, takeItem free) and has 10 million gold, to see which quests the scripts can finish when only the items are missing.
// env CHEAT=1 (all items, much gold), LEAVES=60 (dialogue paths tried per handler), ROUNDS=4. usage: node tools/playtest/epquests2.mjs [eps=1,2,3,4]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const cheat = !!process.env.CHEAT, LEAVES = +(process.env.LEAVES ?? 60), ROUNDS = +(process.env.ROUNDS ?? 4);
const eps = (process.argv[2] ?? '1,2,3,4').split(',').map(Number);
const b = await chromium.launch({ args: ['--no-sandbox'] }); let p;
for (const ep of eps) {
  const ids = fs.readdirSync(`public/data/ep${ep}/scenario`).filter(f => f.endsWith('.script.json')).map(f => f.slice(0, 8)).sort();
  const lowerIds = [1, 2, 3, 4].filter(k => k < ep).flatMap(k => fs.readdirSync(`public/data/ep${k}/scenario`).filter(f => f.endsWith('.script.json')).map(f => f.slice(0, 8)));
  const all = [...new Set([...lowerIds, ...ids])].sort();   // the whole chain visible in this episode
  let globals = [];   // quest and flag state carried from scenario to scenario (the game keeps it in the same way)
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < all.length; i += 6) {
    const batch = all.slice(i, i + 6);
    if (p) await p.close().catch(() => {}); p = await b.newPage({ viewport: { width: 640, height: 480 } });
    await p.goto(`http://localhost:8123/play.html?skip=male&ep=${ep}&scenario=${batch[0]}`);
    try { await p.waitForFunction(() => window.app?.scene?.vm, null, { timeout: 30000 }); } catch { continue; }
    globals = await p.evaluate(async ({ batch, globals, cheat, LEAVES, ROUNDS }) => {
      const { GameScene } = await import('./js/game.js');
      let g = window.game; g.vm.globals = new Map(globals); g.hud.level = 40;   // a strong hero: level checks of quest givers pass
      for (let k = 0; k < batch.length; k++) {
        if (k) { g.save?.(); window.app.go(await GameScene.create(window.app, 'male', 'SHADOW', { scenario: batch[k], carry: g })); await new Promise(r => setTimeout(r, 300)); g = window.game; g.hud.level = 40; }
        if (!g.vm) continue; const vm = g.vm; if (cheat) { vm.hooks.hasItem = () => true; vm.hooks.takeItem = () => {}; g.win.gold = 10000000; } g.travel = () => {}; g.openDialog = () => {};
        const snap = () => ({ v: new Map(vm.vars), g: new Map(vm.globals), q: vm.queue.slice(), t: vm.talking, e: vm.ended, c: vm.char });
        const restore = o => { vm.vars = new Map(o.v); vm.globals = new Map(o.g); vm.queue = o.q.slice(); vm.talking = o.t; vm.ended = o.e; vm.char = o.c; };
        const score = (base, o) => { let q = 0; for (const [k, v] of vm.globals) if (k.startsWith('q:')) q += v * 1000; let d = 0; for (const [k, v] of vm.vars) if (base.v.get(k) !== v) d++; return q + Math.min(d, 50); };
        const explore = start => {   // depth-first over every option of every message of one handler; keep the end state with the best score
          const base = snap(); let best = { s: score(base, base), st: base }, leaves = 0;
          const rec = depth => {
            if (leaves >= LEAVES) return;
            if (!vm.queue.length || depth > 14) { leaves++; const s = score(base, base); if (s > best.s) best = { s, st: snap() }; return; }
            const n = Math.max(1, (vm.queue[0].text.match(/~[^~]*~/g) || []).length), here = snap();
            for (let c = 0; c < n; c++) { restore(here); try { vm.advance(c); } catch {} rec(depth + 1); }
          };
          restore(base); try { start(); } catch {} rec(0); restore(best.st); vm.queue = []; vm.talking = false;
        };
        for (let round = 0; round < ROUNDS; round++) {
          try { vm.poll(); } catch {}
          for (const [, s, c] of vm.data.status) { if (c === 4294967295) continue; if (s === 0) explore(() => vm.talk(c)); else if (s === 1) continue; else { try { vm.event(s, c); vm.queue = []; vm.talking = false; } catch {} } }
        }
      }
      return [...g.vm.globals];
    }, { batch, globals, cheat, LEAVES, ROUNDS });
  }
  const best = Object.fromEntries(globals.filter(([k, v]) => k.startsWith('q:') && v > 0).map(([k, v]) => [k.slice(2), v]));
  const qs = Object.keys(best).map(Number).sort((a, b) => a - b), done = qs.filter(q => best[q] >= 2), acc = qs.filter(q => best[q] === 1);
  console.log(`Episode ${ep}: ${all.length} scenarios, quests started ${qs.length}, completed by script alone ${done.length}, accepted only ${acc.length}: [${acc.join(',')}]\n  started [${qs.join(',')}]\n  done [${done.join(',')}]`);
}
await b.close();
