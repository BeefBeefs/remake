// An Episode-1 save continues in a higher episode from the LOAD DATA screen ("Continue in Episode N >" cycles save.ep..4); the character and the map stay, the data overlay changes.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await (await b.newContext({ viewport: { width: 640, height: 480 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/_sdw|404/.test(m.text())) errs.push(m.text()); });
await p.goto('http://localhost:8123/play.html?skip=male&ep=1'); await p.waitForFunction(() => window.app?.scene?.win, null, { timeout: 40000 }); await p.waitForTimeout(500);
const saved = await p.evaluate(() => { const g = window.game; g.win.gold = 4321; g.slot = 0; g.save?.(); const d = JSON.parse(localStorage.getItem('shadowflare_save_slot0') ?? 'null'); return d && { ep: d.ep, gold: d.gold }; });
console.log('saved', JSON.stringify(saved));
await p.goto('http://localhost:8123/play.html'); await p.waitForTimeout(1500);
await p.evaluate(async () => { const { LoadScene } = await import('./js/load.js'); window.app.go(await LoadScene.create(window.app)); });
await p.waitForTimeout(500);
await p.mouse.click(100, 100); await p.waitForTimeout(150);                     // slot 1
await p.mouse.click(150, 418); await p.waitForTimeout(150);                    // Continue in Episode 2
await p.mouse.click(150, 418); await p.waitForTimeout(150);                    // 3
await p.screenshot({ path: '/tmp/up1.png' });
const pick = await p.evaluate(() => window.app.scene.epOf());
await p.evaluate(() => window.app.scene.update && 0);
// OK -> mode window -> single
await p.evaluate(async () => { const s = window.app.scene; s.mode = null; const { GameScene } = await import('./js/game.js'); const d = s.slots[0]; s.busy = true; GameScene.create(window.app, d.gender, d.name, { scenario: d.scenario, load: d, slot: 0, ep: s.epOf() }).then(g => window.app.go(g)); });
await p.waitForFunction(() => window.app?.scene?.win, null, { timeout: 40000 }); await p.waitForTimeout(500);
const r = await p.evaluate(async () => ({ gold: window.game.win.gold, ep: (await import('./js/data.js')).Data.ep }));
console.log('picked', pick, 'loaded', JSON.stringify(r), 'errors', errs.slice(0, 3));
const ok = saved?.ep === 1 && pick === 3 && r.gold === 4321 && r.ep === 3 && !errs.length; console.log(ok ? 'UPGRADE OK' : 'UPGRADE FAIL'); await b.close(); process.exit(ok ? 0 : 1);
