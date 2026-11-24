import { SpriteSet, Frame } from './sprites.js';

export interface MapJson {
  name: string; w: number; h: number; chipW: number; chipH: number; groundSlots: number;
  lst: string[]; cells: string; judge: string; judgeW: number; judgeH: number; judgeCell: number; judgeOrigin: [number, number]; marker: [number, number][]; objects: [x: number, y: number, slot: number, pat: number][];
}

/** World (iso) -> real pixel conversion used by RKC_RPGSCRN (defaults 15 / 10). */
export const worldToReal = (wx: number, wy: number): [number, number] => [Math.trunc((wx - wy) * 15 / 100), Math.trunc((wx + wy) * 10 / 100)];
/** Inverse of worldToReal: a-b = rx*100/15, a+b = ry*100/10. */
export const realToWorld = (rx: number, ry: number): [number, number] => { const d = rx * 100 / 15, s = ry * 100 / 10; return [(s + d) / 2, (s - d) / 2]; };

export interface Drawable { y: number; draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void; }

function b64(s: string): Uint8Array { const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }

export class GameMap {
  cells: Int16Array;
  judge: Uint8Array;
  sets: (SpriteSet | null)[] = [];
  /** [slot, firstPattern] boundaries of the concatenated ground sets */
  private groundStarts: number[] = [];
  private objs: { rx: number; ry: number; slot: number; pat: number }[] = [];
  constructor(public m: MapJson) {
    const raw = b64(m.cells);
    this.cells = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
    this.judge = b64(m.judge);
    this.objs = m.objects.map(([x, y, slot, pat]) => { const [rx, ry] = worldToReal(x, y); return { rx, ry, slot, pat }; });
    this.objs.sort((a, b) => a.ry - b.ry);
  }
  static async load(name: string): Promise<GameMap> {
    const m: MapJson = await (await fetch(`data/ep1/maps/${name}.json`)).json();
    const map = new GameMap(m);
    const cache = new Map<string, Promise<SpriteSet>>();
    map.sets = await Promise.all(m.lst.map(f => {
      if (!f) return Promise.resolve(null);
      if (!cache.has(f)) cache.set(f, SpriteSet.load(`data/ep1/pat/${f}`));
      return cache.get(f)!;
    }));
    let n = 0;
    for (let i = 0; i < m.groundSlots; i++) { map.groundStarts.push(n); n += map.sets[i]!.patternCount; }
    return map;
  }
  /** Judge grid value at world coords: 0 free, 1 blocked, 3 special free zone. Outside the grid counts as blocked. */
  judgeAt(a: number, b: number): number {
    const { judgeW: W, judgeH: H, judgeCell: C, judgeOrigin: [oa, ob] } = this.m;
    const gx = Math.floor((a + oa) / C), gy = Math.floor((b + ob) / C);
    return gx < 0 || gy < 0 || gx >= W || gy >= H ? 1 : this.judge[gy * W + gx];
  }
  blockedReal(rx: number, ry: number): boolean { const [a, b] = realToWorld(rx, ry); return this.judgeAt(a, b) === 1; }
  /** Real-pixel position of the judge-grid marker cell (centre). */
  markerReal(): [number, number] | null {
    const mk = this.m.marker[0]; if (!mk) return null;
    const { judgeCell: C, judgeOrigin: [oa, ob] } = this.m;
    return worldToReal((mk[0] + 0.5) * C - oa, (mk[1] + 0.5) * C - ob);
  }
  /** Debug overlay: tint judge cells (red blocked, yellow special). */
  drawJudge(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number) {
    const { judgeW: W, judgeH: H, judgeCell: C, judgeOrigin: [oa, ob] } = this.m;
    const [a0, b0] = realToWorld(camX, camY), [a1, b1] = realToWorld(camX + vw, camY + vh);
    const [a2, b2] = realToWorld(camX + vw, camY), [a3, b3] = realToWorld(camX, camY + vh);
    const amin = Math.min(a0, a1, a2, a3), amax = Math.max(a0, a1, a2, a3), bmin = Math.min(b0, b1, b2, b3), bmax = Math.max(b0, b1, b2, b3);
    const gx0 = Math.max(0, Math.floor((amin + oa) / C)), gx1 = Math.min(W - 1, Math.floor((amax + oa) / C));
    const gy0 = Math.max(0, Math.floor((bmin + ob) / C)), gy1 = Math.min(H - 1, Math.floor((bmax + ob) / C));
    ctx.save(); ctx.globalAlpha = 0.35;
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      const v = this.judge[gy * W + gx]; if (v === 0) continue;
      ctx.fillStyle = v === 1 ? '#f00' : '#ff0';
      const a = gx * C - oa, b = gy * C - ob;
      const p = [worldToReal(a, b), worldToReal(a + C, b), worldToReal(a + C, b + C), worldToReal(a, b + C)];
      ctx.beginPath(); p.forEach(([x, y], i) => i ? ctx.lineTo(x - camX, y - camY) : ctx.moveTo(x - camX, y - camY)); ctx.fill();
    }
    ctx.restore();
  }
  get realW() { return this.m.w * this.m.chipW; }
  get realH() { return this.m.h * this.m.chipH; }

  private baseFrame(idx: number): Frame | null {
    for (let i = this.m.groundSlots - 1; i >= 0; i--) if (idx >= this.groundStarts[i]) return this.sets[i]!.pattern(idx - this.groundStarts[i]);
    return null;
  }
  private shadowSet(slot: number): SpriteSet | null {
    const f = this.m.lst[slot + 1];
    return f && f.endsWith('_sdw') ? this.sets[slot + 1] : null;
  }

  /** Draw ground + decor + objects (+ extra drawables, e.g. the player) depth-sorted. */
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number, extra: Drawable[] = []) {
    const { w, h, chipW: cw, chipH: ch } = this.m;
    const x0 = Math.max(0, Math.floor(camX / cw)), x1 = Math.min(w - 1, Math.floor((camX + vw) / cw));
    const y0 = Math.max(0, Math.floor(camY / ch) - 3), y1 = Math.min(h - 1, Math.floor((camY + vh) / ch) + 3);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, vw, vh);
    // base ground + overlay ground tiles
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const i = (cy * w + cx) * 3;
      const a = this.cells[i], u = this.cells[i + 1], p = this.cells[i + 2];
      const sx = cx * cw - camX, sy = cy * ch - camY;
      if (cy < Math.floor(camY / ch) || cy > Math.floor((camY + vh) / ch)) continue;
      const bf = this.baseFrame(a);
      if (bf) ctx.drawImage(bf.canvas, sx + bf.ox, sy + bf.oy);
      if (u >= 0 && u < this.m.groundSlots && (u > 0 || p > 0)) {
        const f = this.sets[u]!.pattern(p); if (f) ctx.drawImage(f.canvas, sx + f.ox, sy + f.oy);
      }
    }
    // collect shadows and sortable objects
    const shadows: (() => void)[] = [];
    const items: Drawable[] = [...extra];
    const addObj = (slot: number, pat: number, rx: number, ry: number) => {
      const set = this.sets[slot]; if (!set) return;
      const sh = this.shadowSet(slot);
      if (sh) shadows.push(() => { const f = sh.pattern(pat); if (f) ctx.drawImage(f.canvas, rx + f.ox - camX, ry + f.oy - camY); });
      if (set.isShadow) { shadows.push(() => { const f = set.pattern(pat); if (f) ctx.drawImage(f.canvas, rx + f.ox - camX, ry + f.oy - camY); }); return; }
      items.push({ y: ry, draw: () => { const f = set.pattern(pat); if (f) ctx.drawImage(f.canvas, rx + f.ox - camX, ry + f.oy - camY); } });
    };
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0 - 2; cx <= x1 + 2; cx++) {
      if (cx < 0 || cx >= w) continue;
      const i = (cy * w + cx) * 3; const u = this.cells[i + 1], p = this.cells[i + 2];
      if (u >= this.m.groundSlots && this.sets[u]) addObj(u, p, cx * cw + cw / 2, cy * ch + 40);
    }
    for (const o of this.objs) {
      if (o.ry < camY - 100 || o.ry > camY + vh + 300 || o.rx < camX - 200 || o.rx > camX + vw + 200) continue;
      addObj(o.slot, o.pat, o.rx, o.ry);
    }
    for (const s of shadows) s();
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw(ctx, camX, camY);
  }
}
