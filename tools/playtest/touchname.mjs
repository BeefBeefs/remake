// Touch: tapping the name field of the new-character screen raises the phone keyboard (hidden input in App) and typing / Backspace edit the name. usage: node tools/playtest/touchname.mjs (server on :8123)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 800, height: 360 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage(); p.on('pageerror', e => console.log('err', e.message));
await p.goto('http://localhost:8123/'); await p.waitForFunction(() => window.app?.scene, null, { timeout: 60000 });
await p.evaluate(async () => { const { SelectScene } = await import('./js/select.js'); window.app.go(await SelectScene.create(window.app)); }); await p.waitForTimeout(500);
// canvas is 480 wide centred in 800 (x offset 160), scale 0.75: game (250, 415) -> screen
await p.touchscreen.tap(160 + 250 * 0.75, 415 * 0.75); await p.waitForTimeout(300);
const focused = await p.evaluate(() => document.activeElement?.tagName === 'INPUT');
await p.keyboard.press('Backspace'); await p.keyboard.type('Zed'); await p.waitForTimeout(200);
const name = await p.evaluate(() => window.app.scene.name); console.log(focused, name); const ok = focused && name === 'SHADOZed'; console.log(ok ? 'PASS' : 'FAIL'); if (!ok) process.exitCode = 1; await b.close();
