// Sentence 75 (reward item): the hook puts the quest item into the bag. usage: node tools/playtest/giveitem.mjs (server on :8123)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await b.newPage({ viewport: { width: 640, height: 480 } });
p.on('pageerror', e => console.log('err', e.message));
await p.goto('http://localhost:8123/play.html?skip=male&ep=4&scenario=04000006'); await p.waitForFunction(() => window.game?.vm, null, { timeout: 60000 });
const r = await p.evaluate(() => { const g = window.game, h = g.vm.hooks, n0 = g.win.inv.entries.length; h.giveItem(4, 98000004); h.giveItem(4, 99000009); return { added: g.win.inv.entries.length - n0, has: h.hasItem(4, 98000004) && h.hasItem(4, 99000009), missing: (h.giveItem(4, 1234567), g.win.inv.entries.length - n0) }; });
console.log(JSON.stringify(r)); if (r.added !== 2 || !r.has) { console.log('FAIL'); process.exitCode = 1; } else console.log('PASS');
await b.close();
