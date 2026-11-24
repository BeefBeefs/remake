// Casts every spell of the list and reports what happened (enemy hp lost, rings, buffs, banner).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=01000004'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(1000);
console.log(JSON.stringify(await p.evaluate(async()=>{
  const g=window.game, inp=g.app.input, wait=ms=>new Promise(r=>setTimeout(r,ms)), out={};
  const en=g.actors.filter(a=>a.enemy&&a.alive&&a.rec.model!==5).slice(0,3); for(const a of g.actors) if(a.enemy&&!en.includes(a)) a.hidden=true;
  g.win.career=2; g.hud.level=40; await wait(300); g.hud.hpMax=g.hud.mpMax=9999;
  for(const id of [601,602,603,604,605,607,608,609,610,611,612,613,614,615,616,617,618,619,620,621]){
    g.hud.mp=9999; g.hud.hp=9000; g.castT=0; g.shots.length=0; g.rings.length=0; g.atkT=-1; g.target=null;
    en.forEach((a,i)=>{ a.hp=a.maxHp=99999; a.stun=0; a.hidden=false; a.x=en[0].x; a.y=en[0].y; });
    const e=en[0]; g.player.x=e.x-120; g.player.y=e.y; for(const q of en.slice(1)){ q.x=e.x+40; q.y=e.y+20; }
    await wait(150); g.magic.bar[0]=id; g.magic.sel=0; inp.x=e.x-g.camX; inp.y=e.y-g.camY-20; g.banner=null;
    const hp0=en.map(a=>a.hp), mp0=g.hud.mp; g.app.rawRight=true; await wait(700);
    out[id]={name:g.magic.spell(id).name, mp:mp0-g.hud.mp, hit:en.map((a,i)=>hp0[i]-a.hp), stun:Math.max(...en.map(a=>a.stun)), banner:g.banner?.text, buffs:Object.entries(g.buffs).filter(([,v])=>v>0).map(([k])=>k)};
    g.buffs={berserk:0,eshield:0,mshield:0,counter:0};
  }
  return out; })));
console.log(errs); await b.close();
