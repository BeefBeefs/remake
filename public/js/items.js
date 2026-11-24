export const SECTION_NAMES = ['Weapon', 'Armor', 'Accessory', 'Consumable', 'Misc'];
export class ItemDb {
    constructor(raw) {
        this.sections = raw.map((s, sec) => s.map((it, idx) => ({ ...it, sec, idx })));
    }
    static async load() { return new ItemDb(await (await fetch('data/ep1/items.json')).json()); }
    /** Script item reference: category = section, id = field 1 (0 when absent). */
    find(cat, id) { return this.sections[cat]?.find(it => (it.f['1'] ?? 0) === id); }
    get(sec, idx) { return this.sections[sec]?.[idx]; }
    /** Icon = pattern index in System/Game/Pattern/Item0000.njp (field 11). */
    static icon(it) { return it.f['11'] ?? 0; }
    /** Footprint in inventory cells (fields 7 x 8). */
    static size(it) { return [it.f['7'] || 1, it.f['8'] || 1]; }
    static price(it) { return it.f['5'] ?? 0; }
    /** Equipment slot: weapons/accessories by section, armor by field 0 (0 head, 1 body, 2 shield/book, 3 boots). Null for consumables/misc. */
    static slot(it) { return it.sec === 0 ? 'weapon' : it.sec === 1 ? ARMOR_SLOTS[it.f['0'] ?? 1] ?? null : it.sec === 2 ? 'accessory' : null; }
    /** Weapon damage range (fields 36/37) and attack speed in percent (field 27). */
    static attack(it) { const a = it.f['36'] ?? 0, b = it.f['37'] ?? a; return [Math.min(a, b), Math.max(a, b)]; }
    static speed(it) { return it.f['27'] ?? 100; }
    /** Armor defense (field 36). */
    static defense(it) { return it.f['36'] ?? 0; }
}
export const INV_COLS = 9, INV_ROWS = 10;
const ARMOR_SLOTS = ['head', 'body', 'shield', 'boots'];
/** Grid inventory with first-fit placement. */
export class Inventory {
    constructor() {
        this.entries = [];
    }
    fits(x, y, w, h) {
        if (x + w > INV_COLS || y + h > INV_ROWS)
            return false;
        return !this.entries.some(e => x < e.x + e.w && x + w > e.x && y < e.y + e.h && y + h > e.y);
    }
    add(item) {
        const [w, h] = ItemDb.size(item);
        for (let y = 0; y < INV_ROWS; y++)
            for (let x = 0; x < INV_COLS; x++)
                if (this.fits(x, y, w, h)) {
                    this.entries.push({ item, x, y, w, h });
                    return true;
                }
        return false;
    }
    at(cx, cy) { return this.entries.find(e => cx >= e.x && cx < e.x + e.w && cy >= e.y && cy < e.y + e.h); }
    remove(e) { this.entries.splice(this.entries.indexOf(e), 1); }
    /** Toggle equipping; equipping replaces whatever occupies the same slot. Returns false for non-equipment. */
    toggleEquip(e) {
        const slot = ItemDb.slot(e.item);
        if (!slot)
            return false;
        if (e.eq) {
            e.eq = false;
            return true;
        }
        for (const o of this.entries)
            if (o.eq && ItemDb.slot(o.item) === slot)
                o.eq = false;
        e.eq = true;
        return true;
    }
    equipped(slot) { return this.entries.filter(e => e.eq && (!slot || ItemDb.slot(e.item) === slot)); }
}
export function drawTooltip(ctx, text, lines, x, y) {
    const w = Math.max(...lines.map(l => l.length)) * 6 + 8, h = lines.length * 13 + 6;
    x = Math.min(x, 640 - w - 2);
    y = Math.min(y, 480 - h - 2);
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#a08840';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    lines.forEach((l, i) => text.draw(ctx, l, x + 4, y + 3 + i * 13));
}
//# sourceMappingURL=items.js.map