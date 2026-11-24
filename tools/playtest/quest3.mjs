// Quest 3 (kill-all poll in 00010004): accept state, kill every monster, wait, expect state 2. usage: node tools/playtest/quest3.mjs [scenario] [quest]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const sc = process.argv[2] ?? '00010004', qn = Number(process.argv[3] ?? 3);
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await b.newPage({ viewport: { width: 640, height: 480 } });
p.on('pageerror', e => console.log('err', e.message));
await p.goto(`http://localhost:8123/play.html?skip=male&ep=4&scenario=${sc}`); await p.waitForFunction(() => window.game?.vm, null, { timeout: 60000 }); await p.waitForTimeout(1500);
const r = await p.evaluate(async ([qn]) => {
  const g = window.game, vm = g.vm, o = {}; vm.globals.set(`q:${qn}`, 1);
  o.enemies = g.actors.filter(a => a.enemy).map(a => [a.rec.id, a.alive, !!a.free, !!a.slot]).slice(0, 30);
  await new Promise(r => setTimeout(r, 600)); o.before = vm.globals.get(`q:${qn}`);
  for (const a of g.actors.filter(a => a.enemy && a.alive)) g.damage(a, 1e9);
  await new Promise(r => setTimeout(r, 1500)); o.after = vm.globals.get(`q:${qn}`);
  o.left = g.actors.filter(a => a.enemy && a.alive).length; o.g8 = vm.get?.(8, 0);
  return o;
}, [qn]);
console.log(JSON.stringify(r)); await b.close();
