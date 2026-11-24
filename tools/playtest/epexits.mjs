// Every map exit (script sentence 17) and every warp-gate row (Table.Tbd 40) of an episode must lead to a scenario that exists in that episode's data chain.
// usage: node tools/playtest/epexits.mjs [eps=1,2,3,4]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const eps = (process.argv[2] ?? '1,2,3,4').split(',').map(Number);
const b = await chromium.launch({ args: ['--no-sandbox'] }); let p; let bad = 0;
for (const ep of eps) {
  const ids = fs.readdirSync(`public/data/ep${ep}/scenario`).filter(f => f.endsWith('.script.json')).map(f => f.slice(0, 8));
  const dests = new Map(); let gates = null;
  for (const sc of ids) {
    if (p) await p.close().catch(() => {}); p = await b.newPage({ viewport: { width: 640, height: 480 } });
    await p.goto(`http://localhost:8123/play.html?skip=male&ep=${ep}&scenario=${sc}`);
    try { await p.waitForFunction(() => window.app?.scene?.vm, null, { timeout: 30000 }); } catch { console.log(`ep${ep} ${sc}: no scene`); bad++; continue; }
    const r = await p.evaluate(() => {
      const g = window.game, vm = g.vm, out = []; g.exit = (i, e) => out.push([i, e]); g.travel = () => {}; g.openDialog = () => {};
      for (let round = 0; round < 2; round++) for (const [, s, c] of vm.data.status) { if (c === 4294967295) continue; try { if (s === 0) { vm.talk(c); for (let i = 0; i < 40 && vm.queue.length; i++) vm.advance(0); } else vm.event(s, c); for (let i = 0; i < 40 && vm.queue.length; i++) vm.advance(0); } catch {} }
      const t = g.tables['40']; return { out, gates: t ? Array.from({ length: t.v.length / t.cols }, (_, i) => [t.v[i * t.cols + 1], t.v[i * t.cols + 2]]) : [] };
    });
    gates ??= r.gates; for (const [i, e] of r.out) (dests.get(i) ?? dests.set(i, new Set()).get(i)).add(`${sc}->${e}`);
  }
  for (const [i] of gates) if (i > 0 && !dests.has(i)) dests.set(i, new Set(['gate']));
  const missing = []; let gateMiss = 0;
  for (const [i, from] of [...dests].sort((a, b) => a[0] - b[0])) {
    const id = String(i).padStart(8, '0'); const have = [1, 2, 3, 4].some(k => k <= ep && fs.existsSync(`public/data/ep${k}/scenario/${id}.script.json`));   // the overlay chain: ep1 .. epN
    if (!have && [...from].every(f => f === 'gate')) { gateMiss++; continue; }   // gate-table rows of areas that belong to a later episode / online play are simply unavailable (banner)
    if (!have) missing.push(`${id} (from ${[...from].slice(0, 2).join(', ')})`);
  }
  console.log(`Episode ${ep}: ${dests.size} destinations, ${missing.length} missing exits (+${gateMiss} gate rows of unavailable areas)${missing.length ? ': ' + missing.join('; ') : ''}`); bad += missing.length;
}
await b.close(); process.exit(bad ? 1 : 0);
