// Companion lines of worn gear: Companion Evasion makes the dog dodge (100 % -> no damage), the status shows Hit Rate / Evasion; HP/Attack/Defense lines (see fxslots) add to the dog's numbers.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await (await b.newContext({ viewport: { width: 640, height: 480 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=00000000'); await p.waitForFunction(() => window.game?.magic, null, { timeout: 60000 }); await p.waitForTimeout(800);
const r = await p.evaluate(async () => {
  const g = window.game; const { Pet } = await import('./js/companion.js');
  g.pet = await Pet.load(g.app, g.tables, 0, g.player.x + 50, g.player.y + 20); g.pet.heroLevel = 1;
  const hp0 = g.pet.hp; g.pet.gear.eva = 100; for (let i = 0; i < 20; i++) g.hitPet(30);
  const dodged = g.pet.hp === hp0; g.pet.gear.eva = 0; g.hitPet(30); const hit = g.pet.hp < hp0;
  g.pet.gear.hit = 7; g.pet.gear.eva = 12; return { dodged, hit, status: g.pet.statusLines()[4] };
});
console.log(JSON.stringify(r), errs); const ok = r.dodged && r.hit && /Hit Rate \+7\s+Evasion \+12/.test(r.status) && !errs.length; console.log(ok ? 'COMPGEAR OK' : 'COMPGEAR FAIL'); await b.close(); process.exit(ok ? 0 : 1);
