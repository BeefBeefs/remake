// Quest 28 completes when 03110000 is entered through entry 2 (sentence 50 = arrival entry). usage: node tools/playtest/quest28.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await b.newPage({ viewport: { width: 640, height: 480 } });
p.on('pageerror', e => console.log('err', e.message));
await p.goto('http://localhost:8123/play.html?skip=male&ep=4&scenario=03110001'); await p.waitForFunction(() => window.game?.vm, null, { timeout: 60000 }); await p.waitForTimeout(1200);
await p.evaluate(() => { const g = window.game; g.vm.globals.set('q:28', 1); g.travel('03110000', 2); });
await p.waitForFunction(() => window.game?.scenario === '03110000', null, { timeout: 30000 }); await p.waitForTimeout(1500);
const r = await p.evaluate(() => ({ q: window.game.vm.globals.get('q:28'), arrival: window.game.arrivalEntry }));
console.log(JSON.stringify(r)); const ok = r.q === 2 && r.arrival === 2; console.log(ok ? 'PASS' : 'FAIL'); if (!ok) process.exitCode = 1; await b.close();
