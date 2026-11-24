import { Text } from './app.js';
import { ItemDb, ItemDef, SECTION_NAMES, drawTooltip } from './items.js';
import { Windows } from './windows.js';

const ROWS = 14, ROW_H = 22, LIST_Y = 40, PANEL_W = 318;

/** Sell price of an item (PLACEHOLDER: the original formula is unknown; a quarter of the listed price). */
export const sellPrice = (it: ItemDef) => Math.max(ItemDb.price(it) > 0 ? 1 : 0, Math.floor(ItemDb.price(it) / 4));

/**
 * Stock of shop `index` (script sentence 5). PLACEHOLDER: the original stock list lives in a structure the script
 * VM owns (script context +0x34) that has not been located. We sell the plain base items (name == type) of weapons,
 * armor and consumables up to a price cap that grows with the shop index.
 */
export function shopStock(db: ItemDb, index: number): ItemDef[] {
  const cap = 1500 + index * 1500, out: ItemDef[] = [];
  for (const sec of [0, 1]) for (const it of db.sections[sec]) if (it.name === it.type && ItemDb.price(it) <= cap) out.push(it);
  for (const it of db.sections[3]) if (['Tablet', 'Capsule', 'Meat', 'Quality Meat'].includes(it.name)) out.push(it);
  return out;
}

/** Left-hand shop window: click an entry to buy it; while it is open clicking an inventory item sells it. */
export class Shop {
  page = 0; note = '';
  constructor(public stock: ItemDef[]) {}
  private get pages() { return Math.max(1, Math.ceil(this.stock.length / ROWS)); }
  private rowAt(x: number, y: number) { const r = Math.floor((y - LIST_Y) / ROW_H); return x >= 8 && x < PANEL_W - 8 && r >= 0 && r < ROWS ? this.stock[this.page * ROWS + r] : undefined; }
  private button(x: number, y: number): 'prev' | 'next' | 'close' | null {
    if (y < 386 || y > 404) return null;
    return x >= 10 && x < 70 ? 'prev' : x >= 80 && x < 140 ? 'next' : x >= 250 && x < 310 ? 'close' : null;
  }
  over(x: number, y: number) { return x < PANEL_W + 2 && y < 416; }
  /** Handle a click; returns true when the shop was closed. */
  click(x: number, y: number, win: Windows): boolean {
    const b = this.button(x, y);
    if (b === 'close') return true;
    if (b === 'prev') this.page = Math.max(0, this.page - 1);
    else if (b === 'next') this.page = Math.min(this.pages - 1, this.page + 1);
    const it = this.rowAt(x, y);
    if (it) {
      const p = ItemDb.price(it);
      if (win.gold < p) this.note = 'Not enough gold.';
      else if (!win.inv.add(it)) this.note = 'Your inventory is full.';
      else { win.gold -= p; this.note = `Bought ${it.name}.`; }
    }
    return false;
  }
  /** Sell the inventory entry under (x, y) if there is one. */
  sell(x: number, y: number, win: Windows) {
    const e = win.entryAt(x, y); if (!e) return false;
    win.inv.remove(e); const g = sellPrice(e.item); win.gold += g; this.note = `Sold ${e.item.name} for ${g} gold.`; return true;
  }
  draw(ctx: CanvasRenderingContext2D, text: Text, win: Windows, mx: number, my: number) {
    ctx.fillStyle = 'rgba(8,8,24,0.92)'; ctx.fillRect(0, 0, PANEL_W, 416);
    ctx.strokeStyle = '#a89868'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, PANEL_W - 2, 414);
    text.draw(ctx, 'Shop - click to buy, click your items to sell', 10, 12);
    text.draw(ctx, `Gold: ${win.gold}`, 10, 26);
    const first = this.page * ROWS;
    for (let r = 0; r < ROWS && first + r < this.stock.length; r++) {
      const it = this.stock[first + r], y = LIST_Y + r * ROW_H;
      if (mx >= 8 && mx < PANEL_W - 8 && my >= y && my < y + ROW_H) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(8, y, PANEL_W - 16, ROW_H); }
      { const [cw, ch] = ItemDb.size(it); win.drawIcon(ctx, it, 24, y + ROW_H / 2, Math.min(0.6, 18 / (ch * 32), 26 / (cw * 32))); }
      text.draw(ctx, it.name.slice(0, 26), 42, y + 5); text.drawRight(ctx, String(ItemDb.price(it)), PANEL_W - 12, y + 5);
    }
    text.draw(ctx, '< Prev', 12, 391); text.draw(ctx, 'Next >', 82, 391); text.draw(ctx, `${this.page + 1}/${this.pages}`, 150, 391); text.draw(ctx, 'Close', 262, 391);
    if (this.note) text.draw(ctx, this.note.slice(0, 50), 10, 372);
    const hv = this.rowAt(mx, my);
    if (hv) {
      const lines = [hv.name, `${hv.type} (${SECTION_NAMES[hv.sec]})`];
      if (hv.sec === 0) { const [a, b] = ItemDb.attack(hv); lines.push(`Attack: ${a === b ? a : `${a}-${b}`}  Speed: ${ItemDb.speed(hv)}%`); } else if (hv.sec === 1) lines.push(`Defense: ${ItemDb.defense(hv)}`);
      lines.push(`Price: ${ItemDb.price(hv)}`); drawTooltip(ctx, text, lines, mx + 12, my + 12);
    }
  }
}
