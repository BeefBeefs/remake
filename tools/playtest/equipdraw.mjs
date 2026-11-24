// Equipped armor and weapon are drawn on the hero: screenshots of a few combinations to /tmp/equip_N.png
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await b.newPage({ viewport: { width: 640, height: 480 } });
await p.goto(`http://localhost:8123/play.html?skip=male&scenario=00000003`); await p.waitForFunction(() => window.game?.hud, null, { timeout: 60000 }); await p.waitForTimeout(800);
await p.evaluate(() => { window.game.actors.length = 0; });
const px = await p.evaluate(() => [window.game.player.x - window.game.camX, window.game.player.y - window.game.camY]);
const combos = [[null, null, null], ['Leather Armor', 'Short Sword', 'Round Shield'], ['Plate Mail', 'Claymore', 'Tower Shield'], ['Hunter Armor', 'Dagger', 'Kite Shield'], ['Robe', 'Rod', null], ['Robe', 'Bowgun', null]];
const out = [];
for (let i = 0; i < combos.length; i++) {
  const [a, w, sh] = combos[i];
  const info = await p.evaluate(([a, w, sh]) => { const g = window.game, inv = g.win.inv; inv.entries.length = 0;
    for (const [sec, n] of [[1, a], [1, sh], [0, w]]) if (n) { const it = g.win.db.sections[sec].find(x => x.name === n || x.name.endsWith(' ' + n)); if (it) { inv.add(it); inv.toggleEquip(inv.entries[inv.entries.length - 1]); } }
    g.player.dir = 0; return inv.entries.map(e => e.item.name); }, [a, w, sh]);
  await p.waitForTimeout(250); out.push(info);
  await p.screenshot({ path: `/tmp/equip_${i}.png`, clip: { x: px[0] - 50, y: px[1] - 100, width: 100, height: 130 } });
}
console.log(JSON.stringify(out)); await b.close();
