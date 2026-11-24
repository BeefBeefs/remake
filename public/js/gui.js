import { Data } from './data.js';
import { SpriteSet } from './sprites.js';
/** Native screen size of the original game (the HUD patterns hold absolute 640x480 positions). */
export const SCREEN_W = 640, SCREEN_H = 480, HUD_Y = 412;
/** Belt pocket slot rectangles of the HUD (the frames are part of the panel image): 1-4 on the upper row, 5-8 on the lower one. */
export const BELT = Array.from({ length: 8 }, (_, k) => ({ x: (k < 4 ? 360 : 408) + (k % 4) * 32, y: k < 4 ? 417 : 449, w: 26, h: 23 }));
/** Clickable HUD areas: MINE button, power-up button (crossed swords at the left of the panel) and the companion HP gauge (click = attack mode). */
export const MINE_BTN = { x: 494, y: 422, w: 20, h: 20 }, POWER_BTN = { x: 25, y: 408, w: 34, h: 23 }, PET_GAUGE = { x: 0, y: 391, w: 112, h: 18 };
export const inBox = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
/** HUD built from System/Game/Pattern/Bar.njp (+ Font00 / System cursor). Pattern numbers per docs/FORMATS.md. */
export class Gui {
    constructor(bar, font, sys) {
        this.bar = bar;
        this.font = font;
        this.sys = sys;
    }
    static async load() {
        const [bar, font, sys] = await Promise.all([
            SpriteSet.load(Data.url('gui/Game_Bar')), SpriteSet.load(Data.url('gui/Common_Font00')), SpriteSet.load(Data.url('gui/Game_System')),
        ]);
        return new Gui(bar, font, sys);
    }
    put(ctx, f, frac = 1) {
        if (!f)
            return;
        const w = Math.max(0, Math.round(f.canvas.width * Math.min(1, frac)));
        if (w > 0)
            ctx.drawImage(f.canvas, 0, 0, w, f.canvas.height, f.ox, f.oy, w, f.canvas.height);
    }
    /** ASCII text with the 6x12 half-width font (pattern 0 of Font00: 16x16 cells indexed by byte value). */
    text(ctx, s, x, y) {
        const f = this.font.pattern(0);
        if (!f)
            return;
        for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i) & 0xff;
            ctx.drawImage(f.canvas, (c & 15) * 6, (c >> 4) * 12, 6, 12, x + i * 6, y, 6, 12);
        }
    }
    /** Small 6x9 digits (Bar patterns 19..28). */
    digits(ctx, n, x, y) {
        const s = String(Math.max(0, Math.floor(n)));
        for (let i = 0; i < s.length; i++) {
            const f = this.bar.pattern(19 + +s[i]);
            if (f)
                ctx.drawImage(f.canvas, x + i * 6, y);
        }
    }
    draw(ctx, h) {
        this.put(ctx, this.bar.pattern(7)); // decorative edge strip above the panel
        this.put(ctx, this.bar.pattern(8)); // panel
        this.put(ctx, this.bar.pattern(2)); // HP bar backing
        this.put(ctx, this.bar.pattern(0), h.hp / h.hpMax);
        this.put(ctx, this.bar.pattern(5)); // MP bar backing
        this.put(ctx, this.bar.pattern(3), h.mp / h.mpMax);
        this.put(ctx, this.bar.pattern(15)); // EXP frame
        this.put(ctx, this.bar.pattern(14), h.exp / h.expMax);
        this.put(ctx, this.bar.pattern(h.running ? 11 : 10)); // RUN / WALK highlight
        this.digits(ctx, h.level, 52, 465);
    }
    /** Which HUD button is under (x,y): Bar patterns 17/16/18 are the white hit masks for MENU/ITEM/STATUS. */
    button(x, y) {
        const test = (p) => {
            const f = this.bar.pattern(p);
            if (!f || x < f.ox || y < f.oy || x >= f.ox + f.canvas.width || y >= f.oy + f.canvas.height)
                return false;
            return f.canvas.getContext('2d').getImageData(Math.floor(x - f.ox), Math.floor(y - f.oy), 1, 1).data[3] > 0;
        };
        return test(17) ? 'menu' : test(16) ? 'item' : test(18) ? 'status' : null;
    }
    /** Companion HP gauge ("PARTNER HP", Bar patterns 29-32) with the ACTIVE / INACTIVE label. */
    partner(ctx, frac, active) {
        this.put(ctx, this.bar.pattern(30));
        this.put(ctx, this.bar.pattern(29), Math.max(0, Math.min(1, frac)));
        this.put(ctx, this.bar.pattern(active ? 31 : 32));
    }
    /** Power-up button: dim when unavailable, blinking when it can be used, steady bright while the power mode lasts. */
    power(ctx, state, t) {
        this.put(ctx, this.bar.pattern(state === 'on' || (state === 'ready' && Math.floor(t / 350) % 2 === 0) ? 12 : 13));
    }
    cursor(ctx, x, y, pressed = false) {
        const f = this.sys.pattern(pressed ? 1 : 0);
        if (f)
            ctx.drawImage(f.canvas, x + f.ox, y + f.oy);
    }
}
//# sourceMappingURL=gui.js.map