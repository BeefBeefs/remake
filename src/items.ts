import { Data } from './data.js';
import { Text } from './app.js';

/** One record of Item.Ibn (see docs/FORMATS.md). `f` holds the non-zero 32-bit fields by index. */
export interface ItemDef { name: string; type: string; f: Record<string, number>; sec: number; idx: number; }
export const SECTION_NAMES = ['Weapon', 'Armor', 'Accessory', 'Consumable', 'Misc'];

/** The 39 bonus lines of an item in tooltip order (index = triplet number). Units: absolute points unless noted; lifeRec / mpRec in 0.1 % of max per second, mcost / reflGen / reflRate / stamina / mental / absGen / absRate / gold in %. 'x16' (field start + 48) is a flag (1,1,100 on every weapon and a few shields) of unknown meaning. */
export const FX = ['atk', 'def', 'hit', 'eva', 'matk', 'mdef', 'mhit', 'meva', 'aspd', 'walk', 'hp', 'mp', 'str', 'mlv', 'stunP', 'stunD', 'x16', 'lifeRec', 'mpRec', 'mcost', 'reflGen', 'reflRate', 'stamina', 'mental', 'absGen', 'absRate', 'gold', 'mineFx', 'mines', 'chant', 'cHp', 'cAtk', 'cHit', 'cDef', 'cEva', 'cMatk', 'cMhit', 'cMdef', 'cMeva'] as const;
export type Fx = typeof FX[number];
/** Tooltip text (exe format strings) of each bonus line; `u` = unit suffix. */
export const FX_TEXT: Partial<Record<Fx, [string, string]>> = {
  atk: ['Attack', ''], def: ['Defense', ''], hit: ['Hit Rate', ''], eva: ['Evasion Rate', ''], matk: ['Magical Attack', ''], mdef: ['Magical Defense', ''], mhit: ['Magical Hit Rate', ''], meva: ['Magical Evasion Rate', ''],
  aspd: ['Speed of Attack', ''], walk: ['Walking Speed', ''], hp: ['Maximum HP', ''], mp: ['Maximum MP', ''], str: ['Strength', ''], mlv: ['Magic Level', ''], stunP: ['Probability of Stiffness', '%'], stunD: ['Duration of Stiffness', ''],
  lifeRec: ['Life Recovery', '/s'], mpRec: ['Mental Recovery', '/s'], mcost: ['Mental Consumption', '%'], reflGen: ['Generation of Reflection', '%'], reflRate: ['Reflection Rate', '%'], stamina: ['Effect of Stamina Medicine', '%'], mental: ['Effect of Mental Medicine', '%'],
  absGen: ['Incidents of Absorption', '%'], absRate: ['Absorption Rate', '%'], gold: ['Amount of Gold', '%'], mineFx: ['Effect of Mine', ''], mines: ['Number of Mines', ''], chant: ['Speed of Chant', ''],
  cHp: ['Companion HP', ''], cAtk: ['Companion Attack', ''], cHit: ['Companion Hit Rate', ''], cDef: ['Companion Defense', ''], cEva: ['Companion Evasion Rate', ''], cMatk: ['Companion Magical Attack', ''], cMhit: ['Companion Magical Hit Rate', ''], cMdef: ['Companion Magical Defense', ''], cMeva: ['Companion Magical Evasion Rate', ''],
};
export class ItemDb {
  sections: ItemDef[][];
  private constructor(raw: { name: string; type: string; f: Record<string, number> }[][]) {
    this.sections = raw.map((s, sec) => s.map((it, idx) => ({ ...it, sec, idx })));
  }
  static async load() { return new ItemDb(await (await fetch(Data.url('items.json'))).json()); }
  /** Script item reference: category = section, id = field 1 (0 when absent). */
  find(cat: number, id: number) { return this.sections[cat]?.find(it => (it.f['1'] ?? 0) === id); }
  get(sec: number, idx: number) { return this.sections[sec]?.[idx]; }
  /** Icon = pattern index in System/Game/Pattern/Item0000.njp (field 11). */
  static icon(it: ItemDef) { return it.f['11'] ?? 0; }
  /** Footprint in inventory cells (fields 7 x 8). */
  static size(it: ItemDef): [number, number] { return [it.f['7'] || 1, it.f['8'] || 1]; }
  static price(it: ItemDef) { return it.f['5'] ?? 0; }
  /** Arms class of a weapon (field 0): none = one-handed sword, 1 axe, 3 great sword, 5 bow gun / sling / crossbow, 8 staff, 9 rod. */
  static arms(it: ItemDef) { return it.sec === 0 ? it.f['0'] ?? 0 : -1; }
  static isRanged(it: ItemDef) { return ItemDb.arms(it) === 5; }
  /** Two-handed arms (manual: a shield cannot be used together with them). GUESS: great swords, bow guns and staffs; the flag itself was not located in Item.Ibn. */
  static twoHanded(it: ItemDef) { const a = ItemDb.arms(it); return a === 3 || a === 5 || a === 8; }
  /** Maximum durability (field 25) of weapons and armor; 0 = does not wear. */
  static maxDur(it: ItemDef) { return it.sec <= 1 ? it.f['25'] ?? 0 : 0; }
  /** Magical variants carry an item id (field 1); the plain item of the same type has none. Only variants can be unidentified. */
  static isVariant(it: ItemDef) { return it.sec <= 2 && (it.f['1'] ?? 0) > 0 && it.name !== it.type; }
  /** The plain item an unidentified variant looks like (same type, no variant id). */
  base(it: ItemDef) { return this.sections[it.sec].find(o => o.type === it.type && o.name === o.type) ?? it; }
  /** Belt-pocket candidates: tablets, capsules, sources and fruits (consumables flagged with field 26). */
  static beltable(it: ItemDef) { return it.sec === 3 && (it.f['26'] ?? 0) === 1; }
  /** Effect of using a consumable: HP / MP recovered (fields 27 / 28) and permanent max HP / MP gained (fields 29 / 30). */
  static effect(it: ItemDef) { return { hp: it.f['27'] ?? 0, mp: it.f['28'] ?? 0, maxHp: it.f['29'] ?? 0, maxMp: it.f['30'] ?? 0 }; }
  /** Equipment slot: weapons/accessories by section, armor by field 0 (0 head, 1 body, 2 shield/book, 3 boots). Null for consumables/misc. */
  static slot(it: ItemDef): Slot | null { return it.sec === 0 ? 'weapon' : it.sec === 1 ? ARMOR_SLOTS[it.f['0'] ?? 1] ?? null : it.sec === 2 ? 'accessory' : null; }
  /** Weapon damage range (fields 36/37) and attack speed in percent (field 27). */
  /** Weapon attack power = field 26 (20 Short Sword ... 4800 Stinger; scales with price, the Glass Sword has 460 power but only 100 durability = field 25). Fields 36/37 are the power RANK used by the drop generator, not damage. */
  static attack(it: ItemDef): [number, number] { const a = it.f['26'] ?? 0; return [a, a]; }
  static speed(it: ItemDef) { return it.f['27'] ?? 100; }
  /** Armor defense = field 28 (6 boots ... 170 Knight Plate; field 25 is durability, 36/37 the drop rank). */
  static defense(it: ItemDef) { return it.f['28'] ?? 0; }
  /**
   * Variant / special-item bonuses are (min, max, chance %) field triplets. Every item type has the SAME block of 39 triplets (the order of the tooltip lines of the exe, see FX), starting at
   * field 60 for weapons, 50 for armor and 27 for accessories, followed by the 8 attribute triplets (177 / 167 / 144 = start + 117). Decoded by comparing names and magnitudes (Power / Speed / Gale / Divine Wind
   * variants, Recovery / Healing armor, Gold boots, Reflective shields, Animal Bracelets ...) and checked against the exe's tooltip format strings ("Attack %+9d", "Life Recovery %4d.%1d%%/s", "Amount of Gold %+8d%%" ...).
   * All are absolute amounts added to the matching parameter (Power Dagger +6..10 attack on a 10 attack dagger), except the %-lines (see FX). GUESS: the value is the middle of min..max (attack: the range itself) and the chance is ignored (always applies).
   */
  static fxRange(it: ItemDef, k: Fx): [number, number] {
    const start = it.sec === 0 ? 60 : it.sec === 1 ? 50 : it.sec === 2 ? 27 : -1; if (start < 0) return [0, 0];
    const slot = start + 3 * FX.indexOf(k), a = it.f[String(slot)]; if (a === undefined) return [0, 0];
    return [a, it.f[String(slot + 1)] ?? a];
  }
  static fx(it: ItemDef, k: Fx): number { const [a, b] = ItemDb.fxRange(it, k); return (a + b) / 2; }
  static attrBonus(it: ItemDef): number[] { const base = it.sec === 0 ? 177 : it.sec === 1 ? 167 : it.sec === 2 ? 144 : -1; return Array.from({ length: 8 }, (_, k) => { const a = base < 0 ? undefined : it.f[String(base + 3 * k)]; return a === undefined ? 0 : (a + (it.f[String(base + 3 * k + 1)] ?? a)) / 2; }); }
}

