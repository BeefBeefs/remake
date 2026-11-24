import { put, Text } from './app.js';
/** Status (left) and Item (right) windows from System/Game/Pattern/Status.njp. Positions are absolute in the 640x480 screen. */
export class Windows {
    constructor(st, text) {
        this.st = st;
        this.text = text;
        this.status = false;
        this.item = false;
    }
    static async load(app) { return new Windows(await app.gui('Game_Status'), await Text.load(app)); }
    overUI(x, y) { return (this.status && x < 320 && y < 416) || (this.item && x >= 320 && y < 416); }
    draw(ctx, h, name) {
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
        }
    }
}
//# sourceMappingURL=windows.js.map