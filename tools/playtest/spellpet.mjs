// Pet spells (Moon revives, Explosion kicks), Identify, and the defensive buffs (Energy Shield, Magic Shield, Counter Burst).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=01000004'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(1000);
await p.evaluate(()=>{ window.game.swapPet(1); }); await p.waitForFunction(()=>window.game.pet,null,{timeout:20000});
console.log(JSON.stringify(await p.evaluate(async()=>{
  const g=window.game, inp=g.app.input, wait=ms=>new Promise(r=>setTimeout(r,ms)), out={};
  const e=g.actors.find(a=>a.enemy&&a.alive&&a.rec.model!==5); for(const a of g.actors) if(a.enemy&&a!==e) a.hidden=true;
  g.win.career=2; g.hud.level=40; await wait(900); g.hud.hpMax=g.hud.mpMax=9999; e.hp=e.maxHp=99999; g.player.x=e.x-100; g.player.y=e.y; g.pet.x=e.x-30; g.pet.y=e.y;
  const cast=async id=>{ g.hud.mp=9999; g.castT=0; g.magic.bar[0]=id; g.magic.sel=0; inp.x=e.x-g.camX; inp.y=e.y-g.camY-20; g.rightAction(); await wait(300); };
  g.pet.hp=0; g.pet.state='dead'; await cast(607); out.moonBanner=g.banner?.text; out.moonRevive=[g.pet.dead, Math.round(g.pet.hp), g.pet.maxHp];
  const h0=e.hp; await cast(620); out.explosion=h0-e.hp;
  // identify
  const it=g.win.db.sections[0].find(x=>x.name==='Power Short Sword'); g.win.inv.add(it); g.win.inv.entries[g.win.inv.entries.length-1].unid=true; await cast(617); out.identify=[g.win.needsIdentify(), g.banner?.text];
  // buffs against a melee hit
  g.hud.hp=g.hud.hpMax=9999; g.hud.mp=1000; g.buffs.eshield=5000; g.hitPlayer(300,false); out.eshield=[g.hud.hp>=9999-1, g.hud.mp<1000]; g.buffs.eshield=0;
  g.hud.hp=g.hud.hpMax; const a0=g.hud.hp; g.hitPlayer(300,true); const plain=a0-g.hud.hp; g.hud.hp=a0; g.buffs.mshield=5000; g.hitPlayer(300,true); out.mshield=[plain,a0-g.hud.hp]; g.buffs.mshield=0;
  g.hud.hp=a0; const e0=e.hp; g.buffs.counter=5000; g.hitPlayer(300,false,undefined,e); out.counter=e0-e.hp; return out; })));
console.log(errs); await b.close();
