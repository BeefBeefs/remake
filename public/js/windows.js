import { put, Text } from './app.js';
import { CAREERS } from './career.js';
import { ItemDb, Inventory, SECTION_NAMES, drawTooltip } from './items.js';
const GRID_X = 335, GRID_Y = 71, CELL = 32;
/** Change Equipment buttons I / II (PLACEHOLDER position: the original icons are part of Status.njp, not located yet). */
/** 'Change Career' button on the Status window (PLACEHOLDER position) and the row height of its choice list. */
export const CAREER_BTN = { x: 20, y: 388, w: 160, h: 18 };
export const SET_BTN = [{ x: 540, y: 394, w: 22, h: 16 }, { x: 566, y: 394, w: 26, h: 16 }];
/** Status (left) and Item (right) windows from System/Game/Pattern/Status.njp. Positions are absolute in the 640x480 screen. */
export class Windows {
    /** Multiplier of the status parameter an attribute drives (manual: Fire attack, Water defense, Earth hit, Thunder evasion, Holy magic attack, Dark magic defense, Gel magic hit, Metal magic evasion). GUESS: 5 % per level. */
    attrMul(i) { return 1 + 0.05 * this.attr[i]; }
    constructor(st, icons, text, db) {
        this.st = st;
        this.icons = icons;
        this.text = text;
        this.db = db;
        /** Career change: current profession, options available now, and whether the choice list is open. */
        this.career = 0;
        this.careerOpts = [];
        this.careerMenu = false;
        this.mineStock = 0;
        this.status = false;
        this.item = false;
        this.magic = false;
        this.mapOpen = false;
        /** HUD elements that sit above the world view (the magic bar) and must swallow clicks. */
        this.hudOver = null;
        this.inv = new Inventory();
        this.gold = 0;
        /** Basic attribute levels -10..10 in the status window's order: Fire, Water, Earth, Thunder, Holy, Dark, Gel, Metal (changed by the elemental medicines). */
        this.attr = Array(8).fill(0);
        /** Town warehouse (Warehouse Transfer Box). */
        this.wh = new Inventory();
        /** Tooltip hint for clicking an inventory item while a side panel (shop / warehouse) is open; overrides the sell price. */
        this.panelHint = null;
        /** Set while a shop is open: clicking an inventory item sells it for this price (tooltip hint). */
        this.sellValue = null;
        /** Extra left-hand panel (shop) that also blocks world clicks. */
        this.panel = null;
    }
    static async load(app) { const [st, icons, text, db] = await Promise.all([app.gui('Game_Status'), app.gui('Game_Item0000'), Text.load(app), ItemDb.load()]); return new Windows(st, icons, text, db); }
    /** Draw an item's inventory icon centred on (cx, cy). */
    drawIcon(ctx, it, cx, cy, scale = 1) { const f = this.icons.pattern(ItemDb.icon(it)); if (f) {
        const w = f.canvas.width * scale, h = f.canvas.height * scale;
        ctx.drawImage(f.canvas, Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h));
    } }
    /** Combat numbers from the equipped items (weapon attack range, summed armor defense, weapon attack speed %). */
    stats() {
        const eff = (e) => e.unid ? this.db.base(e.item) : e.item; // an unidentified variant only performs like its plain base item
        const w = this.inv.equipped('weapon').find(e => !Inventory.broken(e));
        const [atkMin, atkMax] = w ? ItemDb.attack(eff(w)) : [0, 0];
        const twoH = !!w && ItemDb.twoHanded(eff(w));
        const fire = this.attrMul(0), water = this.attrMul(1);
        return { atkMin: Math.round(atkMin * fire), atkMax: Math.round(atkMax * fire), defense: Math.round(water * this.inv.equipped().reduce((a, e) => a + (e.item.sec === 1 && !Inventory.broken(e) && !(twoH && ItemDb.slot(e.item) === 'shield') ? ItemDb.defense(eff(e)) : 0), 0)), speed: w ? ItemDb.speed(eff(w)) : 100 };
    }
    /** Durability wear (GUESS: 1 point per weapon hit dealt; 1 point on one random worn armor piece per hit taken). */
    wearWeapon() { const w = this.inv.equipped('weapon')[0]; if (w && ItemDb.maxDur(w.item) > 0)
        w.dur = Math.max(0, Inventory.dur(w) - 1); }
    wearArmor() { const a = this.inv.equipped().filter(e => e.item.sec === 1 && ItemDb.maxDur(e.item) > 0); if (a.length) {
        const e = a[Math.floor(Math.random() * a.length)];
        e.dur = Math.max(0, Inventory.dur(e) - 1);
    } }
    /** Entries a repair/identify service slot addresses (script slot numbers: 0 arms, 1 head, 2 body, 3 shield, 4 legs, -1 everything not worn, 5 everything worn). */
    slotEntries(slot) {
        const worn = (n) => this.inv.equipped().filter(e => (e.item.sec === 0 ? 'weapon' : e.item.sec === 1 ? ['head', 'body', 'shield', 'boots'][e.item.f['0'] ?? 1] : '') === n);
        if (slot === -1)
            return this.inv.entries.filter(e => !e.eq);
        if (slot === 5)
            return this.inv.equipped();
        return worn(['weapon', 'head', 'body', 'shield', 'boots'][slot] ?? '');
    }
    /** Repair cost (GUESS: half the listed price scaled by the lost durability fraction; the original formula is in exe 0x4667a0, not decoded). */
    repairCost(e) { const m = ItemDb.maxDur(e.item); return m > 0 ? Math.ceil(ItemDb.price(e.item) * (m - Inventory.dur(e)) / m / 2) : 0; }
    repairCostOf(slot) { return this.slotEntries(slot).reduce((a, e) => a + this.repairCost(e), 0); }
    repair(slot) { for (const e of this.slotEntries(slot))
        e.dur = undefined; }
    /** Sentence 55: any item carried (worn or not) still unidentified? Sentence 4 identifies them all. */
    needsIdentify() { return this.inv.entries.some(e => e.unid) || this.wh.entries.some(e => e.unid); }
    identifyAll() { for (const e of [...this.inv.entries, ...this.wh.entries])
        e.unid = false; } // the manual: items in the town warehouse are identified too
    /** Name shown for an entry (unidentified variants show their plain base name and a '?'). */
    label(e) { return e.unid ? `${this.db.base(e.item).name} ?` : e.item.name; }
    /** A worn shield stops working (drawn semi-transparent) while a two-handed arm is equipped. */
    shieldOff(e) { const w = this.inv.equipped('weapon').find(x => !Inventory.broken(x)); return !!e.eq && ItemDb.slot(e.item) === 'shield' && !!w && ItemDb.twoHanded(w.unid ? this.db.base(w.item) : w.item); }
    /** Which career choice (index into careerOpts) is under (x, y) while the list is open. */
    careerPick(x, y) { const n = this.careerOpts.length, y0 = CAREER_BTN.y - 18 - n * 18, i = Math.floor((y - y0 - 18) / 18); return x >= CAREER_BTN.x && x < CAREER_BTN.x + CAREER_BTN.w && i >= 0 && i < n ? i : -1; }
    /** Inventory entry under screen point (x,y) while the item window is open. */
    entryAt(x, y) { return this.item && x >= GRID_X ? this.inv.at(Math.floor((x - GRID_X) / CELL), Math.floor((y - GRID_Y) / CELL)) : undefined; }
    overUI(x, y) { return (this.panel?.(x, y) ?? false) || (this.hudOver?.(x, y) ?? false) || ((this.status || this.magic || this.mapOpen) && x < 320 && y < 416) || (this.item && x >= 320 && y < 416); }
    draw(ctx, h, name, mx = -1, my = -1) {
        if (this.status) {
            put(ctx, this.st, 5);
            const t = this.text, v = (s, x, y) => t.draw(ctx, String(s), x, y);
            v(name.slice(0, 9), 22, 42);
            v(CAREERS[this.career], 94, 42);
            v(h.level, 270, 42);
            v(`${h.exp}/${h.expMax}`, 250, 67);
            v(`${h.hp}/${h.hpMax}`, 60, 90);
            // Attack / Defense / Attack Speed come from the equipped items; the rest is not decoded yet -> placeholders
            const cs = this.stats();
            const rng = cs.atkMax ? (cs.atkMin === cs.atkMax ? `${cs.atkMax}` : `${cs.atkMin}-${cs.atkMax}`) : '0';
            const ps = this.ps, n = (x) => x === undefined ? '--' : x;
            v(n(ps?.strength), 66, 115);
            v(rng, 152, 115);
            v(cs.defense, 262, 115);
            const sc = (x, i) => x === undefined ? undefined : Math.round(x * this.attrMul(i));
            v(n(sc(ps?.hit, 2)), 68, 139);
            v(n(sc(ps?.eva, 3)), 252, 139);
            v('--', 96, 163);
            v(`${cs.speed}%`, 252, 163);
            v(`${h.mp}/${h.mpMax}`, 60, 194);
            v('--', 70, 218);
            v('--', 240, 218);
            v(n(sc(ps?.mhit, 6)), 80, 242);
            v(n(sc(ps?.meva, 7)), 270, 242);
            for (let i = 0; i < 8; i++)
                v(this.attr[i], 262, 267 + i * 16);
            if (this.careerOpts.length) {
                const hot = mx >= CAREER_BTN.x && mx < CAREER_BTN.x + CAREER_BTN.w && my >= CAREER_BTN.y && my < CAREER_BTN.y + CAREER_BTN.h;
                ctx.fillStyle = hot ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.55)';
                ctx.fillRect(CAREER_BTN.x, CAREER_BTN.y, CAREER_BTN.w, CAREER_BTN.h);
                ctx.strokeStyle = '#e0c860';
                ctx.strokeRect(CAREER_BTN.x + .5, CAREER_BTN.y + .5, CAREER_BTN.w, CAREER_BTN.h);
                v('Change Career', CAREER_BTN.x + 28, CAREER_BTN.y + 4);
            }
            if (this.careerMenu) {
                const n = this.careerOpts.length, y0 = CAREER_BTN.y - 18 - n * 18;
                ctx.fillStyle = 'rgba(8,8,24,0.95)';
                ctx.fillRect(CAREER_BTN.x, y0, CAREER_BTN.w, n * 18 + 18);
                ctx.strokeStyle = '#e0c860';
                ctx.strokeRect(CAREER_BTN.x + .5, y0 + .5, CAREER_BTN.w, n * 18 + 18);
                v('Change profession to:', CAREER_BTN.x + 6, y0 + 4);
                this.careerOpts.forEach((c, i) => { if (my >= y0 + 18 + i * 18 && my < y0 + 36 + i * 18 && mx >= CAREER_BTN.x && mx < CAREER_BTN.x + CAREER_BTN.w) {
                    ctx.fillStyle = 'rgba(255,255,255,0.25)';
                    ctx.fillRect(CAREER_BTN.x, y0 + 18 + i * 18, CAREER_BTN.w, 18);
                } v(CAREERS[c], CAREER_BTN.x + 20, y0 + 22 + i * 18); });
            }
        }
        if (this.item) {
            put(ctx, this.st, 7, undefined, 320, 0);
            put(ctx, this.st, 8, undefined, 320, 0);
            for (const e of this.inv.entries) {
                const f = this.icons.pattern(ItemDb.icon(e.item));
                if (!f)
                    continue;
                const cx = GRID_X + e.x * CELL + (e.w * CELL - f.canvas.width) / 2, cy = GRID_Y + e.y * CELL + (e.h * CELL - f.canvas.height) / 2;
                if (this.shieldOff(e))
                    ctx.globalAlpha = 0.4;
                ctx.drawImage(f.canvas, Math.round(cx), Math.round(cy));
                ctx.globalAlpha = 1;
                if (e.unid)
                    this.text.draw(ctx, '?', GRID_X + e.x * CELL + 3, GRID_Y + e.y * CELL + 3);
                if (e.alt && !e.eq) {
                    ctx.strokeStyle = '#5080c0';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(GRID_X + e.x * CELL + 3, GRID_Y + e.y * CELL + 3, e.w * CELL - 6, e.h * CELL - 6);
                }
                if (e.eq) {
                    ctx.strokeStyle = Inventory.broken(e) ? '#e06060' : '#60e060';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(GRID_X + e.x * CELL + 1, GRID_Y + e.y * CELL + 1, e.w * CELL - 2, e.h * CELL - 2);
                }
            }
            this.text.draw(ctx, `Gold: ${this.gold}`, 340, 398);
            this.text.draw(ctx, `Mines: ${this.mineStock}`, 430, 398);
            SET_BTN.forEach((b, i) => { ctx.strokeStyle = this.inv.set === i ? '#60e060' : '#807040'; ctx.lineWidth = 1; ctx.strokeRect(b.x + .5, b.y + .5, b.w, b.h); this.text.draw(ctx, i ? 'II' : 'I', b.x + 6, b.y + 3); });
            const hover = this.inv.at(Math.floor((mx - GRID_X) / CELL), Math.floor((my - GRID_Y) / CELL));
            if (hover && mx >= GRID_X) {
                const it = hover.unid ? this.db.base(hover.item) : hover.item, lines = [this.label(hover), `${it.type} (${SECTION_NAMES[it.sec]})`];
                if (hover.unid)
                    lines.push('Unidentified (see a merchant)');
                if (it.sec === 0) {
                    const [a, b] = ItemDb.attack(it);
                    lines.push(`Attack: ${a === b ? a : `${a}-${b}`}  Speed: ${ItemDb.speed(it)}%`);
                }
                else if (it.sec === 1)
                    lines.push(`Defense: ${ItemDb.defense(it)}`);
                if (it.sec === 0 && ItemDb.twoHanded(it))
                    lines.push('Two-handed: no shield');
                if (ItemDb.maxDur(it) > 0)
                    lines.push(`Durability: ${Inventory.dur(hover)}/${ItemDb.maxDur(hover.item)}${Inventory.broken(hover) ? ' (broken)' : ''}`);
                lines.push(`Price: ${ItemDb.price(it)}`);
                if (this.panelHint)
                    lines.push(this.panelHint);
                else if (this.sellValue)
                    lines.push(`Click to sell for ${this.sellValue(it)}`);
                else if (ItemDb.slot(it))
                    lines.push(hover.unid ? 'Cannot be used until identified' : hover.eq ? '[Equipped] click to remove' : hover.alt ? '[Set ' + (this.inv.set ? 'I' : 'II') + '] click to equip here' : 'Click to equip');
                drawTooltip(ctx, this.text, lines, mx + 12, my + 12);
            }
        }
    }
}
//# sourceMappingURL=windows.js.map