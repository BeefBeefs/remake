import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({args:['--no-sandbox']}); const p = await (await b.newContext({viewport:{width:640,height:480}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123/play.html?skip=male&scenario=00010001'); await p.waitForFunction(()=>window.game?.magic,null,{timeout:60000}); await p.waitForTimeout(1500);
const V=()=>p.evaluate(()=>{const g=window.game, v=g.vm.vars; const o={}; for(const k of ['4:1000044','4:1000046','4:1000047','4:1000048','4:1000002']) o[k]=v.get(k); o.zones=g.zones.filter(z=>[5,10,11].includes(z.rec.type)).slice(0,6).map(z=>[z.rec.id,z.visible]); o.loc=v.get('5:41000:1000000'); o.l42=v.get('5:10042000:1000000'); return o;});
await p.evaluate(()=>{const v=window.game.vm; window.__log=[]; const o=v.runStatus.bind(v); v.runStatus=(s,c)=>{ if(s!==5) window.__log.push([s,c,v.vars.get('4:1000047')]); return o(s,c); };});
console.log('start', JSON.stringify(await V()));
await p.evaluate(()=>{const g=window.game; const z=g.zones.find(z=>z.rec.id===10041000); g.player.x=z.x+10; g.player.y=z.y+25; window.__z=[z.x,z.y]; });
for (let i=0;i<10;i++){ await p.waitForTimeout(500); console.log('t'+i, JSON.stringify(await V()).slice(0,200)); }
console.log('log', JSON.stringify(await p.evaluate(()=>window.__log)), await p.evaluate(()=>[...window.game.vm.vars].filter(([k])=>k.startsWith('5:')).slice(0,12)));
console.log('errors', errs);
await b.close();
