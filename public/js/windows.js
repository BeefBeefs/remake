import { put, Text } from './app.js';
import { ItemDb, Inventory, SECTION_NAMES, drawTooltip } from './items.js';
const GRID_X = 335, GRID_Y = 71, CELL = 32;
/** Status (left) and Item (right) windows from System/Game/Pattern/Status.njp. Positions are absolute in the 640x480 screen. */
export class Windows {
    constructor(st, icons, text, db) {
        this.st = st;
        this.icons = icons;
        this.text = text;
        this.db = db;
        this.status = false;
        this.item = false;
        this.inv = new Inventory();
    }
    static async load(app) { const [st, icons, text, db] = await Promise.all([app.gui('Game_Status'), app.gui('Game_Item0000'), Text.load(app), ItemDb.load()]); return new Windows(st, icons, text, db); }
    overUI(x, y) { return (this.status && x < 320 && y < 416) || (this.item && x >= 320 && y < 416); }
    draw(ctx, h, name, mx = -1, my = -1) {
        if (this.status) {
            put(ctx, this.st, 5);
            const t = this.text, v = (s, x, y) => t.draw(ctx, String(s), x, y);
            v(name.slice(0, 9), 22, 42);
            v('Fighter', 94, 42);
            v(h.level, 270, 42);
            v(`${h.exp}/${h.expMax}`, 250, 67);
            v(`${h.hp}/${h.hpMax}`, 60, 90);
            // attributes not decoded yet (Table.Tbd / Item.Ibn) -> placeholders
            v('--', 66, 115);
            v('--', 152, 115);
            v('--', 262, 115);
            v('--', 68, 139);
            v('--', 252, 139);
            v('--', 96, 163);
            v('--', 252, 163);
            v(`${h.mp}/${h.mpMax}`, 60, 194);
            v('--', 70, 218);
            v('--', 240, 218);
            v('--', 80, 242);
            v('--', 270, 242);
            for (let i = 0; i < 8; i++)
                v('0', 262, 267 + i * 16);
        }
        if (this.item) {
            put(ctx, this.st, 7, undefined, 320, 0);
            put(ctx, this.st, 8, undefined, 320, 0);
            for (const e of this.inv.entries) {
                const f = this.icons.pattern(ItemDb.icon(e.item));
                if (!f)
                    continue;
                const cx = GRID_X + e.x * CELL + (e.w * CELL - f.canvas.width) / 2, cy = GRID_Y + e.y * CELL + (e.h * CELL - f.canvas.height) / 2;
                ctx.drawImage(f.canvas, Math.round(cx), Math.round(cy));
            }
            const hover = this.inv.at(Math.floor((mx - GRID_X) / CELL), Math.floor((my - GRID_Y) / CELL));
            if (hover && mx >= GRID_X)
                drawTooltip(ctx, this.text, [hover.item.name, `${hover.item.type} (${SECTION_NAMES[hover.item.sec]})`, `Price: ${ItemDb.price(hover.item)}`], mx + 12, my + 12);
        }
    }
}
//# sourceMappingURL=windows.js.map