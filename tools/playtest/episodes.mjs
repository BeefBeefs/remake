// Loads every scenario of Episode N's patch (plus the start scenario) with ?ep=N and reports load failures (404s, page errors) and the data of each scenario.
// usage: node tools/playtest/episodes.mjs [ep=1,2,3,4] [limit per episode]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const eps = (process.argv[2] ?? '1,2,3,4').split(',').map(Number), lim = +(process.argv[3] ?? 999);
const b = await chromium.launch({ args: ['--no-sandbox'] }); let p;
let errs = []; const hook = () => { p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('.script.json') && !/_sdw\.json$/.test(r.url())) errs.push(r.status() + ' ' + r.url().replace(/.*\/data\//, '')); }); };
for (const ep of eps) {
  const dir = `public/assets/ep${ep}/Scenario`; const ids = (fs.existsSync(dir) ? fs.readdirSync(dir) : ['00000000']).filter(i => !i.startsWith('9')).slice(0, lim);
  let ok = 0, bad = [];
  for (const sc of ids) {
    errs = []; if (p) await p.close().catch(() => {}); p = await b.newPage({ viewport: { width: 640, height: 480 } }); hook();   // a fresh page per scenario (a long-lived one runs out of memory)
    await p.goto(`http://localhost:8123/play.html?skip=male&ep=${ep}&scenario=${sc}`);
    try { await p.waitForFunction(() => window.app?.scene?.win, null, { timeout: 30000 }); await p.waitForTimeout(250); } catch { errs.push('TIMEOUT'); }
    const info = await p.evaluate(() => { const s = window.app.scene; return s?.actors ? { map: s.mapName ?? '', actors: s.actors.length, ep: window.Data?.ep } : null; }).catch(() => null);
    if (errs.length || !info) bad.push(`${sc}: ${[...new Set(errs)].slice(0, 4).join(' | ') || 'no scene'}`); else ok++;
  }
  console.log(`Episode ${ep}: ${ok}/${ids.length} scenarios loaded`); bad.forEach(x => console.log('  ' + x));
}
await b.close();
