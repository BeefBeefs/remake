// Quest reachability by script: for every scenario of an episode, fires all handlers repeatedly (talks answered with option 0, then 1, then 2; kills; zone events; polls)
// and records the highest state each quest (sentence 62) reaches: 1 accepted, 2 done. Quests whose conditions need items, other maps' flags or specific drops stay lower.
// CHEAT=1: the hero carries every item (hasItem always true, takeItem free) and has 10 million gold, to see which quests the scripts can finish when only the items are missing.
// This is the first version (options 0/1/2 by round); epquests2.mjs explores every dialogue branch.
// usage: [CHEAT=1] node tools/playtest/epquests.mjs [eps=1,2,3,4]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const cheat = !!process.env.CHEAT;
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
    globals = await p.evaluate(async ({ batch, globals, cheat }) => {
      const { GameScene } = await import('./js/game.js');
      let g = window.game; g.vm.globals = new Map(globals); g.hud.level = 40;   // a strong hero: level checks of quest givers pass
      for (let k = 0; k < batch.length; k++) {
        if (k) { g.save?.(); window.app.go(await GameScene.create(window.app, 'male', 'SHADOW', { scenario: batch[k], carry: g })); await new Promise(r => setTimeout(r, 300)); g = window.game; g.hud.level = 40; }
        if (!g.vm) continue; const vm = g.vm; if (cheat) { vm.hooks.hasItem = () => true; vm.hooks.takeItem = () => {}; g.win.gold = 10000000; } g.travel = () => {}; g.openDialog = () => {};
        const drain = ch => { for (let i = 0; i < 40 && vm.queue.length; i++) vm.advance(ch); };
        for (let round = 0; round < 6; round++) {
          try { vm.poll(); } catch {}
          for (const [, s, c] of vm.data.status) { if (c === 4294967295) continue; try { if (s === 0) { vm.talk(c); drain(round % 3); } else { vm.event(s, c); drain(round % 3); } } catch {} }
        }
      }
      return [...g.vm.globals];
    }, { batch, globals, cheat });
  }
  const best = Object.fromEntries(globals.filter(([k, v]) => k.startsWith('q:') && v > 0).map(([k, v]) => [k.slice(2), v]));
  const qs = Object.keys(best).map(Number).sort((a, b) => a - b), done = qs.filter(q => best[q] >= 2), acc = qs.filter(q => best[q] === 1);
  console.log(`Episode ${ep}: ${all.length} scenarios, quests started ${qs.length}, completed by script alone ${done.length}, accepted only ${acc.length}: [${acc.join(',')}]`);
}
await b.close();
