// Every script handler is bound to a character number: 10000000+n map zones, 12000000+id NPCs / objects, 14000000+id monsters (kill events). Checks that the object a handler waits for exists in the
// scenario (zone in the Mct zone list, NPC / monster among the actors) for the effective data of an episode. usage: node tools/playtest/epbind.mjs [eps=1,2,3,4]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const eps = (process.argv[2] ?? '1,2,3,4').split(',').map(Number);
const b = await chromium.launch({ args: ['--no-sandbox'] }); let p;
for (const ep of eps) {
  const all = [...new Set([1, 2, 3, 4].filter(k => k <= ep).flatMap(k => fs.readdirSync(`public/data/ep${k}/scenario`).filter(f => f.endsWith('.script.json')).map(f => f.slice(0, 8))))].sort();
  const miss = {}; let total = 0, ok = 0;
  for (const sc of all) {
    if (p) await p.close().catch(() => {}); p = await b.newPage({ viewport: { width: 640, height: 480 } });
    await p.goto(`http://localhost:8123/play.html?skip=male&ep=${ep}&scenario=${sc}`);
    try { await p.waitForFunction(() => window.app?.scene?.vm, null, { timeout: 30000 }); } catch { miss[sc] = ['no scene']; continue; }
    const r = await p.evaluate(() => {
      const g = window.game, vm = g.vm, bad = [], seen = new Set(); let total = 0;
      const ids = new Set(g.actors.map(a => a.rec.id)), zones = new Set(g.zones.map(z => z.rec.id));
      for (const [, s, c] of vm.data.status) {
        if (c === 4294967295 || seen.has(s + ':' + c)) continue; seen.add(s + ':' + c); total++;
        const cls = Math.floor(c / 1000000), id = c % 1000000;
        const has = cls === 10 ? zones.has(c) : cls === 11 || cls === 12 || cls === 13 || cls === 14 ? (ids.has(id) || zones.has(c)) : true;
        if (!has) bad.push(`${s}:${c}`);
      }
      return { total, bad };
    });
    total += r.total; ok += r.total - r.bad.length; if (r.bad.length) miss[sc] = r.bad;
  }
  const n = Object.values(miss).reduce((a, v) => a + v.length, 0);
  console.log(`Episode ${ep}: ${total} handler bindings, ${ok} found, ${n} without a matching zone / actor in ${Object.keys(miss).length} scenarios`);
  for (const [sc, v] of Object.entries(miss)) console.log(`  ${sc}: ${v.slice(0, 8).join(" ")}`);
}
await b.close();
