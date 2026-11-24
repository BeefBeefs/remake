// Spell data from Table.Tbd (rows 600+n): MP cost (16), Heal % (17), exp per level (27), cap 20, cast-time multiplier (20).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await (await b.newContext({ viewport: { width: 640, height: 480 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=00000001'); await p.waitForFunction(() => window.game?.magic, null, { timeout: 60000 }); await p.waitForTimeout(800);
const r = await p.evaluate(() => {
  const m = window.game.magic; m.learn(601); m.learn(606); m.learn(614);
  const out = { cost: [m.cost(601), m.cost(606), m.cost(604 ), m.cost(621)], heal1: m.healPct(606), heal5: (m.prog.set(606, [5, 0]), m.healPct(606)), castMul: [m.castMul(610), m.castMul(614), m.castMul(601)] };
  m.prog.delete(606); let ups = [];
  for (let i = 1; i <= 29; i++) m.use(601); out.fb29 = [m.level(601), m.exp(601)];
  ups.push(m.use(601)); out.fb30 = [m.level(601), m.exp(601), ups[0]];   // 30 casts -> level 2, exp 0
  for (let i = 0; i < 44; i++) m.use(601); out.fb74 = [m.level(601), m.exp(601), m.expNeed(601)];   // 45 more needed for level 3 (44 done)
  m.prog.set(601, [20, 0]); out.cap = m.use(601);
  return out;
});
console.log(JSON.stringify(r), errs);
const ok = r.cost.join() === '30,40,60,200' && r.heal1 === 10 && r.heal5 === 18 && r.castMul.join() === '0.6,1.5,1' && r.fb29.join() === '1,29' && r.fb30.join() === '2,0,true' && r.fb74.join() === '2,44,45' && r.cap === false && !errs.length;
console.log(ok ? 'SPELLTABLES OK' : 'SPELLTABLES FAIL'); await b.close(); process.exit(ok ? 0 : 1);
