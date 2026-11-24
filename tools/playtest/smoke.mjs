import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const scs=fs.readdirSync('/home/claude/remake/public/data/ep1/scenario').filter(f=>f.endsWith('.script.json')).map(f=>f.slice(0,8));
const b = await chromium.launch({args:['--no-sandbox']}); const p = await b.newPage({viewport:{width:640,height:480}});
const w=[]; p.on('console',m=>{ if(/unimplemented|error|fail/i.test(m.text())) w.push(m.text().slice(0,160)); }); p.on('pageerror',e=>w.push('ERR '+e.message));
for(const sc of scs){ const before=w.length; await p.goto(`http://localhost:8123/play.html?skip=male&scenario=${sc}`); try{ await p.waitForFunction(()=>window.app?.scene?.win,null,{timeout:20000}); await p.waitForTimeout(600);}catch(e){w.push(sc+' load timeout')} if(w.length>before) console.log(sc,w.slice(before)); }
console.log('done',scs.length,'scenarios; warnings',w.length); await b.close();
