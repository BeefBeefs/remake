// Which quest items do the scripts of an episode ask for (hasItem / takeItem calls seen while firing every handler), and which drop levels do their chests (sentence 24) use at run time?
// Prints needs and the observed drop levels as JSON (see docs/PROGRESS.md "Quest item sources"). usage: node tools/playtest/epitems.mjs ep [out.json]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const ep = +(process.argv[2] ?? 4), out = process.argv[3];
const ids = [...new Set([1, 2, 3, 4].filter(k => k <= ep).flatMap(k => fs.readdirSync(`public/data/ep${k}/scenario`).filter(f => f.endsWith('.script.json')).map(f => f.slice(0, 8))))].sort();
const b = await chromium.launch({ args: ['--no-sandbox'] }); let p; const needs = {}, levels = {};
for (const sc of ids) {
  if (p) await p.close().catch(() => {}); p = await b.newPage({ viewport: { width: 640, height: 480 } });
  await p.goto(`http://localhost:8123/play.html?skip=male&ep=${ep}&scenario=${sc}`);
  try { await p.waitForFunction(() => window.app?.scene?.vm, null, { timeout: 30000 }); } catch { continue; }
  const r = await p.evaluate(() => {
    const g = window.game, vm = g.vm, h = vm.hooks, needs = [], levels = []; g.travel = () => {}; g.openDialog = () => {}; g.hud.level = 40;
    const hi = h.hasItem, ti = h.takeItem, rd = h.randomDrop;
    h.hasItem = (c, i) => { needs.push(`${c}:${i}`); return hi(c, i); }; h.takeItem = (c, i) => { needs.push(`${c}:${i}`); return ti(c, i); }; h.randomDrop = (l, a, b) => { levels.push(l); };
    const drain = ch => { for (let i = 0; i < 40 && vm.queue.length; i++) vm.advance(ch); };
    for (let round = 0; round < 6; round++) { try { vm.poll(); } catch {} for (const [, s, c] of vm.data.status) { if (c === 4294967295) continue; try { if (s === 0) { vm.talk(c); drain(round % 3); } else { vm.event(s, c); drain(round % 3); } } catch {} } }
    return { needs: [...new Set(needs)], levels: [...new Set(levels)] };
  });
  for (const n of r.needs) (needs[n] ??= []).push(sc); for (const l of r.levels) (levels[l] ??= []).push(sc);
}
await b.close(); const res = { ep, needs, levels }; if (out) fs.writeFileSync(out, JSON.stringify(res)); console.log(JSON.stringify(res).slice(0, 3000));
