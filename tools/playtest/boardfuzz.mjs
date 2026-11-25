// Random-flag fuzz of one scenario's talk handlers: seeds every global/quest the scenario reads with a random value taken from the constants it is compared with, then runs the
// depth-first dialogue search on every talkable character and reports which quests got started. Shows whether a quest is reachable at all in this scenario (and under which flags).
// usage: node tools/playtest/boardfuzz.mjs <ep> <scenario> [trials=60]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [ep, sc, trials] = [process.argv[2] ?? 4, process.argv[3] ?? '03900003', Number(process.argv[4] ?? 60)];
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await b.newPage({ viewport: { width: 640, height: 480 } });
await p.goto(`http://localhost:8123/play.html?skip=male&ep=${ep}&scenario=${sc}`); await p.waitForFunction(() => window.game?.vm, null, { timeout: 60000 }); await p.waitForTimeout(1000);
const res = await p.evaluate(async ({ trials }) => {
  const g = window.game, vm = g.vm; g.hud.level = 40; g.openDialog = () => {}; vm.hooks.hasItem = () => true; vm.hooks.takeItem = () => {}; g.win.gold = 1e7;
  // constants compared against each global kind 10/11/12 in this scenario
  const consts = new Map(); for (const bl of vm.data.blocks) for (const s of bl) if (s[0] === 0 && s[1].length === 4) { const [a, , c] = s[1]; for (const [x, y] of [[a, c], [c, a]]) if ([10, 11, 12].includes(x[0]) && y[0] === 1) { const k = (x[0] === 12 ? 'q:' : x[0] + ':') + x[1]; (consts.get(k) ?? consts.set(k, new Set([0])).get(k)).add(y[1]); } }
  const keys = [...consts.keys()], out = {};
  const talks = [...new Set(vm.data.status.filter(r => r[1] === 0 && r[2] !== 4294967295).map(r => r[2]))];
  const snap = () => ({ v: new Map(vm.vars), g: new Map(vm.globals), q: vm.queue.slice(), t: vm.talking });
  const restore = o => { vm.vars = new Map(o.v); vm.globals = new Map(o.g); vm.queue = o.q.slice(); vm.talking = o.t; };
  for (let t = 0; t < trials; t++) {
    const seed = {}; vm.globals = new Map(); vm.vars = new Map();
    for (const k of keys) { const a = [...consts.get(k)]; const v = a[Math.floor(Math.random() * a.length)]; vm.globals.set(k, v); if (v) seed[k] = v; }
    const base0 = snap(); const started = new Set();
    for (const c of talks) { for (let rep = 0; rep < 3; rep++) { const base = snap(); let leaves = 0, bestQ = -1, best = base;
      const rec = d => { if (leaves > 40) return; if (!vm.queue.length || d > 14) { leaves++; let q = 0; for (const [k, v] of vm.globals) if (k.startsWith('q:')) q += v; if (q > bestQ) { bestQ = q; best = snap(); } return; }
        const n = Math.max(1, (vm.queue[0].text.match(/~[^~]*~/g) || []).length), here = snap(); for (let o = 0; o < n; o++) { restore(here); try { vm.advance(o); } catch {} rec(d + 1); } };
      restore(base); try { vm.talk(c); } catch {} rec(0); restore(best); vm.queue = []; vm.talking = false; } }
    for (const [k, v] of vm.globals) if (k.startsWith('q:') && v === 1 && (base0.g.get(k) ?? 0) === 0) started.add(Number(k.slice(2)));
    for (const q of started) if (!out[q]) out[q] = seed;
  }
  return out;
}, { trials });
console.log('quests started under random flags:', Object.keys(res).map(Number).sort((a, c) => a - c).join(','));
if (process.env.SHOW) for (const [q, s] of Object.entries(res)) console.log(q, JSON.stringify(s));
await b.close();
