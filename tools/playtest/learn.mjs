// Spell learning with the decoded rule (Table.Tbd 100-107): score = weighted level history of the current class, spell n learned when Tbd(104+career)[n] <= score.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=00000000'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(1000);
console.log(JSON.stringify(await p.evaluate(async()=>{
  const g=window.game, wait=ms=>new Promise(r=>setTimeout(r,ms)), out={}; const names=()=>g.magic.known.map(i=>g.magic.spell(i)?.name);
  out.start=names();
  const lvl=async n=>{ g.totalExp=g.expTable[n-2]+1; g.syncExp(); await wait(200); };
  await lvl(2); out.merc2=[g.hud.level,g.hist.length,names()];
  await lvl(6); out.merc6=[g.hud.level,g.hist.join(','),names()];
  // become a warrior and keep levelling: Fire Ball needs 80 = 8 warrior levels, Ice Bolt 100
  g.win.career=1; await lvl(10); out.war10=[g.hud.level,g.hist.join(','),names()];
  await lvl(14); out.war14=[g.hud.level,names()];
  g.win.career=2; await wait(200); out.wizardFromWarrior=names();   // wizard score = 2 per warrior level
  await lvl(30); out.wiz30=[g.hud.level,names()];
  return out; })));
console.log(errs); await b.close();
