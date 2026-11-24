// For every accepted-only quest: load the scenario of its completion poll, set the quest to 1, kill all monsters, wait, report the state. usage: node tools/playtest/questpoll.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const list = [[3, '00010004'], [6, '01020002'], [11, '02100002'], [15, '02220001'], [18, '02100003'], [20, '03000407'], [24, '03090000'], [28, '03110000'], [41, '04040000']];
const b = await chromium.launch({ args: ['--no-sandbox'] });
for (const [qn, sc] of list) {
  const p = await b.newPage({ viewport: { width: 640, height: 480 } }); p.on('pageerror', e => console.log('err', e.message));
  try {
    await p.goto(`http://localhost:8123/play.html?skip=male&ep=4&scenario=${sc}`); await p.waitForFunction(() => window.game?.vm, null, { timeout: 60000 }); await p.waitForTimeout(1500);
    const r = await p.evaluate(async ([qn]) => { const g = window.game, vm = g.vm, o = {}; g.hud.level = 40; g.hitPlayer = () => {}; if (g.dead) { g.dead = false; g.hud.hp = g.hud.hpMax ?? 100; g.player.anim = 0; g.player.t = 0; } vm.globals.set(`q:${qn}`, 1); o.n = g.actors.filter(a => a.enemy).length;
      await new Promise(r => setTimeout(r, 500)); o.t0 = vm.globals.get(`q:${qn}`);
      for (const a of g.actors.filter(a => a.enemy && a.alive)) g.damage(a, 1e9);
      await new Promise(r => setTimeout(r, 5000)); o.t1 = vm.globals.get(`q:${qn}`); return o; }, [qn]);
    console.log(qn, sc, JSON.stringify(r), r.t1 === 2 ? 'DONE' : 'stuck');
  } catch (e) { console.log(qn, sc, 'error', e.message.slice(0, 80)); }
  await p.close();
}
await b.close();
