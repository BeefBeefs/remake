// Fires every script handler of every scenario of an episode (talk = status 0 / 1 chains with the first option, kills = status 4, polls) and reports
// unimplemented script sentence types and page errors. usage: node tools/playtest/epscripts.mjs [eps=2,3,4] [limit]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const eps = (process.argv[2] ?? '2,3,4').split(',').map(Number), lim = +(process.argv[3] ?? 999);
const b = await chromium.launch({ args: ['--no-sandbox'] }); let p;
const types = {}; const errs = [];
for (const ep of eps) {
  const dir = `public/data/ep${ep}/scenario`; const ids = fs.readdirSync(dir).filter(f => f.endsWith('.script.json')).map(f => f.slice(0, 8)).slice(0, lim);
  let fired = 0, talks = 0, scenes = 0; types[ep] = {};
  for (const sc of ids) {
    if (p) await p.close().catch(() => {}); p = await b.newPage({ viewport: { width: 640, height: 480 } });
    p.on('console', m => { const t = m.text(); const k = /unimplemented sentence type (\d+)/.exec(t); if (k) (types[ep][k[1]] ??= new Set()).add(sc); });
    p.on('pageerror', e => errs.push(`ep${ep} ${sc}: ${e.message.slice(0, 120)}`));
    await p.goto(`http://localhost:8123/play.html?skip=male&ep=${ep}&scenario=${sc}`);
    try { await p.waitForFunction(() => window.app?.scene?.vm, null, { timeout: 30000 }); } catch { errs.push(`ep${ep} ${sc}: no scene`); continue; }
    scenes++;
    const r = await p.evaluate(() => {
      const g = window.game, vm = g.vm; g.travel = () => {}; g.openDialog = () => {}; let fired = 0, talks = 0;
      const run = f => { try { f(); } catch (e) { console.warn('EXC ' + e.message); } };
      for (let round = 0; round < 2; round++) {
        run(() => vm.poll());
        for (const [, s, c] of vm.data.status) {
          if (c === 4294967295) continue; fired++;
          if (s === 0) run(() => { vm.talk(c); talks++; for (let i = 0; i < 40 && vm.queue.length; i++) vm.advance(0); });
          else if (s === 4 || s === 3 || s === 2 || s === 6 || s === 7) run(() => { vm.event(s, c); for (let i = 0; i < 40 && vm.queue.length; i++) vm.advance(0); });
        }
      }
      return { fired, talks };
    });
    fired += r.fired; talks += r.talks;
  }
  const t = types[ep]; console.log(`Episode ${ep}: ${scenes}/${ids.length} scenarios, ${fired} handlers fired, ${talks} talks; unimplemented sentence types: ${Object.keys(t).length ? Object.entries(t).map(([k, v]) => `${k} (${[...v].slice(0, 3).join(',')})`).join('  ') : 'none'}`);
}
console.log(errs.length ? errs.slice(0, 12).join('\n') : 'no page errors'); await b.close();
