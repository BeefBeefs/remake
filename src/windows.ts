import { App, put, Text } from './app.js';
import { SpriteSet } from './sprites.js';
import { HudState } from './gui.js';
import { PlayerStats } from './pstats.js';
import { ItemDb, ItemDef, Inventory, InvEntry, SECTION_NAMES, drawTooltip } from './items.js';

export interface CombatStats { atkMin: number; atkMax: number; defense: number; speed: number; }

const GRID_X = 335, GRID_Y = 71, CELL = 32;

/** Status (left) and Item (right) windows from System/Game/Pattern/Status.njp. Positions are absolute in the 640x480 screen. */
export class Windows {
  status = false; item = false; magic = false; mapOpen = false; ps?: PlayerStats;
  /** HUD elements that sit above the world view (the magic bar) and must swallow clicks. */
  hudOver: ((x: number, y: number) => boolean) | null = null;
  inv = new Inventory(); gold = 0;
  /** Set while a shop is open: clicking an inventory item sells it for this price (tooltip hint). */
  sellValue: ((it: ItemDef) => number) | null = null;
  private constructor(private st: SpriteSet, private icons: SpriteSet, private text: Text, public db: ItemDb) {}
  static async load(app: App) { const [st, icons, text, db] = await Promise.all([app.gui('Game_Status'), app.gui('Game_Item0000'), Text.load(app), ItemDb.load()]); return new Windows(st, icons, text, db); }
  /** Draw an item's inventory icon centred on (cx, cy). */
  drawIcon(ctx: CanvasRenderingContext2D, it: ItemDef, cx: number, cy: number, scale = 1) { const f = this.icons.pattern(ItemDb.icon(it)); if (f) { const w = f.canvas.width * scale, h = f.canvas.height * scale; ctx.drawImage(f.canvas, Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h)); } }
  /** Combat numbers from the equipped items (weapon attack range, summed armor defense, weapon attack speed %). */
  stats(): CombatStats {
    const w = this.inv.equipped('weapon')[0];
    const [atkMin, atkMax] = w ? ItemDb.attack(w.item) : [0, 0];
    return { atkMin, atkMax, defense: this.inv.equipped().reduce((a, e) => a + (e.item.sec === 1 ? ItemDb.defense(e.item) : 0), 0), speed: w ? ItemDb.speed(w.item) : 100 };
  }
  /** Inventory entry under screen point (x,y) while the item window is open. */
  entryAt(x: number, y: number): InvEntry | undefined { return this.item && x >= GRID_X ? this.inv.at(Math.floor((x - GRID_X) / CELL), Math.floor((y - GRID_Y) / CELL)) : undefined; }
  /** Extra left-hand panel (shop) that also blocks world clicks. */
  panel: ((x: number, y: number) => boolean) | null = null;
  overUI(x: number, y: number) { return (this.panel?.(x, y) ?? false) || (this.hudOver?.(x, y) ?? false) || ((this.status || this.magic || this.mapOpen) && x < 320 && y < 416) || (this.item && x >= 320 && y < 416); }
  draw(ctx: CanvasRenderingContext2D, h: HudState, name: string, mx = -1, my = -1) {
    if (this.status) {
      put(ctx, this.st, 5);
      const t = this.text, v = (s: string | number, x: number, y: number) => t.draw(ctx, String(s), x, y);
      v(name.slice(0, 9), 22, 42); v('Fighter', 94, 42); v(h.level, 270, 42);
      v(`${h.exp}/${h.expMax}`, 250, 67);
      v(`${h.hp}/${h.hpMax}`, 60, 90);
      // Attack / Defense / Attack Speed come from the equipped items; the rest is not decoded yet -> placeholders
      const cs = this.stats(); const rng = cs.atkMax ? (cs.atkMin === cs.atkMax ? `${cs.atkMax}` : `${cs.atkMin}-${cs.atkMax}`) : '0';
      const ps = this.ps, n = (x?: number) => x === undefined ? '--' : x;
      v(n(ps?.strength), 66, 115); v(rng, 152, 115); v(cs.defense, 262, 115);
      v(n(ps?.hit), 68, 139); v(n(ps?.eva), 252, 139);
      v('--', 96, 163); v(`${cs.speed}%`, 252, 163);
      v(`${h.mp}/${h.mpMax}`, 60, 194);
      v('--', 70, 218); v('--', 240, 218); v(n(ps?.mhit), 80, 242); v(n(ps?.meva), 270, 242);
      for (let i = 0; i < 8; i++) v('0', 262, 267 + i * 16);
    }
    if (this.item) {
      put(ctx, this.st, 7, undefined, 320, 0); put(ctx, this.st, 8, undefined, 320, 0);
      for (const e of this.inv.entries) {
        const f = this.icons.pattern(ItemDb.icon(e.item)); if (!f) continue;
        const cx = GRID_X + e.x * CELL + (e.w * CELL - f.canvas.width) / 2, cy = GRID_Y + e.y * CELL + (e.h * CELL - f.canvas.height) / 2;
        ctx.drawImage(f.canvas, Math.round(cx), Math.round(cy));
        if (e.eq) { ctx.strokeStyle = '#60e060'; ctx.lineWidth = 2; ctx.strokeRect(GRID_X + e.x * CELL + 1, GRID_Y + e.y * CELL + 1, e.w * CELL - 2, e.h * CELL - 2); }
      }
      this.text.draw(ctx, `Gold: ${this.gold}`, 340, 398);
      const hover = this.inv.at(Math.floor((mx - GRID_X) / CELL), Math.floor((my - GRID_Y) / CELL));
      if (hover && mx >= GRID_X) {
        const it = hover.item, lines = [it.name, `${it.type} (${SECTION_NAMES[it.sec]})`];
        if (it.sec === 0) { const [a, b] = ItemDb.attack(it); lines.push(`Attack: ${a === b ? a : `${a}-${b}`}  Speed: ${ItemDb.speed(it)}%`); }
        else if (it.sec === 1) lines.push(`Defense: ${ItemDb.defense(it)}`);
        lines.push(`Price: ${ItemDb.price(it)}`); if (this.sellValue) lines.push(`Click to sell for ${this.sellValue(it)}`); else if (ItemDb.slot(it)) lines.push(hover.eq ? '[Equipped] click to remove' : 'Click to equip');
        drawTooltip(ctx, this.text, lines, mx + 12, my + 12);
      }
    }
  }
}
