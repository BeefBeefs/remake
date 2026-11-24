import { Text } from './app.js';

/** One record of Item.Ibn (see docs/FORMATS.md). `f` holds the non-zero 32-bit fields by index. */
export interface ItemDef { name: string; type: string; f: Record<string, number>; sec: number; idx: number; }
export const SECTION_NAMES = ['Weapon', 'Armor', 'Accessory', 'Consumable', 'Misc'];

export class ItemDb {
  sections: ItemDef[][];
  private constructor(raw: { name: string; type: string; f: Record<string, number> }[][]) {
    this.sections = raw.map((s, sec) => s.map((it, idx) => ({ ...it, sec, idx })));
  }
  static async load() { return new ItemDb(await (await fetch('data/ep1/items.json')).json()); }
  /** Script item reference: category = section, id = field 1 (0 when absent). */
  find(cat: number, id: number) { return this.sections[cat]?.find(it => (it.f['1'] ?? 0) === id); }
  get(sec: number, idx: number) { return this.sections[sec]?.[idx]; }
  /** Icon = pattern index in System/Game/Pattern/Item0000.njp (field 11). */
  static icon(it: ItemDef) { return it.f['11'] ?? 0; }
  /** Footprint in inventory cells (fields 7 x 8). */
  static size(it: ItemDef): [number, number] { return [it.f['7'] || 1, it.f['8'] || 1]; }
  static price(it: ItemDef) { return it.f['5'] ?? 0; }
}

export const INV_COLS = 9, INV_ROWS = 10;
export interface InvEntry { item: ItemDef; x: number; y: number; w: number; h: number; }

/** Grid inventory with first-fit placement. */
export class Inventory {
  entries: InvEntry[] = [];
  private fits(x: number, y: number, w: number, h: number) {
    if (x + w > INV_COLS || y + h > INV_ROWS) return false;
    return !this.entries.some(e => x < e.x + e.w && x + w > e.x && y < e.y + e.h && y + h > e.y);
  }
  add(item: ItemDef): boolean {
    const [w, h] = ItemDb.size(item);
    for (let y = 0; y < INV_ROWS; y++) for (let x = 0; x < INV_COLS; x++)
      if (this.fits(x, y, w, h)) { this.entries.push({ item, x, y, w, h }); return true; }
    return false;
  }
  at(cx: number, cy: number) { return this.entries.find(e => cx >= e.x && cx < e.x + e.w && cy >= e.y && cy < e.y + e.h); }
  remove(e: InvEntry) { this.entries.splice(this.entries.indexOf(e), 1); }
}

export function drawTooltip(ctx: CanvasRenderingContext2D, text: Text, lines: string[], x: number, y: number) {
  const w = Math.max(...lines.map(l => l.length)) * 6 + 8, h = lines.length * 13 + 6;
  x = Math.min(x, 640 - w - 2); y = Math.min(y, 480 - h - 2);
  ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#a08840'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  lines.forEach((l, i) => text.draw(ctx, l, x + 4, y + 3 + i * 13));
}
