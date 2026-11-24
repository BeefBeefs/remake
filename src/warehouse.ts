import { Text } from './app.js';
import { ItemDb, Inventory, InvEntry, INV_COLS, INV_ROWS, drawTooltip } from './items.js';
import { Windows } from './windows.js';

const PANEL_W = 318, GX = 15, GY = 40, CELL = 32;

/** Towns with a warehouse: the scripts of these scenarios answer a click on object 10000300 with sentence 41 (the exe's warehouse window toggle). */
export const WAREHOUSE_OBJECT = 10000300;

/** Left-hand warehouse window. Click a stored item to take it out; while it is open, click an inventory item to store it. */
export class Warehouse {
  note = '';
  over(x: number, y: number) { return x < PANEL_W + 2 && y < 416; }
  private entryAt(win: Windows, x: number, y: number): InvEntry | undefined { return win.wh.at(Math.floor((x - GX) / CELL), Math.floor((y - GY) / CELL)); }
  /** Click inside the panel; true when the window was closed. */
  click(x: number, y: number, win: Windows): boolean {
    if (y >= 386 && y <= 404 && x >= 250 && x < 310) return true;
    const e = this.entryAt(win, x, y); if (!e) return false;
    if (win.inv.add(e.item, { unid: e.unid, dur: e.dur })) { win.wh.remove(e); this.note = `Took out ${win.label(e)}.`; } else this.note = 'Your inventory is full.';
    return false;
  }
  /** Click an inventory entry (right-hand window) while the warehouse is open: store it. */
  sell(x: number, y: number, win: Windows) {
    const e = win.entryAt(x, y); if (!e) return false;
    if (e.eq) { this.note = 'Take it off first.'; return false; }
    if (win.wh.add(e.item, { unid: e.unid, dur: e.dur })) { win.inv.remove(e); this.note = `Stored ${win.label(e)}.`; } else this.note = 'The warehouse is full.';
    return false;
  }
  draw(ctx: CanvasRenderingContext2D, text: Text, win: Windows, mx: number, my: number) {
    ctx.fillStyle = 'rgba(8,8,24,0.92)'; ctx.fillRect(0, 0, PANEL_W, 416);
    ctx.strokeStyle = '#a89868'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, PANEL_W - 2, 414);
    text.draw(ctx, 'Warehouse - click to take out, click your items to store', 10, 12);
    ctx.strokeStyle = 'rgba(168,152,104,0.35)'; ctx.lineWidth = 1;
    for (let i = 0; i <= INV_COLS; i++) { ctx.beginPath(); ctx.moveTo(GX + i * CELL + .5, GY); ctx.lineTo(GX + i * CELL + .5, GY + INV_ROWS * CELL); ctx.stroke(); }
    for (let j = 0; j <= INV_ROWS; j++) { ctx.beginPath(); ctx.moveTo(GX, GY + j * CELL + .5); ctx.lineTo(GX + INV_COLS * CELL, GY + j * CELL + .5); ctx.stroke(); }
    for (const e of win.wh.entries) { win.drawIcon(ctx, e.item, GX + e.x * CELL + e.w * CELL / 2, GY + e.y * CELL + e.h * CELL / 2); if (e.unid) text.draw(ctx, '?', GX + e.x * CELL + 3, GY + e.y * CELL + 3); }
    text.draw(ctx, 'Close', 262, 391); if (this.note) text.draw(ctx, this.note.slice(0, 50), 10, 391);
    const h = this.entryAt(win, mx, my); if (h && mx < PANEL_W) { const it = h.unid ? win.db.base(h.item) : h.item; drawTooltip(ctx, text, [win.label(h), `${it.type}`, 'Click to take out'], mx + 12, my + 12); }
  }
}
export const emptyStore = () => new Inventory();
