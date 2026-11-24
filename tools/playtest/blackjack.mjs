// Tower of Ordeal Black Jack (sentences 73/74): unit rules + script integration in 99000023. usage: node tools/playtest/blackjack.mjs (server on :8123)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await b.newPage({ viewport: { width: 640, height: 480 } });
p.on('pageerror', e => console.log('err', e.message));
await p.goto('http://localhost:8123/play.html?skip=male&ep=4&scenario=99000023'); await p.waitForFunction(() => window.game?.vm, null, { timeout: 60000 });
const r = await p.evaluate(async () => {
  const { Blackjack, handValue } = await import('/js/blackjack.js'); const out = {};
  out.values = [handValue([0, 12]), handValue([0, 0, 8]), handValue([9, 10, 4])];   // A+K = 21, A+A+9 = 21, 10+J+5 = 25
  const tally = [0, 0, 0]; for (let i = 0; i < 400; i++) { const g = new Blackjack(1000); g.stand(); tally[g.result]++; } out.tally = tally;
  const g = window.game, vm = g.vm; vm.set(4, 1000019, 10000); vm.set(4, 1000025, 0); vm.set(4, 1000002, 0);
  g.win.gold = 100000; const gold0 = g.win.gold; vm.runBlock(27);
  out.started = !!g.bj; out.paid = gold0 - g.win.gold; out.bet = g.bj?.bet;
  if (g.bj) { g.bj.stand(); out.res = g.bj.result; const res = g.bj.result; g.bj = null; vm.finishBlackjack(res); out.pending = vm.pending ? vm.pending.text.slice(0, 40) : null; out.wins = vm.get(4, 1000025); }
  return out;
});
console.log(JSON.stringify(r));
const ok = r.values.join() === '21,21,25' && r.tally[1] > 100 && r.tally[2] > 100 && r.started && r.paid === 10000 && r.bet === 10000 && r.pending;
console.log(ok ? 'PASS' : 'FAIL'); if (!ok) process.exitCode = 1; await b.close();
