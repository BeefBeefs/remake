import { put } from './app.js';
import { drawTooltip } from './items.js';
/**
 * Spell list. Names and descriptions are the exe's own strings (Table.Tbd 601-621). Everything else is a GUESS:
 *  - icon: index into Game/MagicIcon (the bar uses the same icon + 2); matched by looking at the pictures and the description,
 *  - mp: only Heal (40 MP at magic level 1) is documented, in the manual's magic window screenshot,
 *  - kind: how the spell works in this remake (see SPELL_FX in spellfx.ts); every spell of the list now has an effect.
 */
const DEF = [
    [601, 3, 20, 'bolt', '#ff8a28'], [602, 4, 20, 'bolt', '#7ad0ff'], [603, 5, 25, 'bolt', '#ffe860'], [604, 18, 60, 'nova', '#ff5a20'], [605, 14, 50, 'nova', '#9fe4ff'],
    [606, 8, 40, 'heal', ''], [607, 9, 80, 'moon', ''], [608, 10, 30, 'buff', ''], [609, 11, 30, 'buff', ''], [610, 12, 30, 'pierce', '#b08850'],
    [611, 6, 40, 'fan', '#ff7a30'], [612, 7, 40, 'pierce', '#8ad8ff'], [613, 15, 50, 'storm', '#fff070'], [614, 16, 40, 'bolt', '#a0e070'], [615, 0, 20, 'blade', '#e8e8ff'],
    [616, 13, 40, 'bolt', '#a08050'], [617, 20, 10, 'identify', ''], [618, 2, 30, 'buff', ''], [619, 19, 30, 'buff', ''], [620, 17, 60, 'petnova', ''], [621, 23, 80, 'strike', '#ffffff'],
];
/** A new hero knows no spell: they are learned by level history (career.ts, decoded from the exe). Saves of earlier builds keep the Heal / Fire Ball they started with. */
const START = [];
const PER_PAGE = 6, ROW_Y = 52, ROW_H = 50, LIST_X = 28;
/** Slots of the Magic window's own bar (part of the frame art, Game/Status pattern 6) and of the HUD bar. */
export const WIN_SLOTS = Array.from({ length: 8 }, (_, k) => ({ x: 32 + k * 32, y: 359, w: 26, h: 26 }));
const HUD_X = 192, HUD_Y0 = 389, HUD_PITCH = 19;
export const BAR_SLOTS = Array.from({ length: 9 }, (_, k) => ({ x: HUD_X + k * HUD_PITCH + (k === 8 ? 6 : 0), y: HUD_Y0, w: 18, h: 18 }));
export const MAX_MAGIC_LEVEL = 10, EXP_PER_LEVEL = 20;
export class Magic {
    constructor(win, mi, mb, tables) {
        this.win = win;
        this.mi = mi;
        this.mb = mb;
        this.known = [...START];
        /** Spell id per bar slot (0 = empty). */
        this.bar = [0, 0, 0, 0, 0, 0, 0, 0];
        /** Selected bar entry: 0-7 = magic slots (F1-F8), 8 = attack (F9). */
        this.sel = 8;
        this.prog = new Map(); // spell id -> [magic level, exp]
        this.page = 0;
        this.spells = DEF.map(([id, icon, mp, kind, color]) => {
            const s = (tables[String(id)]?.s ?? ['?']).map(l => l.replace(/\u3000/g, '').trim());
            const [name, attr] = (s[0] ?? '?').split(' - ');
            return { id, name, attr: attr ?? '', desc: s.slice(1).filter(l => l), icon, mp, kind, color };
        });
    }
    static async load(app, tables) {
        const [win, mi, mb] = await Promise.all([app.gui('Game_Status'), app.gui('Game_MagicIcon'), app.gui('Game_MagicBarIcon')]);
        return new Magic(win, mi, mb, tables);
    }
    spell(id) { return this.spells.find(s => s.id === id); }
    learn(id) { if (this.spell(id) && !this.known.includes(id))
        this.known.push(id); }
    level(id) { return this.prog.get(id)?.[0] ?? 1; }
    exp(id) { return this.prog.get(id)?.[1] ?? 0; }
    /** Add one use; returns true when the magic level went up. */
    use(id) {
        const [lv, ex] = this.prog.get(id) ?? [1, 0];
        if (lv >= MAX_MAGIC_LEVEL)
            return false;
        if (ex + 1 >= EXP_PER_LEVEL) {
            this.prog.set(id, [lv + 1, 0]);
            return true;
        }
        this.prog.set(id, [lv, ex + 1]);
        return false;
    }
    /** Heal restores 10 % of max HP per magic level (the manual's screenshot: level 1, 10 %). */
    healPct(id) { return 10 * this.level(id); }
    /** Bolt damage multiplier from the magic level (guess: +20 % per level). */
    power(id) { return 1 + 0.2 * (this.level(id) - 1); }
    /** The spell currently selected for the right mouse button (undefined = attack / empty slot). */
    selected() { return this.sel < 8 ? this.spell(this.bar[this.sel]) : undefined; }
    save() { return { known: this.known, bar: this.bar, sel: this.sel, prog: [...this.prog].map(([id, [lv, ex]]) => [id, lv, ex]) }; }
    restore(m) {
        if (!m)
            return;
        this.known = m.known.filter(id => this.spell(id));
        this.bar = Array.from({ length: 8 }, (_, k) => (this.known.includes(m.bar[k]) ? m.bar[k] : 0));
        this.sel = m.sel;
        this.prog = new Map(m.prog.map(([id, lv, ex]) => [id, [lv, ex]]));
    }
    /** Put a spell on the first free bar slot, or take it off when it is already there. */
    toggleBar(id) {
        const at = this.bar.indexOf(id);
        if (at >= 0) {
            this.bar[at] = 0;
            return;
        }
        const free = this.bar.indexOf(0);
        if (free >= 0)
            this.bar[free] = id;
    }
    // ---- Magic window (left side, Game/Status pattern 6) ----
    pages() { return Math.max(1, Math.ceil(this.known.length / PER_PAGE)); }
    rowAt(x, y) { const r = Math.floor((y - ROW_Y) / ROW_H); return x >= 16 && x < 304 && y >= ROW_Y && r >= 0 && r < PER_PAGE ? this.page * PER_PAGE + r : -1; }
    /** Click inside the window; returns true when it was handled. */
    click(x, y) {
        const i = this.rowAt(x, y);
        if (i >= 0 && i < this.known.length) {
            this.toggleBar(this.known[i]);
            return true;
        }
        const k = WIN_SLOTS.findIndex(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
        if (k >= 0) {
            this.bar[k] = 0;
            return true;
        }
        if (y >= 332 && y < 350) {
            if (x >= 20 && x < 70)
                this.page = Math.max(0, this.page - 1);
            else if (x >= 250 && x < 300)
                this.page = Math.min(this.pages() - 1, this.page + 1);
            return true;
        }
        return false;
    }
    draw(ctx, text, mx, my) {
        put(ctx, this.win, 6);
        this.page = Math.min(this.page, this.pages() - 1);
        for (let r = 0; r < PER_PAGE; r++) {
            const s = this.spell(this.known[this.page * PER_PAGE + r]);
            if (!s)
                continue;
            const y = ROW_Y + r * ROW_H, on = this.bar.includes(s.id);
            const f = this.mi.pattern(s.icon);
            if (f)
                ctx.drawImage(f.canvas, LIST_X, y + 2);
            if (on) {
                ctx.strokeStyle = '#60e060';
                ctx.lineWidth = 1;
                ctx.strokeRect(LIST_X - 0.5, y + 1.5, 28, 28);
            }
            text.draw(ctx, s.name, 66, y + 2);
            if (s.attr)
                text.draw(ctx, s.attr, 66, y + 16);
            text.drawRight(ctx, `Lv.${this.level(s.id)} Exp.${this.exp(s.id)}/${EXP_PER_LEVEL}`, 298, y + 2);
            text.drawRight(ctx, s.kind === 'heal' ? `MP.${s.mp} Heal.${this.healPct(s.id)}%` : `MP.${s.mp}`, 298, y + 16);
        }
        text.draw(ctx, '<<', 34, 335);
        text.draw(ctx, '>>', 266, 335);
        text.drawCenter(ctx, `${this.page + 1}/${this.pages()}`, 160, 335);
        WIN_SLOTS.forEach((r, k) => { const s = this.spell(this.bar[k]); if (s) {
            const f = this.mi.pattern(s.icon);
            if (f)
                ctx.drawImage(f.canvas, r.x, r.y);
        } });
        const i = this.rowAt(mx, my), s = i >= 0 ? this.spell(this.known[i]) : undefined;
        if (s)
            drawTooltip(ctx, text, [`${s.name}${s.attr ? ` (${s.attr})` : ''}`, ...s.desc, this.bar.includes(s.id) ? 'Click to remove from the magic bar' : 'Click to add to the magic bar'], mx + 12, my + 12);
        else {
            const k = WIN_SLOTS.findIndex(r => mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h);
            if (k >= 0 && this.bar[k])
                drawTooltip(ctx, text, [`F${k + 1}: ${this.spell(this.bar[k]).name}`, 'Click to clear'], mx + 12, my - 40);
        }
    }
    // ---- HUD magic/attack bar (above the panel) ----
    barHit(x, y) { return BAR_SLOTS.findIndex(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h); }
    drawBar(ctx, text, mx, my) {
        BAR_SLOTS.forEach((r, k) => {
            const s = k < 8 ? this.spell(this.bar[k]) : undefined;
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(r.x, r.y, r.w, r.h);
            const f = this.mb.pattern(k === 8 ? 0 : s ? s.icon + 2 : 3);
            if (f)
                ctx.drawImage(f.canvas, r.x + 1, r.y + 1);
            ctx.strokeStyle = k === this.sel ? '#ffe060' : 'rgba(168,152,104,0.55)';
            ctx.lineWidth = 1;
            ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        });
        const k = this.barHit(mx, my);
        if (k >= 0) {
            const s = k < 8 ? this.spell(this.bar[k]) : undefined;
            drawTooltip(ctx, text, [k === 8 ? 'F9: Attack' : s ? `F${k + 1}: ${s.name}  (MP ${s.mp})` : `F${k + 1}: empty`], Math.min(mx, 500), my - 24);
        }
    }
}
//# sourceMappingURL=magic.js.map