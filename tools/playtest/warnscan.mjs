import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const ep = process.argv[2] ?? '4';
const scs = [...new Set([1,2,3,4].filter(k => k <= +ep).flatMap(k => fs.readdirSync(`public/data/ep${k}/scenario`).filter(f => f.endsWith('.script.json')).map(f => f.slice(0, 8))))].sort();
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await b.newPage({ viewport: { width: 640, height: 480 } });
const bad = new Map(); let cur = '';
p.on('console', m => { const t = m.text(); if (!/404|Failed to load resource/.test(t) && /unimpl|warn|error|unknown|fail/i.test(t)) { const k = t.slice(0, 140); if (!bad.has(k)) bad.set(k, cur); } });
p.on('pageerror', e => { const k = 'PAGEERR ' + e.message.slice(0, 120); if (!bad.has(k)) bad.set(k, cur); });
for (const sc of scs) { cur = sc; try { await p.goto(`http://localhost:8123/play.html?skip=male&ep=${ep}&scenario=${sc}`); await p.waitForFunction(() => window.app?.scene?.win, null, { timeout: 20000 }); await p.evaluate(() => { const g = window.game; if (g) { g.openDialog = () => {}; g.hitPlayer = () => {}; } }); await p.waitForTimeout(2500); } catch (e) { bad.set('LOADFAIL ' + sc, sc); } }
for (const [u, s] of bad) console.log(s, u);
console.log('scenarios', scs.length, 'distinct messages', bad.size); await b.close();
