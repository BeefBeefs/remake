import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [,, ep, sc, key, max, qs] = process.argv;
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await b.newPage({ viewport: { width: 640, height: 480 } });
p.on('pageerror', e => console.log('err', e.message));
await p.goto(`http://localhost:8123/play.html?skip=male&ep=${ep}&scenario=${sc}`); await p.waitForFunction(() => window.game?.vm, null, { timeout: 60000 }); await p.waitForTimeout(1000);
const r = await p.evaluate(async ([key, max, qs]) => { const g = window.game, vm = g.vm, log = []; g.openDialog = () => {}; g.hud.level = 80; g.hitPlayer = () => {};
  vm.hooks.hasItem = () => true; vm.hooks.takeItem = () => {};
  let stage = 0;
  for (let it = 0; it < 80 && stage <= +max; it++) {
    vm.globals.set(key, stage); const before = stage; const started = [];
    for (let t = 0; t < 8; t++) { vm.vars.set('4:1000005', 0); vm.talk(12000000 + [0,3,1,2,4,5,6,7,8][t % 9]); for (let n = 0; n < 80 && vm.queue.length; n++) vm.advance(0); }
    if (key==='11:44' && stage===1) vm.globals.set('q:17', 2); const after = vm.globals.get(key) ?? stage;
    log.push(`${key}=${before} -> ${after}  quests ` + qs.split(',').map(q => q + ':' + vm.globals.get('q:' + q)).join(' '));
    stage = after > before ? after : before + 1;
  }
  return log; }, [key, max, qs]);
console.log(r.join('\n')); await b.close();
