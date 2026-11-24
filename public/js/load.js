import { put, inRect, Text } from './app.js';
import { TitleScene } from './title.js';
import { GameScene } from './game.js';
import { ModeWindow } from './modewin.js';
import { listSlots, deleteSlot, SLOTS } from './saves.js';
const BOX_W = 262, BOX_H = 100, GX = 48, GY = 70, GAP_X = 20, GAP_Y = 12;
const boxRect = (i) => ({ x: GX + (i % 2) * (BOX_W + GAP_X), y: GY + Math.floor(i / 2) * (BOX_H + GAP_Y), w: BOX_W, h: BOX_H });
/** LOAD DATA screen (manual: "The boxes numbered from 1 to 6 are saved data files. Choose a saved file, then click OK; DELETE erases it"). OK opens the game-mode window. */
export class LoadScene {
    constructor(app, s, t, text) {
        this.app = app;
        this.s = s;
        this.t = t;
        this.text = text;
        this.slots = listSlots();
        this.sel = -1;
        this.confirm = false;
        this.mode = null;
        this.busy = false;
        this.epPick = 0; // episode the selected save continues in (never lower than its own)
        this.epRect = { x: 60, y: 408, w: 300, h: 24 };
    }
    static async create(app) { return new LoadScene(app, await app.gui('Select_Select'), await app.gui('Title_Title'), await Text.load(app)); }
    epOf() { const d = this.slots[this.sel]; return d ? Math.max(d.ep ?? 1, this.epPick || 1) : 1; }
    has() { return this.sel >= 0 && !!this.slots[this.sel]; }
    update(dt) {
        const i = this.app.input, s = this.s;
        if (this.busy)
            return;
        if (this.mode) {
            const r = this.mode.update(dt);
            if (r === 'back')
                this.mode = null;
            else if (r === 'single') {
                const d = this.slots[this.sel];
                this.busy = true;
                GameScene.create(this.app, d.gender, d.name, { scenario: d.scenario, load: d, slot: this.sel, ep: this.epOf() }).then(g => this.app.go(g));
            }
            return;
        }
        if (this.confirm) {
            if (i.pressed.has('escape'))
                this.confirm = false;
            if (i.clicked) {
                if (this.inYes(i.x, i.y)) {
                    deleteSlot(this.sel);
                    this.slots = listSlots();
                    this.sel = -1;
                    this.confirm = false;
                }
                else if (this.inNo(i.x, i.y))
                    this.confirm = false;
            }
            return;
        }
        if (i.pressed.has('escape')) {
            TitleScene.create(this.app).then(t => this.app.go(t));
            return;
        }
        if (!i.clicked)
            return;
        for (let k = 0; k < SLOTS; k++) {
            const r = boxRect(k);
            if (i.x >= r.x && i.x < r.x + r.w && i.y >= r.y && i.y < r.y + r.h) {
                this.sel = k;
                this.epPick = this.slots[k]?.ep ?? 1;
                return;
            }
        }
        const e = this.epRect;
        if (this.has() && i.x >= e.x && i.x < e.x + e.w && i.y >= e.y && i.y < e.y + e.h) {
            const lo = this.slots[this.sel].ep ?? 1, cur = this.epOf();
            this.epPick = cur >= 4 ? lo : cur + 1;
            return;
        }
        if (inRect(s.pattern(2), i.x, i.y))
            TitleScene.create(this.app).then(t => this.app.go(t));
        else if (inRect(s.pattern(4), i.x, i.y) && this.has())
            this.mode = new ModeWindow(this.app, s, this.text);
        else if (inRect(s.pattern(6), i.x, i.y) && this.has())
            this.confirm = true;
    }
    inYes(x, y) { return x >= 220 && x < 310 && y >= 270 && y < 296; }
    inNo(x, y) { return x >= 330 && x < 420 && y >= 270 && y < 296; }
    box(ctx, k, d) {
        const r = boxRect(k), on = k === this.sel;
        ctx.fillStyle = on ? 'rgba(70,52,24,0.92)' : 'rgba(18,22,26,0.88)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = on ? '#e8c860' : '#7a6a48';
        ctx.lineWidth = on ? 2 : 1;
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        this.text.draw(ctx, String(k + 1), r.x + 8, r.y + 8);
        if (!d) {
            this.text.drawCenter(ctx, 'No Data', r.x + r.w / 2, r.y + r.h / 2 - 6);
            return;
        }
        this.text.draw(ctx, d.name, r.x + 28, r.y + 8);
        this.text.draw(ctx, `Lv ${d.hud.level}   ${d.gender === 'male' ? 'Male' : 'Female'}`, r.x + 28, r.y + 28);
        this.text.draw(ctx, d.area && d.area.length <= 24 && !d.area.includes('\n') ? d.area : `Area ${d.scenario}`, r.x + 28, r.y + 48);
        this.text.draw(ctx, `${d.gold} G`, r.x + 28, r.y + 68);
        if (d.at)
            this.text.draw(ctx, new Date(d.at).toISOString().slice(0, 16).replace('T', ' '), r.x + r.w - 124, r.y + r.h - 18);
    }
    draw(ctx) {
        const i = this.app.input, s = this.s, hov = (p) => !this.mode && !this.confirm && inRect(s.pattern(p), i.x, i.y);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 640, 480);
        put(ctx, this.t, 5, 2);
        put(ctx, s, 37);
        this.slots.forEach((d, k) => this.box(ctx, k, d));
        put(ctx, s, hov(4) ? 5 : 4);
        put(ctx, s, hov(2) ? 3 : 2);
        if (this.has())
            put(ctx, s, hov(6) ? 13 : 6);
        if (this.has() && !this.confirm && !this.mode) {
            const e = this.epRect, lo = this.slots[this.sel].ep ?? 1;
            this.text.draw(ctx, `Continue in Episode ${this.epOf()} >${this.epOf() > lo ? ' (upgrade)' : ''}`, e.x, e.y + 6);
        }
        if (this.confirm) {
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, 0, 640, 480);
            put(ctx, s, 38);
            const d = this.slots[this.sel];
            this.text.drawCenter(ctx, `Delete "${d.name}"?`, 320, 210);
            this.text.drawCenter(ctx, 'This cannot be undone.', 320, 232);
            for (const [lbl, x, ok] of [['YES', 220, this.inYes(i.x, i.y)], ['NO', 330, this.inNo(i.x, i.y)]]) {
                ctx.strokeStyle = ok ? '#e8c860' : '#7a6a48';
                ctx.strokeRect(x + 0.5, 270.5, 89, 25);
                this.text.drawCenter(ctx, lbl, x + 45, 277);
            }
        }
        this.mode?.draw(ctx);
        if (this.busy)
            this.text.drawCenter(ctx, 'Loading...', 320, 440);
    }
}
//# sourceMappingURL=load.js.map