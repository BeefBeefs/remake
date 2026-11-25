import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [,, ep, sc, seed, qs, pick] = process.argv;
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await b.newPage({ viewport: { width: 640, height: 480 } });
p.on('pageerror', e => console.log('err', e.message));
await p.goto(`http://localhost:8123/play.html?skip=male&ep=${ep}&scenario=${sc}`); await p.waitForFunction(() => window.game?.vm, null, { timeout: 60000 }); await p.waitForTimeout(1000);
const r = await p.evaluate(async ([seed, qs]) => { const g = window.game, vm = g.vm, log = []; g.openDialog = () => {}; g.hud.level = 60; g.hitPlayer = () => {};
  const asked = []; const h = vm.hooks; const old = h.hasItem; h.hasItem = (c, i) => { asked.push(c + ':' + i); return true; }; h.takeItem = () => {};
  vm.vars.set('4:1000005', 1);
  for (const kv of seed.split(',')) { const [k, v] = kv.split('='); vm.globals.set(k, +v); }
  for (let t = 0; t < 3; t++) { vm.talk(12000000); let n = 0; for (; n < 80 && vm.queue.length; n++) vm.advance(0); log.push('talk' + t + ' msgs=' + n + ' ' + qs.split(',').map(q => 'q' + q + '=' + vm.globals.get('q:' + q)).join(' ') + ' asked=' + [...new Set(asked)].join(',')); }
  return log; }, [seed, qs]);
console.log(r.join('\n')); await b.close();
