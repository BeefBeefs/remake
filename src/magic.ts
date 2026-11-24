import { App, Text, put } from './app.js';
import { SpriteSet } from './sprites.js';
import { drawTooltip } from './items.js';

export type SpellKind = 'heal' | 'bolt' | 'pierce' | 'fan' | 'nova' | 'storm' | 'strike' | 'buff' | 'identify' | 'moon' | 'petnova' | 'blade' | 'none';
export interface Spell { id: number; name: string; attr: string; desc: string[]; icon: number; mp: number; kind: SpellKind; color: string; }

/**
 * Spell list. Names and descriptions are the exe's own strings (Table.Tbd 601-621). Everything else is a GUESS:
 *  - icon: index into Game/MagicIcon (the bar uses the same icon + 2); matched by looking at the pictures and the description,
 *  - mp: only Heal (40 MP at magic level 1) is documented, in the manual's magic window screenshot,
 *  - kind: how the spell works in this remake (see SPELL_FX in spellfx.ts); every spell of the list now has an effect.
 */
const DEF: [id: number, icon: number, mp: number, kind: SpellKind, color: string][] = [
  [601, 3, 20, 'bolt', '#ff8a28'], [602, 4, 20, 'bolt', '#7ad0ff'], [603, 5, 25, 'bolt', '#ffe860'], [604, 18, 60, 'nova', '#ff5a20'], [605, 14, 50, 'nova', '#9fe4ff'],
  [606, 8, 40, 'heal', ''], [607, 9, 80, 'moon', ''], [608, 10, 30, 'buff', ''], [609, 11, 30, 'buff', ''], [610, 12, 30, 'pierce', '#b08850'],
  [611, 6, 40, 'fan', '#ff7a30'], [612, 7, 40, 'pierce', '#8ad8ff'], [613, 15, 50, 'storm', '#fff070'], [614, 16, 40, 'bolt', '#a0e070'], [615, 0, 20, 'blade', '#e8e8ff'],
  [616, 13, 40, 'bolt', '#a08050'], [617, 20, 10, 'identify', ''], [618, 2, 30, 'buff', ''], [619, 19, 30, 'buff', ''], [620, 17, 60, 'petnova', ''], [621, 23, 80, 'strike', '#ffffff'],
];
/** A new hero knows no spell: they are learned by level history (career.ts, decoded from the exe). Saves of earlier builds keep the Heal / Fire Ball they started with. */
const START: number[] = [];

/** Persistent part of the magic system. */
export interface MagicSave { known: number[]; bar: number[]; sel: number; prog: [number, number, number][]; }

const PER_PAGE = 6, ROW_Y = 52, ROW_H = 50, LIST_X = 28;
/** Slots of the Magic window's own bar (part of the frame art, Game/Status pattern 6) and of the HUD bar. */
export const WIN_SLOTS = Array.from({ length: 8 }, (_, k) => ({ x: 32 + k * 32, y: 359, w: 26, h: 26 }));
const HUD_X = 192, HUD_Y0 = 389, HUD_PITCH = 19;
export const BAR_SLOTS = Array.from({ length: 9 }, (_, k) => ({ x: HUD_X + k * HUD_PITCH + (k === 8 ? 6 : 0), y: HUD_Y0, w: 18, h: 18 }));
/** Exe 0x44f6f0: a spell's magic level is capped at 0x14 = 20; every cast adds 1 exp and the level rises when exp reaches Table.Tbd 27[spell][level-1] (the exp is carried over). */
export const MAX_MAGIC_LEVEL = 20;
type Tables = Record<string, { s?: string[]; cols?: number; v?: number[] }>;

