import { SpriteSet } from './sprites.js';
/** Native screen size of the original game (the HUD patterns hold absolute 640x480 positions). */
export const SCREEN_W = 640, SCREEN_H = 480, HUD_Y = 412;
/** HUD built from System/Game/Pattern/Bar.njp (+ Font00 / System cursor). Pattern numbers per docs/FORMATS.md. */
export class Gui {
    constructor(bar, font, sys) {
        this.bar = bar;
        this.font = font;
        this.sys = sys;
    }
    static async load() {
        const [bar, font, sys] = await Promise.all([
            SpriteSet.load('data/ep1/gui/Game_Bar'), SpriteSet.load('data/ep1/gui/Common_Font00'), SpriteSet.load('data/ep1/gui/Game_System'),
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
    cursor(ctx, x, y, pressed = false) {
        const f = this.sys.pattern(pressed ? 1 : 0);
        if (f)
            ctx.drawImage(f.canvas, x + f.ox, y + f.oy);
    }
}
//# sourceMappingURL=gui.js.map