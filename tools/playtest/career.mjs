// Career rule decoded from the exe (0x41333b): level 5 turns the Mercenary into a Warrior; from level 5 each level-up offers Wizard (>= 20 % of the hits were spells), else Hunter (>= 30 % bow-gun hits),
// else Warrior (>= 50 % hits with arms classes 0 / 1 / 3), measured since the previous level-up (counters then restart). The Status button lists the single offer.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await (await b.newContext({ viewport: { width: 640, height: 480 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=00000000'); await p.waitForFunction(() => window.game?.magic, null, { timeout: 60000 }); await p.waitForTimeout(1000);
const box = await p.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.left, r.top, r.width / 640, r.height / 480]; });
const click = (x, y) => p.mouse.click(box[0] + x * box[2], box[1] + y * box[3]);
const st = () => p.evaluate(() => { const g = window.game; return { career: g.win.career, opts: g.win.careerOpts, lvl: g.hud.level, target: g.careerTarget }; });
const lvl = n => p.evaluate(n => { const g = window.game; g.totalExp = g.expTable[n - 2] + 1; g.syncExp(); }, n).then(() => p.waitForTimeout(150));
const res = {};
await lvl(4); res.l4 = await st();
await lvl(5); res.l5 = await st();                                             // Mercenary -> Warrior, no choice offered
await p.evaluate(() => { const g = window.game; g.usage = { n: [0, 0, 0, 0, 0, 0, 0, 0, 10], total: 40 }; }); await lvl(6); res.magic25 = await st();   // 25 % spells -> Wizard offered
await p.evaluate(() => { window.game.win.status = true; }); await p.waitForTimeout(200);
await click(60, 396); await p.waitForTimeout(150); await p.screenshot({ path: '/tmp/career.png' });
res.menu = await p.evaluate(() => window.game.win.careerMenu);
await click(60, 388 - 18 - 18 + 18 + 9); await p.waitForTimeout(200); res.picked = await st();
await p.evaluate(() => { const g = window.game; g.usage = { n: [0, 0, 0, 0, 0, 12, 0, 0, 0], total: 40 }; }); await lvl(7); res.bow30 = await st();            // 30 % bow guns -> Hunter
await p.evaluate(() => { const g = window.game; g.usage = { n: [10, 5, 0, 6, 0, 0, 0, 0, 0], total: 40 }; }); await lvl(8); res.melee52 = await st();   // 52 % melee classes -> Warrior
await p.evaluate(() => { const g = window.game; g.usage = { n: [4, 0, 0, 0, 0, 2, 0, 0, 3], total: 40 }; }); await lvl(9); res.none = await st();       // nothing reaches its threshold
res.usageReset = await p.evaluate(() => JSON.stringify(window.game.usage));
console.log(JSON.stringify(res), errs);
const ok = res.l4.career === 0 && !res.l4.opts.length && res.l5.career === 1 && !res.l5.opts.length && res.magic25.opts.join() === '2' && res.menu && res.picked.career === 2 && res.bow30.opts.join() === '3'
  && res.melee52.career === 2 && res.melee52.opts.join() === '1' && !res.none.opts.length && res.usageReset === JSON.stringify({ n: Array(9).fill(0), total: 0 }) && !errs.length;
console.log(ok ? 'CAREER OK' : 'CAREER FAIL'); await b.close(); process.exit(ok ? 0 : 1);
