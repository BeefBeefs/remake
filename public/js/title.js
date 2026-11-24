import { put, inRect, Text } from './app.js';
import { SelectScene } from './select.js';
/** Title screen: System/Title/Pattern/Title.njp (0 = backdrop, 1..3 = menu entries, 4 = copyright). */
export class TitleScene {
    constructor(app, t, text) {
        this.app = app;
        this.t = t;
        this.text = text;
        this.msg = '';
        this.msgT = 0;
        this.items = [1, 2, 3];
    }
    static async create(app) { return new TitleScene(app, await app.gui('Title_Title'), await Text.load(app)); }
    update(dt) {
        const i = this.app.input;
        this.msgT = Math.max(0, this.msgT - dt);
        if (!i.clicked)
            return;
        const hit = this.items.findIndex(p => inRect(this.t.pattern(p), i.x, i.y));
        if (hit === 0)
            SelectScene.create(this.app).then(s => this.app.go(s));
        else if (hit === 1) {
            this.msg = 'Load game: not implemented yet';
            this.msgT = 2500;
        }
        else if (hit === 2) {
            this.msg = 'Close the tab to exit :)';
            this.msgT = 2500;
        }
    }
    draw(ctx) {
        const i = this.app.input;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 640, 480);
        put(ctx, this.t, 0);
        for (const p of this.items)
            put(ctx, this.t, p, inRect(this.t.pattern(p), i.x, i.y) ? 3 : 1);
        put(ctx, this.t, 4);
        if (this.msgT > 0)
            this.text.drawCenter(ctx, this.msg, 320, 340);
        const c = this.app.input;
        const f = this.t;
        void f;
        void c;
    }
}
//# sourceMappingURL=title.js.map