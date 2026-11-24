// Touch controls (src/touch.ts): overlay, virtual stick, ATK / MAGIC / menu buttons, tap on the canvas, fullscreen toggle. usage: node tools/playtest/touch.mjs (server on :8123)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 800, height: 360 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage(); p.on('pageerror', e => console.log('err', e.message));
await p.goto('http://localhost:8123/?skip=male&scenario=00000001'); await p.waitForFunction(() => window.game?.hud && window.app?.scene === window.game, null, { timeout: 60000 }); await p.waitForTimeout(800);
const cdp = await ctx.newCDPSession(p);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: q[2] ?? i })) });
const box = async sel => p.evaluate(s => { const r = [...document.querySelectorAll('#tc .b')].find(e => e.textContent === s || (s === 'stick' && e.classList.contains('stick')))?.getBoundingClientRect(); return r ? [r.left + r.width / 2, r.top + r.height / 2, r.width] : null; }, sel);
const out = {};
out.visible = await p.evaluate(() => getComputedStyle(document.getElementById('tc')).display === 'block');
// stick: drag right -> ArrowRight held and the hero walks right
const st = await box('stick'); const x0 = await p.evaluate(() => window.game.player.x);
await touch('touchStart', [[st[0], st[1], 1]]); await touch('touchMove', [[st[0] + 50, st[1], 1]]); await p.waitForTimeout(600);
out.dHeld = await p.evaluate(() => window.app.input.keys.has('arrowright')); out.moved = (await p.evaluate(() => window.game.player.x)) - x0;
await touch('touchEnd', []); await p.waitForTimeout(100); out.dReleased = await p.evaluate(() => !window.app.input.keys.has('arrowright'));
// stick down must not open the Status window (S is its hotkey)
await touch('touchStart', [[st[0], st[1], 1]]); await touch('touchMove', [[st[0], st[1] + 50, 1]]); await p.waitForTimeout(300); out.downNoMenu = await p.evaluate(() => !window.game.win.status && window.app.input.keys.has('arrowdown')); await touch('touchEnd', []);
// ATK held: shift + left button down, released afterwards
const atk = await box('ATK'); await touch('touchStart', [[atk[0], atk[1], 2]]); await p.waitForTimeout(150);
out.atkHeld = await p.evaluate(() => window.app.input.keys.has('shift') && window.app.input.down); await touch('touchEnd', []); await p.waitForTimeout(100);
out.atkReleased = await p.evaluate(() => !window.app.input.keys.has('shift') && !window.app.input.down);
// ITEM button toggles the inventory window
const it = await box('ITEM'); const w0 = await p.evaluate(() => window.game.win.item); await p.touchscreen.tap(it[0], it[1]); await p.waitForTimeout(200); out.itemToggled = (await p.evaluate(() => window.game.win.item)) !== w0;
// tap on the canvas moves the pointer there
await p.touchscreen.tap(400, 150); out.tapPointer = await p.evaluate(() => [Math.round(window.app.input.x), Math.round(window.app.input.y)]);
// fullscreen
const fb = await box('FULL'); await p.touchscreen.tap(fb[0], fb[1]); await p.waitForTimeout(400); out.fullscreen = await p.evaluate(() => !!document.fullscreenElement);
await p.touchscreen.tap(fb[0], fb[1]); await p.waitForTimeout(400); out.exitedFs = await p.evaluate(() => !document.fullscreenElement);
console.log(JSON.stringify(out));
const ok = out.visible && out.dHeld && out.moved > 20 && out.dReleased && out.downNoMenu && out.atkHeld && out.atkReleased && out.itemToggled && out.tapPointer[0] > 0 && out.fullscreen && out.exitedFs;
await p.screenshot({ path: '/tmp/touch.png' }); console.log(ok ? 'PASS' : 'FAIL'); if (!ok) process.exitCode = 1; await b.close();