export class Magic {
  spells: Spell[];
  known: number[] = [...START];
  /** Spell id per bar slot (0 = empty). */
  bar: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  /** Selected bar entry: 0-7 = magic slots (F1-F8), 8 = attack (F9). */
  sel = 8;
  prog = new Map<number, [number, number]>();   // spell id -> [magic level, exp]
  page = 0;
  private constructor(private win: SpriteSet, private mi: SpriteSet, private mb: SpriteSet, private tables: Tables) {
    this.spells = DEF.map(([id, icon, mp, kind, color]) => {
      const s = (tables[String(id)]?.s ?? ['?']).map(l => l.replace(/\u3000/g, '').trim());
      const [name, attr] = (s[0] ?? '?').split(' - ');
      return { id, name, attr: attr ?? '', desc: s.slice(1).filter(l => l), icon, mp, kind, color };
    });
  }
  static async load(app: App, tables: Tables) {
    const [win, mi, mb] = await Promise.all([app.gui('Game_Status'), app.gui('Game_MagicIcon'), app.gui('Game_MagicBarIcon')]);
    return new Magic(win, mi, mb, tables);
  }
  /**
   * Per-spell tables of Table.Tbd, row = spell id - 600 (0 = Transport), decoded from the exe's accessor 0x417410 (kind 0..4 -> tables 17, 18, 16, 35, 21) and the cast routines:
   * 16 = MP cost per magic level (Heal 40 at level 1 = the manual), 17 = spell power (added to the gear's magic attack; Heal = heal %, Sonic Blade / Counter Burst / Magic Shield = rate %),
   * 18 = magic hit rate (+ gear), 19 = cast motion kind, 20 = cast time x per mille, 21 = flag from a level on, 27 = exp needed per level (20 columns), 35 / 70-78 = visual parameters.
   */
  param(table: number, id: number, lvl: number) {
    const t = this.tables[String(table)], row = id - 600; if (!t?.v || !t.cols || row < 0) return 0;
    return t.v[row * t.cols + Math.max(0, Math.min(t.cols - 1, lvl - 1))] ?? 0;
  }
  cost(id: number, extraLv = 0) { const v = this.param(16, id, this.level(id) + extraLv); return v > 0 ? v : this.spell(id)?.mp ?? 0; }
  expNeed(id: number) { return this.param(27, id, this.level(id)) || 20; }
  castMul(id: number) { return (this.param(20, id, 1) || 1000) / 1000; }
  spell(id: number) { return this.spells.find(s => s.id === id); }
  learn(id: number) { if (this.spell(id) && !this.known.includes(id)) this.known.push(id); }
  level(id: number) { return this.prog.get(id)?.[0] ?? 1; }
  exp(id: number) { return this.prog.get(id)?.[1] ?? 0; }
  /** Add one use; returns true when the magic level went up. */
  use(id: number) {
    const [lv, ex] = this.prog.get(id) ?? [1, 0];
    if (lv >= MAX_MAGIC_LEVEL) return false;
    const need = this.expNeed(id); if (ex + 1 >= need) { this.prog.set(id, [lv + 1, ex + 1 - need]); return true; }
    this.prog.set(id, [lv, ex + 1]); return false;
  }
  /** Heal restores Table 17 % of max HP (10 % at level 1 as in the manual's screenshot, +2 per level). */
  healPct(id: number, extraLv = 0) { return this.param(17, id, this.level(id) + extraLv) || 10 * this.level(id); }
  /** The spell currently selected for the right mouse button (undefined = attack / empty slot). */
  selected(): Spell | undefined { return this.sel < 8 ? this.spell(this.bar[this.sel]) : undefined; }

  save(): MagicSave { return { known: this.known, bar: this.bar, sel: this.sel, prog: [...this.prog].map(([id, [lv, ex]]) => [id, lv, ex]) }; }
  restore(m?: MagicSave) {
    if (!m) return;
    this.known = m.known.filter(id => this.spell(id)); this.bar = Array.from({ length: 8 }, (_, k) => (this.known.includes(m.bar[k]) ? m.bar[k] : 0)); this.sel = m.sel;
    this.prog = new Map(m.prog.map(([id, lv, ex]) => [id, [lv, ex] as [number, number]]));
  }

  /** Put a spell on the first free bar slot, or take it off when it is already there. */
  toggleBar(id: number) {
    const at = this.bar.indexOf(id);
    if (at >= 0) { this.bar[at] = 0; return; }
    const free = this.bar.indexOf(0); if (free >= 0) this.bar[free] = id;
  }

