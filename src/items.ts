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
  /** Belt-pocket candidates: tablets, capsules, sources and fruits (consumables flagged with field 26). */
  static beltable(it: ItemDef) { return it.sec === 3 && (it.f['26'] ?? 0) === 1; }
  /** Effect of using a consumable: HP / MP recovered (fields 27 / 28) and permanent max HP / MP gained (fields 29 / 30). */
  static effect(it: ItemDef) { return { hp: it.f['27'] ?? 0, mp: it.f['28'] ?? 0, maxHp: it.f['29'] ?? 0, maxMp: it.f['30'] ?? 0 }; }
  /** Equipment slot: weapons/accessories by section, armor by field 0 (0 head, 1 body, 2 shield/book, 3 boots). Null for consumables/misc. */
  static slot(it: ItemDef): Slot | null { return it.sec === 0 ? 'weapon' : it.sec === 1 ? ARMOR_SLOTS[it.f['0'] ?? 1] ?? null : it.sec === 2 ? 'accessory' : null; }
  /** Weapon damage range (fields 36/37) and attack speed in percent (field 27). */
  /** Weapon attack power = field 26 (20 Short Sword ... 4800 Stinger; scales with price, the Glass Sword has 460 power but only 100 durability = field 25). Fields 36/37 are the power RANK used by the drop generator, not damage. */
  static attack(it: ItemDef): [number, number] { const a = it.f['26'] ?? 0; return [a, a]; }
  static speed(it: ItemDef) { return it.f['27'] ?? 100; }
  /** Armor defense = field 28 (6 boots ... 170 Knight Plate; field 25 is durability, 36/37 the drop rank). */
  static defense(it: ItemDef) { return it.f['28'] ?? 0; }
}

export const INV_COLS = 9, INV_ROWS = 10;
export interface InvEntry { item: ItemDef; x: number; y: number; w: number; h: number; eq?: boolean; }
export type Slot = 'weapon' | 'head' | 'body' | 'shield' | 'boots' | 'accessory';
const ARMOR_SLOTS: Slot[] = ['head', 'body', 'shield', 'boots'];

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
  /** Toggle equipping; equipping replaces whatever occupies the same slot. Returns false for non-equipment. */
  toggleEquip(e: InvEntry) {
    const slot = ItemDb.slot(e.item); if (!slot) return false;
    if (e.eq) { e.eq = false; return true; }
    for (const o of this.entries) if (o.eq && ItemDb.slot(o.item) === slot) o.eq = false;
    e.eq = true; return true;
  }
  equipped(slot?: Slot) { return this.entries.filter(e => e.eq && (!slot || ItemDb.slot(e.item) === slot)); }
}

export function drawTooltip(ctx: CanvasRenderingContext2D, text: Text, lines: string[], x: number, y: number) {
  const w = Math.max(...lines.map(l => l.length)) * 6 + 8, h = lines.length * 13 + 6;
  x = Math.min(x, 640 - w - 2); y = Math.min(y, 480 - h - 2);
  ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#a08840'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  lines.forEach((l, i) => text.draw(ctx, l, x + 4, y + 3 + i * 13));
}
