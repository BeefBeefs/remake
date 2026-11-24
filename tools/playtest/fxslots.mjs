// The full item bonus block (39 triplets per item, see ItemDb.FX): decoded values per item, tooltip lines, and the effects that are wired (recovery, gold, strength, absorption, stiffness, mines, mp cost, medicine).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=01000004'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(1000);
console.log(JSON.stringify(await p.evaluate(async()=>{
  const g=window.game, w=g.win, i=w.inv, wait=ms=>new Promise(r=>setTimeout(r,ms)), out={}; i.entries.length=0; await wait(300);
  const f=n=>w.db.sections.flat().find(x=>x.name===n);
  const wear=async n=>{ i.entries.length=0; i.add(f(n)); i.toggleEquip(i.entries[0]); await wait(250); };
  // recovery: armor "Recovery Leather Cloth" = life recovery 1.0 %/s
  await wear('Recovery Leather Cloth'); out.life=w.fx('lifeRec'); out.tipRec=w.bonusLines(f('Recovery Leather Cloth')); g.hud.hp=10; await wait(2300); out.hpAfter2s=g.hud.hp;
  await wear('Healing Leather Cloth'); out.mpRecTip=w.bonusLines(f('Healing Leather Cloth')); g.hud.mp=0; await wait(2300); out.mpAfter2s=g.hud.mp;
  await wear('Gamble Boots'); out.gold=w.fx('gold'); out.goldTip=w.bonusLines(f('Gamble Boots'));
  const s0=w.strength(); await wear('Power Bracelet'); out.strength=[s0,w.strength()];
  await wear('Gilgamesh'); out.gilgamesh=w.bonusLines(f('Gilgamesh'));
  await wear('Knuckle Breaker'); out.stiff=[w.fx('stunP'),w.fx('stunD')];
  await wear('Destruction Ring'); out.mine=[w.fx('mineFx'),w.fx('mines')];
  await wear('Defensive Magic Book'); out.mcost=w.fx('mcost'); out.chantBook=w.fx('chant');
  await wear('Fairy\'s Plate'); out.fairy=w.bonusLines(f('Fairy\'s Plate'));
  await wear('Reflective Round Shield'); out.refl=[w.fx('reflGen'),w.fx('reflRate')];
  await wear('Wildcat Bow'); out.bow=w.bonusLines(f('Wildcat Bow'));
  await wear('Wildcat Bow'); out.petGear=g.pet?'pet':'nopet';
  i.entries.length=0; return out; })));
console.log(errs); await b.close();
