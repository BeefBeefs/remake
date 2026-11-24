import { SpriteSet, Frame } from './sprites.js';

export interface MapJson {
  name: string; w: number; h: number; chipW: number; chipH: number; groundSlots: number;
  lst: string[]; cells: string; judge: string; objects: [x: number, y: number, slot: number, pat: number][];
}

/** World (iso) -> real pixel conversion used by RKC_RPGSCRN (defaults 15 / 10). */
export const worldToReal = (wx: number, wy: number): [number, number] => [Math.trunc((wx - wy) * 15 / 100), Math.trunc((wx + wy) * 10 / 100)];
export const realToWorld = (rx: number, ry: number): [number, number] => [Math.round((rx * 10 + ry * 15) * 100 / 300 / 1) , Math.round((ry * 15 - rx * 10) * 100 / 300)];

export interface Drawable { y: number; draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void; }

function b64(s: string): Uint8Array { const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }

export class GameMap {
  cells: Int16Array;
  sets: (SpriteSet | null)[] = [];
  /** [slot, firstPattern] boundaries of the concatenated ground sets */
  private groundStarts: number[] = [];
  private objs: { rx: number; ry: number; slot: number; pat: number }[] = [];
  constructor(public m: MapJson) {
    const raw = b64(m.cells);
    this.cells = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
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
      const bf = a > 0 || u > 0 || p > 0 ? this.baseFrame(a) : null;
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
