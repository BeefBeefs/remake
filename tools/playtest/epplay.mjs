// Ordered-play quest sweep: visits the scenarios of an episode chain in id order carrying all flags; in each one fires the map-start event, then for every talkable character talks to it
// several times in a row (a quest giver often needs an intro talk first), each time trying uniform answers 0/1/2 and keeping the outcome with the best score (quest states, then flags changed).
// CHEAT=1: hasItem always true and lots of gold. usage: node tools/playtest/epplay.mjs [ep=1] ; prints started / done quests
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const ep = Number(process.argv[2] ?? 1), cheat = !!process.env.CHEAT, ROUNDS = Number(process.env.ROUNDS ?? 3), LEAVES = Number(process.env.LEAVES ?? 30), TALKS = Number(process.env.TALKS ?? 4);
const all = (process.env.ONLY ? process.env.ONLY.split(",") : [...new Set([1, 2, 3, 4].filter(k => k <= ep).flatMap(k => fs.readdirSync(`public/data/ep${k}/scenario`).filter(f => f.endsWith(".script.json")).map(f => f.slice(0, 8))))].sort());
const b = await chromium.launch({ args: ['--no-sandbox'] }); let p, globals = [];
// REVISIT=1: after every scenario go back to the previous one (a quest chain often needs the town again right after its dungeon, before later quests close the dialogue branch)
const seq = process.env.REVISIT ? all.flatMap((s, i) => i ? [s, all[i - 1]] : [s]) : all;
for (let pass = 0; pass < Number(process.env.PASSES ?? (process.env.REVISIT ? 1 : 2)); pass++) for (let i = 0; i < seq.length; i += 8) {
  const batch = seq.slice(i, i + 8);
  if (p) await p.close().catch(() => {}); p = await b.newPage({ viewport: { width: 640, height: 480 } });
  await p.goto(`http://localhost:8123/play.html?skip=male&ep=${ep}&scenario=${batch[0]}`);
  try { await p.waitForFunction(() => window.game?.vm, null, { timeout: 30000 }); } catch { continue; }
  p.on('pageerror', e => console.log('pageerr', e.message.slice(0, 120)));
  try { globals = await p.evaluate(async ({ batch, globals, cheat, ROUNDS, TALKS, kill, LEAVES, noStart }) => {
    const { GameScene } = await import('./js/game.js');
    let g = window.game; g.vm.globals = new Map(globals);
    for (let k = 0; k < batch.length; k++) {
      if (k) { try { try { g.save?.(); } catch {} window.app.go(await GameScene.create(window.app, 'male', 'SHADOW', { scenario: batch[k], carry: g })); } catch (e) { (window.__log ??= []).push('ERR ' + e.stack.split('\n').slice(0, 4).join(' | ')); continue; } for (let w = 0; w < 20 && (!window.game || window.game === g); w++) await new Promise(r => setTimeout(r, 100)); if (!window.game || window.game === g) continue; g = window.game; }
      if (!g.vm) continue; const vm = g.vm; g.hud.level = 40; g.travel = () => {}; g.openDialog = () => {};
      if (cheat) { vm.hooks.hasItem = () => true; vm.hooks.takeItem = () => {}; g.win.gold = 10000000; }
      const snap = () => ({ v: new Map(vm.vars), g: new Map(vm.globals), q: vm.queue.slice(), t: vm.talking, e: vm.ended, c: vm.char });
      const restore = o => { vm.vars = new Map(o.v); vm.globals = new Map(o.g); vm.queue = o.q.slice(); vm.talking = o.t; vm.ended = o.e; vm.char = o.c; };
      const score = () => { let q = 0, f = 0; for (const [k, v] of vm.globals) { if (k.startsWith('q:')) q += v * 1000; else f += Math.abs(v) > 0 ? 1 : 0; } return q + f; };
      const talks = [...new Set(vm.data.status.filter(r => r[1] === 0 && r[2] !== 4294967295).map(r => r[2]))];
      (window.__log ??= []).push(batch[k] + ' g=' + vm.globals.size + ' q=' + [...vm.globals].filter(([a, b]) => a.startsWith('q:')).map(([a, b]) => a.slice(2) + '=' + b).join(','));
      if (!noStart) try { vm.event(7, 0xffffffff); vm.queue = []; vm.talking = false; } catch {}
      for (let round = 0; round < ROUNDS; round++) {
        if (kill && round === 1) { g.hitPlayer = () => {}; for (const a of g.actors.filter(a => a.enemy && a.alive)) g.damage(a, 1e9); await new Promise(r => setTimeout(r, 1500)); }   // kill-all completions (sentence 31 polls)
        try { vm.poll(); } catch {}
        for (const [, st, c] of vm.data.status) if (st !== 0 && st !== 1 && st !== 5 && st !== 7 && c !== 4294967295) { try { vm.event(st, c); vm.queue = []; vm.talking = false; } catch {} }   // touch / use / kill style handlers
        for (const c of talks) for (let t = 0; t < TALKS; t++) {
          const base = snap(); let best = null, leaves = 0;
          const rec = depth => {   // depth-first over every option of every message, like epquests2
            if (leaves >= LEAVES) return;
            if (!vm.queue.length || depth > 14) { leaves++; const sc = score(); if (!best || sc > best.s) best = { s: sc, st: snap() }; return; }
            const n = Math.max(1, (vm.queue[0].text.match(/~[^~]*~/g) || []).length), here = snap();
            for (let o = 0; o < n; o++) { restore(here); try { vm.advance(o); } catch {} rec(depth + 1); }
          };
          restore(base); try { vm.talk(c); } catch {} rec(0); if (!best) best = { s: 0, st: base };
          restore(best.st); vm.queue = []; vm.talking = false;
        }
      }
    }
    window.__log = window.__log; return [...g.vm.globals];
  }, { batch, globals, cheat, ROUNDS, TALKS, LEAVES, noStart: !!process.env.NOSTART, kill: process.env.KILL !== '0' }); } catch (e) { console.log('batch crashed', batch[0], e.message.slice(0, 60)); }
  if (process.env.DEBUG) console.log((await p.evaluate(() => window.__log)).join('\n'));
}
const best = Object.fromEntries(globals.filter(([k, v]) => k.startsWith('q:') && v > 0).map(([k, v]) => [k.slice(2), v]));
const qs = Object.keys(best).map(Number).sort((a, c) => a - c);
console.log(`Episode ${ep}: ${all.length} scenarios, started ${qs.length} [${qs.join(',')}], done [${qs.filter(q => best[q] >= 2).join(',')}]`);
await b.close();