  // ---- Magic window (left side, Game/Status pattern 6) ----
  pages() { return Math.max(1, Math.ceil(this.known.length / PER_PAGE)); }
  private rowAt(x: number, y: number) { const r = Math.floor((y - ROW_Y) / ROW_H); return x >= 16 && x < 304 && y >= ROW_Y && r >= 0 && r < PER_PAGE ? this.page * PER_PAGE + r : -1; }
  /** Click inside the window; returns true when it was handled. */
  click(x: number, y: number) {
    const i = this.rowAt(x, y); if (i >= 0 && i < this.known.length) { this.toggleBar(this.known[i]); return true; }
    const k = WIN_SLOTS.findIndex(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h); if (k >= 0) { this.bar[k] = 0; return true; }
    if (y >= 332 && y < 350) { if (x >= 20 && x < 70) this.page = Math.max(0, this.page - 1); else if (x >= 250 && x < 300) this.page = Math.min(this.pages() - 1, this.page + 1); return true; }
    return false;
  }
  draw(ctx: CanvasRenderingContext2D, text: Text, mx: number, my: number) {
    put(ctx, this.win, 6);
    this.page = Math.min(this.page, this.pages() - 1);
    for (let r = 0; r < PER_PAGE; r++) {
      const s = this.spell(this.known[this.page * PER_PAGE + r]); if (!s) continue;
      const y = ROW_Y + r * ROW_H, on = this.bar.includes(s.id);
      const f = this.mi.pattern(s.icon); if (f) ctx.drawImage(f.canvas, LIST_X, y + 2);
      if (on) { ctx.strokeStyle = '#60e060'; ctx.lineWidth = 1; ctx.strokeRect(LIST_X - 0.5, y + 1.5, 28, 28); }
      text.draw(ctx, s.name, 66, y + 2); if (s.attr) text.draw(ctx, s.attr, 66, y + 16);
      text.drawRight(ctx, `Lv.${this.level(s.id)} Exp.${this.exp(s.id)}/${this.level(s.id) >= MAX_MAGIC_LEVEL ? '-' : this.expNeed(s.id)}`, 298, y + 2);
      text.drawRight(ctx, s.kind === 'heal' ? `MP.${this.cost(s.id)} Heal.${this.healPct(s.id)}%` : `MP.${this.cost(s.id)}`, 298, y + 16);
    }
    text.draw(ctx, '<<', 34, 335); text.draw(ctx, '>>', 266, 335); text.drawCenter(ctx, `${this.page + 1}/${this.pages()}`, 160, 335);
    WIN_SLOTS.forEach((r, k) => { const s = this.spell(this.bar[k]); if (s) { const f = this.mi.pattern(s.icon); if (f) ctx.drawImage(f.canvas, r.x, r.y); } });
    const i = this.rowAt(mx, my), s = i >= 0 ? this.spell(this.known[i]) : undefined;
    if (s) drawTooltip(ctx, text, [`${s.name}${s.attr ? ` (${s.attr})` : ''}`, ...s.desc, this.bar.includes(s.id) ? 'Click to remove from the magic bar' : 'Click to add to the magic bar'], mx + 12, my + 12);
    else { const k = WIN_SLOTS.findIndex(r => mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h); if (k >= 0 && this.bar[k]) drawTooltip(ctx, text, [`F${k + 1}: ${this.spell(this.bar[k])!.name}`, 'Click to clear'], mx + 12, my - 40); }
  }

  // ---- HUD magic/attack bar (above the panel) ----
  barHit(x: number, y: number) { return BAR_SLOTS.findIndex(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h); }
  drawBar(ctx: CanvasRenderingContext2D, text: Text, mx: number, my: number) {
    BAR_SLOTS.forEach((r, k) => {
      const s = k < 8 ? this.spell(this.bar[k]) : undefined;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      const f = this.mb.pattern(k === 8 ? 0 : s ? s.icon + 2 : 3); if (f) ctx.drawImage(f.canvas, r.x + 1, r.y + 1);
      ctx.strokeStyle = k === this.sel ? '#ffe060' : 'rgba(168,152,104,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    });
    const k = this.barHit(mx, my);
    if (k >= 0) { const s = k < 8 ? this.spell(this.bar[k]) : undefined; drawTooltip(ctx, text, [k === 8 ? 'F9: Attack' : s ? `F${k + 1}: ${s.name}  (MP ${this.cost(s.id)})` : `F${k + 1}: empty`], Math.min(mx, 500), my - 24); }
  }
}
