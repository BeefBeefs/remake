import { Data } from './data.js';
import { SpriteSet } from './sprites.js';
import { loadCaf, Caf } from './caf.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function main() {
  const status = $('status');
  status.textContent = 'loading…';
  const [set, caf] = await Promise.all([SpriteSet.load(Data.url('male')), loadCaf(Data.url('male.caf.json'))]);
  status.textContent = `${set.patternCount} patterns, ${caf.anims.length} animations`;
  const animSel = $<HTMLSelectElement>('anim'), dirSel = $<HTMLSelectElement>('dir'), layerBox = $('layers');
  caf.anims.forEach((_, i) => animSel.add(new Option(`animation ${i}`, String(i))));
  for (let i = 0; i < 9; i++) dirSel.add(new Option(`dir ${i}`, String(i)));
  const nLayers = caf.anims[0].dirs[0].layers.length;
  const on: boolean[] = [];
  for (let l = 0; l < nLayers; l++) {
    on[l] = l === 0;
    const lab = document.createElement('label'); const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = on[l];
    cb.onchange = () => on[l] = cb.checked; lab.append(cb, ` L${l} `); layerBox.append(lab);
  }
  const cv = $<HTMLCanvasElement>('cv'); const ctx = cv.getContext('2d')!; ctx.imageSmoothingEnabled = false;
  let t0 = performance.now();
  const draw = (now: number) => {
    const a = caf.anims[+animSel.value]; const d = a.dirs[+dirSel.value];
    const fi = d.frames ? Math.max(0, Math.floor((now - t0) / 60)) % d.frames : 0;
    ctx.fillStyle = '#6a7d6a'; ctx.fillRect(0, 0, cv.width, cv.height);
    const cx = cv.width / 2, cy = cv.height * 0.7, S = 3;
    d.layers.forEach((seq, l) => {
      if (!on[l] || !seq.length) return;
      const f = set.pattern(seq[Math.min(fi, seq.length - 1)][1]); if (!f) return;
      ctx.drawImage(f.canvas, cx + f.ox * S, cy + f.oy * S, f.canvas.width * S, f.canvas.height * S);
    });
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}
main().catch(e => { $('status').textContent = String(e); });