export const INV_COLS = 9, INV_ROWS = 10;
/** `unid`: magical variant not identified yet (shown as its plain base item with a '?'). `dur`: current durability, undefined = full (max = Item.Ibn field 25, weapons/armor only). */
export interface InvEntry { item: ItemDef; x: number; y: number; w: number; h: number; eq?: boolean; alt?: boolean; unid?: boolean; dur?: number; }
export type Slot = 'weapon' | 'head' | 'body' | 'shield' | 'boots' | 'accessory';
const ARMOR_SLOTS: Slot[] = ['head', 'body', 'shield', 'boots'];

/** Grid inventory with first-fit placement. */
export class Inventory {
  entries: InvEntry[] = [];
  private fits(x: number, y: number, w: number, h: number) {
    if (x + w > INV_COLS || y + h > INV_ROWS) return false;
    return !this.entries.some(e => x < e.x + e.w && x + w > e.x && y < e.y + e.h && y + h > e.y);
  }
  add(item: ItemDef, extra: { unid?: boolean; dur?: number } = {}): boolean {
    const [w, h] = ItemDb.size(item);
    for (let y = 0; y < INV_ROWS; y++) for (let x = 0; x < INV_COLS; x++)
      if (this.fits(x, y, w, h)) { this.entries.push({ item, x, y, w, h, ...extra }); return true; }
    return false;
  }
  static dur(e: InvEntry) { return e.dur ?? ItemDb.maxDur(e.item); }
  /** A worn-out piece (durability 0) gives no attack/defense. */
  static broken(e: InvEntry) { return ItemDb.maxDur(e.item) > 0 && Inventory.dur(e) <= 0; }
  at(cx: number, cy: number) { return this.entries.find(e => cx >= e.x && cx < e.x + e.w && cy >= e.y && cy < e.y + e.h); }
  remove(e: InvEntry) { this.entries.splice(this.entries.indexOf(e), 1); }
  /** Toggle equipping; equipping replaces whatever occupies the same slot. Returns false for non-equipment. */
  toggleEquip(e: InvEntry) {
    const slot = ItemDb.slot(e.item); if (!slot) return false;
    if (e.unid) return false;   // an unidentified item cannot be used until a merchant identifies it
    if (e.eq) { e.eq = false; return true; }
    const same = this.entries.filter(o => o.eq && ItemDb.slot(o.item) === slot);
    if (slot === 'accessory') { if (same.length >= 4) same[0].eq = false; }   // four accessory spaces; a fifth replaces the oldest
    else for (const o of same) o.eq = false;
    e.eq = true; return true;
  }
  /** Active weapon/shield configuration (0 = I, 1 = II). The sword and shield of the other configuration are flagged `alt`. */
  set = 0;
  /** Change Equipment (buttons I / II or Shift+CapsLock): swap the worn sword and shield with the other configuration. */
  switchSet(to = 1 - this.set) {
    if (to === this.set) return; this.set = to;
    for (const e of this.entries) { const s = ItemDb.slot(e.item); if (s === 'weapon' || s === 'shield') { const w = !!e.eq; e.eq = !!e.alt; e.alt = w; } }
  }
  equipped(slot?: Slot) { return this.entries.filter(e => e.eq && (!slot || ItemDb.slot(e.item) === slot)); }
}

export function drawTooltip(ctx: CanvasRenderingContext2D, text: Text, lines: string[], x: number, y: number) {
  const w = Math.max(...lines.map(l => l.length)) * 6 + 8, h = lines.length * 13 + 6;
  x = Math.min(x, 640 - w - 2); y = Math.min(y, 480 - h - 2);
  ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#a08840'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  lines.forEach((l, i) => text.draw(ctx, l, x + 4, y + 3 + i * 13));
}
