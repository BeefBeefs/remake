// Sentences 67-71 (exe 0x4340e7-0x4342de): quest spell grant, exp percentage, offered profession read/write. usage: node tools/playtest/questsent.mjs (server on :8123)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await b.newPage({ viewport: { width: 640, height: 480 } });
p.on('pageerror', e => console.log('err', e.message));
await p.goto('http://localhost:8123/play.html?skip=male&ep=4&scenario=04100000'); await p.waitForFunction(() => window.game?.vm && window.game?.magic, null, { timeout: 60000 });
await p.waitForTimeout(800);
const r = await p.evaluate(async () => {
  const g = window.game, h = g.vm.hooks, o = {}; g.hud.level = 10; g.totalExp = g.expTable[8]; g.syncExp();
  o.spellRows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].filter(n => g.magic.spell(600 + n)).length;
  o.hud = JSON.stringify(g.hud); o.has0 = h.hasSpell(17); h.learnSpell(17); o.has1 = h.hasSpell(17);
  const e0 = g.hud.exp, need = g.hud.expMax; h.expPct(50); o.expGain = g.hud.exp - e0; o.expHalf = Math.floor(need / 2);
  o.offer0 = h.offeredClass(); h.offerClass(3); o.offer3 = h.offeredClass(); o.target = g.careerTarget; await new Promise(r => setTimeout(r, 300)); o.opts = [...g.win.careerOpts];
  h.offerClass(0); o.stay = h.offeredClass();
  return o;
});
console.log(JSON.stringify(r));
const ok = r.has0 === false && r.has1 === true && r.expGain === r.expHalf && r.offer3 === 3 && r.target === 2 && r.opts.includes(2) && r.stay === 3;
console.log(ok ? 'PASS' : 'FAIL'); if (!ok) process.exitCode = 1; await b.close();
