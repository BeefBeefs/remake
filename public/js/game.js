import { Data } from './data.js';
import { loadCaf } from './caf.js';
import { GameMap, worldToReal, realToWorld } from './map.js';
import { Inventory } from './items.js';
import { playerStats } from './pstats.js';
import { loadZones } from './zones.js';
import { Blackjack } from './blackjack.js';
import { Warehouse, WAREHOUSE_OBJECT } from './warehouse.js';
import { loadFxSet, fxFolder, fxLife, drawFx } from './fx.js';
import { audio } from './audio.js';
import { Shop, shopStock, sellPrice } from './shop.js';
import { loadScenarioActors, dirIndex as actorDir } from './actors.js';
import { ScriptVM } from './script.js';
import { Magic } from './magic.js';
import { Pet } from './companion.js';
import { MapWindow } from './mapwin.js';
import { Gui, SCREEN_W, SCREEN_H, HUD_Y, BELT, MINE_BTN, POWER_BTN, PET_GAUGE, inBox } from './gui.js';
import { Text } from './app.js';
import { Windows, SET_BTN, CAREER_BTN } from './windows.js';
import { SPELL_FX } from './spellfx.js';
import { CLASS_OF, CLASS_ID, careerTarget, newUsage, spellsFrom } from './career.js';
import { ItemDb } from './items.js';
import { TitleScene } from './title.js';
import { writeSlot, firstFree } from './saves.js';
import { GameMenu } from './gamemenu.js';
import { settings } from './settings.js';
import { DarkLayer, isDarkMap } from './dark.js';
const q = new URLSearchParams(location.search);
const SCENARIO = q.get('scenario') ?? '00000000';
/** Script state kept per scenario so quests are not replayed when re-entering a map. */
const savedVars = new Map();
let savedGlobals = new Map();
const savedGround = new Map();
/** Zone ids whose visibility differs from the Mct default (opened chests ...), per scenario. */
/** PLACEHOLDER combat sound ids (indices into Voice00.Voc; script-driven sounds use the real ids, e.g. chest 77/78, Black Hammer's taunts 40-43). */
/** GUESS: share of dropped magical variants that are still unidentified (the original rate is not decoded). */
const UNID_CHANCE = 0.6;
/** GUESS: phantom floor scenario -> [dlv of its final monster, drop level of the card it rolls] (Jack, Queen, King, Joker = Table 30 rows 162-165). */
const PHANTOM_FLOORS = { '99000019': [265, 162], '99000020': [268, 163], '99000021': [271, 164], '99000022': [276, 165] };
/** Voice00.Voc ids. From the exe: the item method 0x466110 returns the weapon sounds (kind 0/1 swing 47 or 48 [light weapon 48], bow/gun class 93, kind 4 impact 1 = light / 2 = heavy); monster behaviour functions use constants 22 (melee, most common), 21 (cast release), 94 (cast start), 29/23 (bats), 19. Which weapon counts as 'light' (item+0x28 < 60) is not mapped to an Item.Ibn field, so the arms class stands in (GUESS); hurt / kill keep placeholders. */
const TRIPLE_LEVEL = 10;
const ATTRS = ['Fire', 'Water', 'Earth', 'Thunder', 'Holy', 'Dark', 'Gel', 'Metal'];
const SFX = { hit: 1, hurt: 2, kill: 10, heavyHit: 2, swingLight: 48, swingHeavy: 47, swingBow: 93 };
const savedZones = new Map();
/** CAF layers of the player file (found by rendering every layer alone): 1 = base, 0 = body, 3 = fire swing effect and 4 = cloud (both left out), 5..8 = four body-armor looks,
 *  9..11 = round / kite / tower shield, 12..18 = seven weapon looks. GUESS: which item uses which look is chosen from the item name and arms class below (the exe's table was not found).
 *  Helmets and boots have no layer in the file. */
const LAYERS = (q.get('layers') ?? '1,0').split(',').map(Number);
const armorLayer = (name) => /plate|mail|steel|iron|knight|astral/i.test(name) ? 6 : /hunter|wind|beast|blast|cardigan|suit|coat|fur/i.test(name) ? 7 : /robe|rune|elemental|wizard|magic|hein/i.test(name) ? 8 : 5;
const shieldLayer = (name) => /tower|gate|board/i.test(name) ? 11 : /kite|knight|alloy|iron|glass/i.test(name) ? 10 : 9;
const weaponLayer = (name, arms) => /dagger/i.test(name) ? 13 : arms === 1 ? 18 : arms === 3 ? 14 : arms === 5 ? (/bowgun|gun|cross/i.test(name) ? 16 : 17) : arms === 8 || arms === 9 ? 15 : 12;
const FRAME_MS = 60;
const ANIM_IDLE = 0, ANIM_WALK = 1, ANIM_RUN = 2;
/** Facing index (CAF direction order: 0 down, 1 down-right, 2 right, 3 up-right, 4 up, 5 up-left, 6 left, 7 down-left; left and right were swapped before, found on a phone) for 8 compass sectors starting at "right" going clockwise on screen. */
const FACING = [2, 1, 0, 7, 6, 5, 4, 3];
const dirIndex = (vx, vy) => FACING[(Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) + 8) % 8];
export class GameScene {
    get partner() { return this.petIdx ?? this.pet?.idx ?? -1; }
    /** Remember per-scenario script flags and ground items (used for transitions and saving). */
    stash() {
        if (this.vm) {
            savedVars.set(this.scenario, this.vm.vars);
            savedGlobals = this.vm.globals;
        }
        savedZones.set(this.scenario, Object.fromEntries(this.zones.filter(z => z.visible !== (z.rec.vis !== 0)).map(z => [z.rec.id, z.visible])));
        savedGround.set(this.scenario, this.ground.map(o => ({ x: o.x, y: o.y, sec: o.item?.sec ?? 0, idx: o.item?.idx ?? 0, gold: o.gold, unid: o.unid, dur: o.dur })));
    }
    /** Area name: Table.Tbd 40 (rows (flag, scenario, entry) with the name in the first string of each row, the warp-gate list); scenarios not in it fall back to message 1000000 when that is a short single line (on other maps it is a speech line). */
    areaName() {
        const t = this.tables['40'], n = Number(this.scenario);
        if (t?.v && t.cols)
            for (let r = 0; r * t.cols < t.v.length; r++)
                if (t.v[r * t.cols + 1] === n && t.s?.[r * t.cols])
                    return t.s[r * t.cols];
        const m = (this.vm?.data.messages['1000000'] ?? '').replace(/\s+$/, '');
        return m.length <= 24 && !m.includes('\n') ? m : '';
    }
    save() {
        this.stash();
        const d = {
            v: 1, ep: Data.ep, slot: this.slot, at: Date.now(), area: this.areaName(), name: this.name, gender: this.gender, scenario: this.scenario, x: this.player.x, y: this.player.y, hud: this.hud, totalExp: this.totalExp, gold: this.win.gold,
            career: this.win.career, attr: this.win.attr, usage: this.usage, ct: this.careerTarget, hist: this.hist, invSet: this.win.inv.set, wh: this.win.wh.entries.map(e => [e.item.sec, e.item.idx, e.x, e.y, 0, e.unid ? 1 : 0, e.dur ?? -1]),
            inv: this.win.inv.entries.map(e => [e.item.sec, e.item.idx, e.x, e.y, (e.eq ? 1 : 0) | (e.alt ? 2 : 0), e.unid ? 1 : 0, e.dur ?? -1]),
            vars: Object.fromEntries([...savedVars].map(([k, v]) => [k, [...v]])), globals: [...savedGlobals], ground: Object.fromEntries(savedGround), zones: Object.fromEntries(savedZones),
            magic: this.magic.save(), explored: this.mapwin.encode(), pet: this.pet?.save(this.petKills),
        };
        if (this.slot >= 0)
            writeSlot(this.slot, d);
    }
    zoneRect(z, wa, wb) { const r = z.rec.rect; return (r[0] || r[1] || r[2] || r[3]) !== 0 && wa >= z.rec.a + r[0] && wa <= z.rec.a + r[2] && wb >= z.rec.b + r[1] && wb <= z.rec.b + r[3]; }
    checkZones(init = false) {
        if (this.leaving || !this.vm)
            return;
        const [wa, wb] = realToWorld(this.player.x, this.player.y);
        for (const z of this.zones) {
            const id = z.rec.id;
            if (!this.enterIds.has(id))
                continue;
            if (!this.zoneRect(z, wa, wb)) {
                this.inside.delete(id);
                continue;
            }
            if (this.inside.has(id))
                continue;
            this.inside.add(id);
            if (!init && this.vm.event(3, id))
                this.openDialog();
        }
    }
    warp(cmd) {
        const idx = Number(this.scenario);
        if (cmd === 38) {
            if (this.vm && !this.vm.globals.get(`w:${idx}`)) {
                this.vm.globals.set(`w:${idx}`, 1);
                this.banner = { text: 'Warp gate opened', t: 0 };
            }
        }
        else
            this.warpMenu = true;
    }
    showWarpMenu() {
        const t = this.tables['40'], here = Number(this.scenario), list = [];
        if (t)
            for (let r = 0; r < t.v.length / 3; r++) {
                const idx = t.v[r * 3 + 1];
                if (t.s?.[r * 3] && idx !== here && (idx === 0 || this.vm?.globals.get(`w:${idx}`)))
                    list.push([t.s?.[r * 3] ?? String(idx), idx]);
            }
        if (!list.length) {
            this.banner = { text: 'No other warp gate is open', t: 0 };
            return;
        }
        this.dlgPick = i => { if (i < list.length)
            void this.exit(list[i][1], 200); };
        this.setDialog(['Where do you want to go?', '', ...list.map(l => `  ~${l[0].replace(/[^\x20-\x7e]/g, '?')}~`), '', '  ~Cancel~']);
    }
    /** Sentence 17: leave for scenario `idx` (folder = index zero-padded to 8 digits) and arrive in its exit zone number `entry`. */
    async exit(idx, entry) {
        if (this.leaving)
            return;
        const id = String(idx).padStart(8, '0');
        const ok = await fetch(Data.url(`scenario/${id}.script.json`), { method: 'HEAD' }).then(r => r.ok).catch(() => false);
        if (!ok) {
            this.banner = { text: 'This area is not available', t: 0 };
            return;
        }
        this.target = null;
        this.travel(id, entry);
    }
    /** True when the walkable point (x, y) connects to at least `need` other points (8 px grid): exit zones sit inside wall gates, and the nearest free point can be a closed pocket. */
    openArea(x, y, need = 400) {
        const S = 8, key = (i, j) => i * 100003 + j, seen = new Set(), q = [[Math.round(x / S), Math.round(y / S)]];
        seen.add(key(q[0][0], q[0][1]));
        while (q.length && seen.size < need) {
            const [i, j] = q.pop();
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
                const ni = i + di, nj = j + dj, k = key(ni, nj);
                if (!seen.has(k) && !this.map.blockedReal(ni * S, nj * S)) {
                    seen.add(k);
                    q.push([ni, nj]);
                }
            }
        }
        return seen.size >= need;
    }
    /** Walkable real-pixel point nearest to the centre of exit zone `entry` that is not a closed pocket. */
    entryPoint(entry) {
        const z = this.zones.find(z => z.rec.id === 10000000 + entry);
        if (!z)
            return null;
        const r = z.rec.rect, [cx, cy] = worldToReal(z.rec.a + (r[0] + r[2]) / 2, z.rec.b + (r[1] + r[3]) / 2);
        for (let rad = 0; rad < 1500; rad += 8)
            for (let k = 0; k < Math.max(1, rad / 4); k++) {
                const an = k / Math.max(1, rad / 4) * Math.PI * 2, x = cx + Math.cos(an) * rad, y = cy + Math.sin(an) * rad * 0.6;
                if (!this.map.blockedReal(x, y) && this.openArea(x, y))
                    return [x, y];
            }
        return null;
    }
    travel(scenario, entry) {
        this.leaving = true;
        this.save();
        GameScene.create(this.app, this.gender, this.name, { scenario, carry: this, entry }).then(g => this.app.go(g));
    }
    setDialog(lines) {
        const opts = [];
        lines.forEach((l, i) => { const re = /~([^~]*)~/g; let m; while ((m = re.exec(l)))
            opts.push([i, m.index, m.index + m[0].length]); });
        this.dlg = { lines: lines.map(l => l.replace(/~/g, ' ')), opts };
    }
    openDialog() {
        this.dlgPick = null;
        const p = this.vm?.pending;
        if (!p) {
            this.dlg = null;
            return;
        }
        const lines = p.text.replace(/\n$/, '').split('\n');
        const opts = [];
        lines.forEach((l, i) => { const re = /~([^~]*)~/g; let m; while ((m = re.exec(l)))
            opts.push([i, m.index, m.index + m[0].length]); });
        this.dlg = { lines: lines.map(l => l.replace(/~/g, ' ').replace(/[^\x20-\x7e]/g, c => c === '・' ? '-' : '?')), opts };
    }
    dlgBox() { const h = this.dlg.lines.length * 13 + 24; return { x: 90, y: HUD_Y - 8 - h, w: 460, h }; }
    updateDialog() {
        const inp = this.app.input, d = this.dlg, b = this.dlgBox();
        let pick = -1;
        if (d.opts.length) {
            if (inp.clicked)
                d.opts.forEach(([l, c0, c1], i) => { const x = b.x + 12 + c0 * 6, y = b.y + 12 + l * 13; if (inp.x >= x && inp.x < x + (c1 - c0) * 6 && inp.y >= y && inp.y < y + 13)
                    pick = i; });
        }
        else if (inp.clicked || inp.pressed.has('enter') || inp.pressed.has(' '))
            pick = 0;
        if (pick >= 0) {
            if (this.dlgPick) {
                const f = this.dlgPick;
                this.dlgPick = null;
                this.dlg = null;
                f(pick);
            }
            else {
                this.vm.advance(pick);
                this.openDialog();
            }
        }
    }
    drawDialog(ctx) {
        const d = this.dlg, b = this.dlgBox(), inp = this.app.input;
        ctx.fillStyle = 'rgba(8,8,24,0.88)';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = '#a89868';
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
        d.opts.forEach(([l, c0, c1]) => { const x = b.x + 12 + c0 * 6, y = b.y + 12 + l * 13; if (inp.x >= x && inp.x < x + (c1 - c0) * 6 && inp.y >= y && inp.y < y + 13) {
            ctx.fillStyle = 'rgba(255,255,255,0.28)';
            ctx.fillRect(x, y, (c1 - c0) * 6, 13);
        } });
        d.lines.forEach((l, i) => this.text.draw(ctx, l, b.x + 12, b.y + 12 + i * 13));
    }
    groundAt(px, py) { return this.ground.find(g => Math.abs(px - g.x) < 18 && py > g.y - 30 && py < g.y + 8); }
    pickUp(g, force = false) {
        if (!force && Math.hypot(g.x - this.player.x, (g.y - this.player.y) * 1.6) > 140)
            return;
        if (g.item) {
            if (!this.win.inv.add(g.item, { unid: g.unid, dur: g.dur }))
                return;
        }
        else
            this.win.gold += g.gold;
        this.ground.splice(this.ground.indexOf(g), 1);
    }
    questList() { return [...this.vm?.globals ?? savedGlobals].filter(([k, v]) => k.startsWith('q:') && v > 0).map(([k, v]) => [Number(k.slice(2)), v]).sort((a, b) => a[0] - b[0]); }
    toggleQuestLog() {
        if (this.qlog) {
            this.qlog = null;
            this.win.panel = null;
            return;
        }
        if (this.shop)
            return;
        this.qlog = { sel: 0 };
        this.win.panel = (x, y) => x < 320 && y < 416;
    }
    qlogClick(x, y) {
        const i = Math.floor((y - 40) / 14);
        if (x >= 8 && x < 310 && i >= 0 && i < this.questList().length)
            this.qlog.sel = i;
    }
    drawQuestLog(ctx) {
        ctx.fillStyle = 'rgba(8,8,24,0.92)';
        ctx.fillRect(0, 0, 318, 416);
        ctx.strokeStyle = '#a89868';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, 316, 414);
        this.text.draw(ctx, 'Quests (Q to close)', 10, 12);
        const list = this.questList(), clean = (t) => t.replace(/\u3000/g, ' ').replace(/[^\x20-\x7e]/g, '?');
        if (!list.length) {
            this.text.draw(ctx, 'No quests yet.', 10, 40);
            return;
        }
        list.forEach(([q, st], i) => {
            if (i === this.qlog.sel) {
                ctx.fillStyle = 'rgba(255,255,255,0.18)';
                ctx.fillRect(8, 40 + i * 14, 302, 14);
            }
            this.text.draw(ctx, clean(`${st === 2 ? '[Done] ' : ''}${this.titles[q] ?? `Quest ${q}`}`).slice(0, 48), 12, 42 + i * 14);
        });
        const q = list[Math.min(this.qlog.sel, list.length - 1)][0], desc = this.tables[String(700 + q)]?.s ?? [];
        desc.forEach((l, i) => this.text.draw(ctx, clean(l).slice(0, 50), 12, 60 + list.length * 14 + i * 13));
    }
    musicFor(scenario) { return this.musicIdx !== undefined ? `bgm${this.musicIdx}` : scenario === '00000000' ? 'bgm0' : scenario.startsWith('0001') ? 'bgm4' : 'bgm1'; }
    spawnFx(id, wa, wb) {
        const fx = this.fxSets.get(id);
        if (!fx)
            return;
        const [x, y] = worldToReal(wa, wb);
        if (this.fxList.some(e => e.id === id && Math.hypot(e.x - x, e.y - y) < 40) || this.fxList.length > 40)
            return; // scripts re-issue some effects every poll
        this.fxList.push({ fx, id, x, y, t: 0 });
    }
    // spell id 600 = Transport has no spell entry (the Warp Gate handles it), so it is filtered out below
    refreshCareer() { {
        const nw = spellsFrom(this.tables, this.win.career, this.hist).filter(id => this.magic.spell(id) && !this.magic.known.includes(id));
        if (nw.length && !this.dead) {
            for (const id of nw)
                this.magic.learn(id);
            this.banner = { text: nw.length === 1 ? `Learned ${this.magic.spell(nw[0]).name}` : `Learned ${nw.length} new spells`, t: 0 };
        }
    } this.win.careerOpts = this.careerTarget !== this.win.career ? [this.careerTarget] : []; if (!this.win.careerOpts.length)
        this.win.careerMenu = false; }
    /** Exe level-up routine: from level 5 on, offer a profession from the hits since the last level; level 5 itself turns the Mercenary into a Warrior; the counters restart. */
    careerLevelUp() {
        const h = this.hud, was = this.careerTarget;
        this.careerTarget = careerTarget(this.win.career, h.level, this.usage);
        if (h.level === 5) {
            this.win.career = this.careerTarget = 1;
            this.banner = { text: 'Changed your occupation to [Warrior]', t: 0 };
        }
        else if (this.careerTarget !== this.win.career && this.careerTarget !== was)
            this.banner = { text: `It is possible to change your occupation to [${['Mercenary', 'Warrior', 'Wizard', 'Hunter'][this.careerTarget]}]`, t: 0 };
        this.usage = newUsage();
    }
    /** One damaging hit of the hero (exe 0x4135a3): arms = class of the wielded weapon, -1 bare-handed, 8 = spell. */
    countHit(arms) { this.usage.total++; if (arms >= 0)
        this.usage.n[Math.min(8, arms)]++; }
    openWarehouse() {
        this.qlog = null;
        this.shop = new Warehouse();
        this.dlg = null;
        this.win.item = true;
        this.win.sellValue = null;
        this.win.panelHint = 'Click to store in the warehouse';
        this.win.panel = (x, y) => !!this.shop?.over(x, y);
    }
    openShop(index) {
        this.qlog = null;
        this.shop = new Shop(shopStock(this.win.db, index, this.tables));
        this.dlg = null;
        this.win.item = true;
        this.win.sellValue = sellPrice;
        this.win.panel = (x, y) => !!this.shop?.over(x, y);
    }
    closeShop() { this.shop = null; this.win.sellValue = null; this.win.panelHint = null; this.win.panel = null; }
    /** Click a scripted object (chest, barrel...): runs its status-0 block when the player is close enough. */
    useZone(z, force = false) {
        if (!this.vm || (!force && Math.hypot(z.x - this.player.x, (z.y - this.player.y) * 1.6) > 200))
            return;
        this.vm.talk(z.rec.id);
        this.openDialog();
    }
    /** Sentence 24 / monster drops (exe 0x417550). `level` = row of Table.Tbd 30: `(tries, chance %, 10 x (table-31 row, grade code))`.
     *  tries 0 = one per player; each try succeeds when rand%100 <= chance, then one of the 10 slots is picked at random. A table-31 row is either a fixed item
     *  `(category, -, -, id, mask)` or, with category -1, a window `(-1, max, min, -1, mask)`: a random weapon/armor/accessory whose power lies in [min, max], chosen by
     *  the item weight (Item.Ibn field 4, 15000 plain ... 1000 unique). The grade code is 3 decimal digits (units: plain items, tens: magic, hundreds: rare allowed;
     *  grade 3 always allowed). Not decoded: the item mask (`mask` & col 4). */
    randomDrop(level, a, b) {
        const t30 = this.tables['30'], t31 = this.tables['31'];
        if (!t30 || !t31 || level < 0 || level >= t30.v.length / t30.cols)
            return;
        const row = t30.v.slice(level * t30.cols, (level + 1) * t30.cols), [x, y] = worldToReal(a, b), tries = row[0] > 0 ? row[0] : 1;
        for (let n = 0; n < tries; n++) {
            if (Math.floor(Math.random() * 100) > row[1])
                continue;
            const slot = Math.floor(Math.random() * 10), ref = row[2 + 2 * slot], code = row[3 + 2 * slot];
            if (ref < 0)
                continue;
            const r = t31.v.slice(ref * t31.cols, (ref + 1) * t31.cols);
            const item = r[0] !== -1 ? this.win.db.find(r[0], r[3]) : this.windowItem(r[1], r[2], code, r[4]);
            if (!item)
                continue;
            if (item.sec === 4 && (item.f['1'] ?? 0) >= 99000000 && this.hasQuestItem(item))
                continue; // quest items drop until you hold one / the quest is done
            this.ground.push({ x: x + (n ? (Math.random() - .5) * 40 : 0), y, item, gold: 0, unid: ItemDb.isVariant(item) && Math.random() < UNID_CHANCE });
        }
    }
    hasQuestItem(it) {
        const id = it.f['1'] ?? 0, quest = id === 99000000 ? 1 : id === 99000001 ? 2 : 0;
        return this.win.inv.entries.some(e => e.item.sec === 4 && (e.item.f['1'] ?? 0) === id) || (quest > 0 && this.vm?.globals.get(`q:${quest}`) === 2);
    }
    /** Random weapon/armor/accessory with power in [min, max] (field 36 for weapons/armor, 25 for accessories), weighted by field 4; the list is picked by its total weight. */
    /** `mask` = Table 31 column 4; an item qualifies when `mask & item field 3` is non-zero (exe 0x465500 tests `mask & node+0x88`; field 3 is 1 for normal items and 2 for the few special ones, windows 213/252/256 use mask 3). */
    windowItem(max, min, code, mask = 1) {
        const ok = [true, Math.floor(code / 10) % 10 !== 0, Math.floor(code / 100) % 10 !== 0], g0 = code % 10 !== 0;
        const lists = [0, 1, 2].map(sec => this.win.db.sections[sec].filter(i => {
            const g = i.f['2'] ?? 0, grade = g === 0 ? g0 : g === 3 ? true : ok[g], v = i.f[sec === 2 ? '25' : '36'];
            return grade && (mask & (i.f['3'] ?? 0)) !== 0 && v !== undefined && (max < 0 || v <= max) && (min < 0 || v >= min);
        }));
        const w = (i) => i.f['4'] ?? 0, tot = lists.map(l => l.reduce((p, i) => p + w(i), 0)), sum = tot[0] + tot[1] + tot[2];
        if (sum <= 0)
            return null;
        let pick = Math.random() * sum, k = 0;
        while (k < 2 && pick >= tot[k])
            pick -= tot[k++];
        for (const i of lists[k]) {
            pick -= w(i);
            if (pick < 0)
                return i;
        }
        return lists[k][lists[k].length - 1] ?? null;
    }
    talkTo(a) {
        if (!this.vm || a.enemy)
            return; // people and the dog keepers' dogs (kind 'partner') talk through their script object
        if (Math.hypot(a.x - this.player.x, (a.y - this.player.y) * 1.6) > 260)
            return;
        this.vm.talk(12000000 + a.rec.id);
        this.openDialog();
    }
    constructor(app, name, map, set, caf, gui, win, text, actors, vm, scenario, gender) {
        this.app = app;
        this.name = name;
        this.map = map;
        this.set = set;
        this.caf = caf;
        this.gui = gui;
        this.win = win;
        this.text = text;
        this.actors = actors;
        this.vm = vm;
        this.scenario = scenario;
        this.gender = gender;
        this.hud = { hp: 100, hpMax: 100, mp: 60, mpMax: 60, level: 1, exp: 0, expMax: 100, running: false };
        this.shots = [];
        /** Spell visuals: expanding rings (novas, explosions) and lightning strikes; timed buffs (ms left). */
        this.rings = [];
        this.strikes = [];
        this.buffs = { berserk: 0, eshield: 0, mshield: 0, counter: 0 };
        this.castT = 0;
        this.bullets = [];
        this.debug = false;
        this.paused = false;
        this.dark = null;
        this.camX = 0;
        this.camY = 0;
        /** Quest titles (Table.Tbd table 41) and the banner shown when a quest changes state. */
        this.titles = [];
        this.banner = null;
        /** Companion dog (null = none). `petIdx` is set while a swapped-in dog is still loading so the scripts already see it. */
        this.pet = null;
        this.petIdx = null;
        this.petKills = new Map();
        this.statusReq = null;
        this.mines = [];
        this.blasts = [];
        this.fightT = 0;
        this.powerT = 0;
        this.arrivalEntry = 0;
        this.pollT = 0;
        this.musicT = 0;
        this.zones = [];
        this.tables = {};
        this.expTable = [];
        this.totalExp = 0;
        this.devNext = 0;
        // --- combat ---
        this.target = null;
        this.atkT = -1;
        this.atkHit = false;
        this.dead = false;
        this.spawnPos = { x: 0, y: 0 };
        this.floaters = [];
        this.armed = false;
        this.leaving = false;
        this.saveT = 0;
        /** Slot (0-5) this character is saved to; -1 = none free. */
        this.slot = -1;
        /** Map exits: Mct zone records 10000000+n fire status 3 when the player walks into their rect; the script block runs sentence 17 (destination scenario index, entry zone number). */
        this.inside = new Set();
        this.enterIds = new Set();
        /** Warp gates (sentences 37/38, Table.Tbd 40 = list of gates: name + scenario index). Opened gates are kept in the script globals as `w:<scenario index>`; the town gate starts open. */
        this.warpMenu = false;
        this.dlgPick = null;
        /** Items lying on the ground (real-pixel coordinates). gold > 0 for gold piles. */
        this.ground = [];
        /** Brain Globe being held with the left button (and for how long, ms). */
        this.holdZone = null;
        this.holdT = 0;
        this.groundDraw = { get y() { return 0; }, draw: () => { } };
        /** Open message window: text lines and clickable ~option~ regions (line, col0, col1). */
        this.dlg = null;
        /** Quest log (Q): lists quests set by sentence 62 (state 1 accepted, 2 done); text from Table.Tbd 41 (titles) and 700+q (description lines). */
        this.qlog = null;
        this.shop = null;
        /** Tower of Ordeal Black Jack hand in progress (script sentence 73). */
        this.bj = null;
        /** Script effects (sentence 36): sprite sets by id and the running instances. */
        this.fxSets = new Map();
        this.fxList = [];
        /** Career change bookkeeping: how often melee / magic / ranged attacks were used (saved). */
        this.usage = newUsage();
        this.careerTarget = 0; // careerTarget = the profession offered on the Status screen (player+0x30)
        /** Class id of the hero at each level-up (exe: byte history, drives the spell learning; see career.ts). */
        this.hist = [];
        /** Triple Attack (manual): "only warriors that have reached a certain level" with a melee weapon. GUESS: Warrior, level >= TRIPLE_LEVEL, three strikes at +40 % damage, 2.5 s cooldown. */
        this.tripleLeft = 0;
        this.tripleCd = 0;
        this.gearKey = '';
        this.harmonyKey = '';
        this.regenT = 0;
        /** Arrows / shot pellets of the hero's ranged arms (GUESS: 0.7 px/ms, damage on arrival). */
        this.arrows = [];
        const mk = map.markerReal();
        this.player = { x: +(q.get('x') ?? mk?.[0] ?? 3600), y: +(q.get('y') ?? mk?.[1] ?? 8100), dir: 0, t: 0, anim: ANIM_IDLE };
        const p = this.player;
        this.spawnPos = { x: p.x, y: p.y };
        const self = this;
        this.actorCtx = { get px() { return p.x; }, get py() { return p.y; }, blocked: (x, y) => this.map.blockedReal(x, y), hitPlayer: (d, attr, from) => this.hitPlayer(d, false, attr, from), sfx: id => audio.sfx(id, 0.7), shoot: (x, y, tx, ty, dmg) => { const dx = tx - x, dy = ty - y, n = Math.hypot(dx, dy) || 1; this.bullets.push({ x, y, vx: dx / n, vy: dy / n, t: 0, dmg }); }, get pet() { return self.pet && !self.pet.dead ? self.pet : null; }, hitPet: d => this.hitPet(d) };
        this.petCtx = { get px() { return p.x; }, get py() { return p.y; }, blocked: (x, y) => this.map.blockedReal(x, y), enemies: () => this.actors.filter(a => a.enemy && !a.gen && a.alive), hit: (a, d) => this.damage(a, d) };
        this.drawPlayer = {
            get y() { return p.y; },
            draw: (c, camX, camY) => {
                const d = this.caf.anims[p.anim].dirs[p.dir];
                const raw = Math.max(0, Math.floor(p.t / FRAME_MS)), fi = d.frames ? (p.anim === 23 ? Math.min(raw, d.frames - 1) : raw % d.frames) : 0;
                const inv = this.win.inv, eq = inv.equipped().filter(e => !Inventory.broken(e)), look = [...LAYERS];
                if (!q.get('layers')) {
                    const ar = eq.find(e => e.item.sec === 1 && ItemDb.slot(e.item) === 'body'), sh = eq.find(e => e.item.sec === 1 && ItemDb.slot(e.item) === 'shield' && !this.win.shieldOff(e)), wp = eq.find(e => e.item.sec === 0);
                    if (ar)
                        look.push(armorLayer(ar.item.name));
                    if (sh)
                        look.push(shieldLayer(sh.item.name));
                    if (wp) {
                        const it = wp.unid ? this.win.db.base(wp.item) : wp.item;
                        look.push(weaponLayer(it.name, ItemDb.arms(it)));
                    }
                }
                for (const l of look) {
                    const seq = d.layers[l];
                    if (!seq || !seq.length)
                        continue;
                    const f = this.set.pattern(seq[Math.min(fi, seq.length - 1)][1]);
                    if (!f)
                        continue;
                    c.drawImage(f.canvas, Math.round(p.x - camX + f.ox), Math.round(p.y - camY + f.oy));
                }
            },
        };
        window.game = this;
        if (this.vm)
            this.vm.hooks = {
                nearTarget: (char, range) => {
                    const z = this.zones.find(q => q.rec.id === char);
                    if (!z || this.dead)
                        return null;
                    const [wa, wb] = realToWorld(this.player.x, this.player.y);
                    return Math.hypot(wa - z.rec.a, wb - z.rec.b) <= range ? [wa, wb] : null;
                },
                bullet: (x, y, angle, power) => {
                    const r = angle * Math.PI / 180, ca = Math.cos(r), cb = Math.sin(r), vx = (ca - cb) * 0.15, vy = (ca + cb) * 0.10, n = Math.hypot(vx, vy) || 1, [rx, ry] = worldToReal(x, y);
                    this.bullets.push({ x: rx, y: ry, vx: vx / n, vy: vy / n, t: 0, dmg: Math.max(1, Math.round(power / 25)) });
                },
                // operand 9: 1 while the hero or the dog stands inside the object's rect (the pressure-plate statues count 90 polls of this before they trigger)
                pressed: id => {
                    const z = this.zones.find(q => q.rec.id === id);
                    if (!z)
                        return 0;
                    if (z.rec.type === 5) { // Brain Globe / statue plate: hold the left button on it (manual: "put the cursor on the globe and hold left-click"); the dog standing on it also works
                        const [pa, pb] = this.pet && !this.pet.dead ? realToWorld(this.pet.x, this.pet.y) : [1e9, 1e9], r = z.rec.rect;
                        return this.holdZone === z || (pa >= z.rec.a + r[0] - 200 && pa <= z.rec.a + r[2] + 200 && pb >= z.rec.b + r[1] - 200 && pb <= z.rec.b + r[3] + 200) ? 1 : 0;
                    }
                    const r = z.rec.rect, m = 200, at = (e) => { const [wa, wb] = realToWorld(e.x, e.y); return wa >= z.rec.a + r[0] - m && wa <= z.rec.a + r[2] + m && wb >= z.rec.b + r[1] - m && wb <= z.rec.b + r[3] + m; }; // rect inflated by 200 world units (GUESS: the record's rect is only the statue's footprint)
                    return at(this.player) || (this.pet && !this.pet.dead && at(this.pet)) ? 1 : 0;
                },
                charPos: char => { const r = this.actors.find(a => a.rec.kind === 'people' && 12000000 + a.rec.id === char); if (r)
                    return [r.rec.a, r.rec.b]; const z = this.zones.find(z => z.rec.id === char); return z ? [z.rec.a, z.rec.b] : null; },
                level: () => this.hud.level,
                quest: (q, st) => {
                    const title = (this.titles[q] ?? `Quest ${q}`).replace(/[^\x20-\x7e]/g, '?');
                    if (st === 1 || st === 2)
                        this.banner = { text: `${st === 1 ? 'Quest accepted' : 'Quest completed'}: ${title}`, t: 0 };
                },
                show: (id, v) => { const z = this.zones.find(z => z.rec.id === id); if (z)
                    z.visible = v; const a = this.actors.find(a => 12000000 + a.rec.id === id); if (a)
                    a.hidden = !v; },
                partner: () => this.partner, swapPartner: i => this.swapPet(i), partnerStatus: i => { this.statusReq = i; },
                gold: () => this.win.gold, addGold: d => { this.win.gold = Math.max(0, this.win.gold + d); },
                openShop: i => this.openShop(i),
                exit: (idx, entry) => { void this.exit(idx, entry); },
                warp: cmd => this.warp(cmd),
                entity: spawn => { const a = this.actors.find(a => a.enemy && a.rec.id === spawn); return a ? (a.alive ? 1 : 0) : undefined; },
                findSlot: (a, b, alive) => { const m = this.actors.find(m => (m.slot || alive) && m.enemy && 14000000 + m.rec.id >= a && 14000000 + m.rec.id <= b && (alive ? !m.free : m.free)); return m ? 14000000 + m.rec.id : -1; },
                spawnSlot: (slot, a, b) => { const m = this.actors.find(m => m.slot && 14000000 + m.rec.id === slot); if (m) {
                    const [x, y] = worldToReal(a, b);
                    m.revive(x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 60);
                } },
                sound: id => { audio.sfx(id); },
                notice: text => { this.banner = { text: text.split('\n')[0].replace(/[^\x20-\x7e]/g, '?'), t: 0 }; },
                hasItem: (cat, id) => this.win.inv.entries.some(e => e.item.sec === cat && (e.item.f['1'] ?? 0) === id),
                takeItem: (cat, id) => { const e = this.win.inv.entries.find(e => e.item.sec === cat && (e.item.f['1'] ?? 0) === id); if (e)
                    this.win.inv.remove(e); },
                blackjack: bet => { this.bj = new Blackjack(bet); this.dlg = null; },
                learnSpell: n => { this.magic.learn(600 + n); },
                hasSpell: n => this.magic.known.includes(600 + n),
                arrival: () => this.arrivalEntry,
                expPct: pct => { this.totalExp += Math.floor(this.hud.expMax * pct / 100); this.syncExp(); },
                offeredClass: () => [0, 1, 3, 2][this.careerTarget] ?? 0,
                offerClass: idx => { const t = [0, 1, 3, 2][idx]; if (idx >= 1 && idx <= 3 && t !== undefined) {
                    this.careerTarget = t;
                    this.refreshCareer();
                } },
                giveItem: (cat, id) => { const item = this.win.db.find(cat, id); if (!item)
                    return; if (!this.win.inv.add(item))
                    this.ground.push({ x: this.player.x, y: this.player.y, item, gold: 0 }); },
                randomDrop: (tier, a, b) => this.randomDrop(tier, a, b),
                vitals: k => k === 0 ? [this.hud.hp, this.hud.hpMax] : k === 1 ? [this.hud.mp, this.hud.mpMax] : this.pet && !this.pet.dead ? [Math.round(this.pet.hp), this.pet.maxHp] : [-1, -1],
                heal: k => { if (k === 0) {
                    this.hud.hp = this.hud.hpMax;
                    if (this.pet && !this.pet.dead)
                        this.pet.hp = this.pet.maxHp;
                }
                else
                    this.hud.mp = this.hud.mpMax; },
                warehouse: () => this.openWarehouse(), effect: (id, a, b) => this.spawnFx(id, a, b),
                needIdentify: () => this.win.needsIdentify(), identify: () => this.win.identifyAll(),
                repairCost: slot => this.win.repairCostOf(slot), repair: slot => this.win.repair(slot),
                drop: (cat, id, a, b, min, max) => {
                    const [x, y] = worldToReal(a, b), amount = min + Math.floor(Math.random() * Math.max(1, max - min + 1));
                    if (cat === 4 && id === 0)
                        this.ground.push({ x, y, gold: amount });
                    else {
                        const item = this.win.db.find(cat, id);
                        if (item)
                            this.ground.push({ x, y, item, gold: 0 });
                        else
                            console.warn('script drop: unknown item', cat, id);
                    }
                },
            };
    }
    static async create(app, gender, name, opts) {
        const ld = opts?.load;
        await Data.init(ld ? Math.max(ld.ep ?? 1, opts?.ep ?? 1) : opts?.ep ?? Data.ep); // which episodes' data overlays are installed (saves remember theirs; a character carried between scenarios keeps it)
        if (!ld && !opts?.carry) {
            savedVars.clear();
            savedGround.clear();
            savedZones.clear();
            savedGlobals = new Map();
        } // a new game must not inherit the previous character's world state
        if (ld) {
            savedGlobals = new Map(ld.globals);
            savedVars.clear();
            for (const [k, v] of Object.entries(ld.vars))
                savedVars.set(k, new Map(v));
            savedGround.clear();
            for (const [k, v] of Object.entries(ld.ground))
                savedGround.set(k, v);
            savedZones.clear();
            for (const [k, v] of Object.entries(ld.zones ?? {}))
                savedZones.set(k, v);
        }
        const scenario = opts?.scenario ?? SCENARIO;
        const sc = await loadScenarioActors(app, scenario).catch(() => ({ map: null, music: undefined, actors: [], zones: [] }));
        const [map, set, caf, gui, win, text, tables, vm] = await Promise.all([GameMap.load(q.get('map') ?? sc.map ?? 'f00_01'), app.set(Data.url(`${gender}`)), loadCaf(Data.url(`${gender}.caf.json`)), Gui.load(), Windows.load(app), Text.load(app), fetch(Data.url('tables.json')).then(r => r.json()), ScriptVM.load(scenario).catch(() => null)]);
        const g = new GameScene(app, name, map, set, caf, gui, win, text, sc.actors, vm, scenario, gender);
        if (vm) {
            vm.globals = savedGlobals;
            const sv = savedVars.get(scenario);
            if (sv)
                vm.vars = sv;
        }
        const sz = savedZones.get(scenario);
        if (sz)
            for (const z of sc.zones)
                if (z.rec.id in sz)
                    z.visible = sz[z.rec.id];
        const sg = savedGround.get(scenario);
        if (sg)
            g.ground = sg.flatMap(o => o.gold ? [{ x: o.x, y: o.y, gold: o.gold }] : (() => { const item = win.db.get(o.sec, o.idx); return item ? [{ x: o.x, y: o.y, item, gold: 0, unid: o.unid, dur: o.dur }] : []; })());
        g.menu = await GameMenu.load(app);
        if (opts?.carry) {
            g.magic = opts.carry.magic;
            g.mapwin = opts.carry.mapwin;
            g.mapwin.open = false;
        }
        else {
            [g.magic, g.mapwin] = await Promise.all([Magic.load(app, tables), MapWindow.load(app)]);
            if (ld) {
                g.magic.restore(ld.magic);
                g.mapwin.decode(ld.explored);
            }
        }
        g.win.hudOver = (x, y) => g.magic.barHit(x, y) >= 0 || inBox(MINE_BTN, x, y) || inBox(POWER_BTN, x, y) || (!!g.pet && inBox(PET_GAUGE, x, y));
        if (isDarkMap(map.m.name))
            g.dark = await DarkLayer.load(app);
        g.slot = opts?.carry ? opts.carry.slot : ld ? (opts?.slot ?? ld.slot ?? 0) : firstFree();
        if (ld) {
            Object.assign(g.player, { x: ld.x, y: ld.y });
            g.spawnPos = { x: map.markerReal()?.[0] ?? ld.x, y: map.markerReal()?.[1] ?? ld.y };
            g.hud = ld.hud;
            g.totalExp = ld.totalExp;
            g.syncExp();
            g.win.gold = ld.gold;
            g.win.inv.set = ld.invSet ?? 0;
            g.win.career = ld.career ?? 0;
            if (ld.attr?.length === 8)
                g.win.attr = [...ld.attr];
            g.usage = ld.usage && Array.isArray(ld.usage.n) ? ld.usage : newUsage();
            g.careerTarget = ld.ct ?? g.win.career;
            g.hist = ld.hist ? [...ld.hist] : Array(Math.max(0, ld.hud.level - 1)).fill(CLASS_ID[g.win.career]); // old saves: every level counts for the current profession
            if (ld.ct === undefined && g.hud.level >= 5 && g.win.career === 0)
                g.win.career = g.careerTarget = 1; // saves of earlier builds: reaching level 5 makes a Warrior of the Mercenary (exe rule)
            for (const [sec, idx, x, y, , unid, dur] of ld.wh ?? []) {
                const item = win.db.get(sec, idx);
                if (item) {
                    const [w, h] = ItemDb.size(item);
                    g.win.wh.entries.push({ item, x, y, w, h, unid: !!unid, dur: dur !== undefined && dur >= 0 ? dur : undefined });
                }
            }
            for (const [sec, idx, x, y, eq, unid, dur] of ld.inv) {
                const item = win.db.get(sec, idx);
                if (item) {
                    const [w, h] = ItemDb.size(item);
                    g.win.inv.entries.push({ item, x, y, w, h, eq: !!((eq ?? 0) & 1), alt: !!((eq ?? 0) & 2), unid: !!unid, dur: dur !== undefined && dur >= 0 ? dur : undefined });
                }
            }
        }
        const cr = opts?.carry;
        if (cr) {
            g.hud = cr.hud;
            g.totalExp = cr.totalExp;
            g.win.inv = cr.win.inv;
            g.win.wh = cr.win.wh;
            g.win.career = cr.win.career;
            g.win.attr = cr.win.attr;
            g.usage = cr.usage ?? g.usage;
            g.careerTarget = cr.careerTarget;
            g.hist = cr.hist;
            g.win.gold = cr.win.gold;
        }
        // monsters addressed by the 'free slot' sentence 32 start dormant: the script summons them (trap rooms, waves). Sentence 31 ranges (alive checks, e.g. 'all monsters of the room are dead') address ordinary monsters
        if (vm) {
            const ranges = [];
            for (const b of vm.data.blocks)
                for (const [sid, ops] of b)
                    if (sid === 32 && ops[0][0] < 3 && ops[1][0] < 3)
                        ranges.push([ops[0][1], ops[1][1]]);
            for (const a of g.actors)
                if (a.enemy && ranges.some(([lo, hi]) => 14000000 + a.rec.id >= lo && 14000000 + a.rec.id <= hi)) {
                    a.slot = true;
                    a.hidden = true;
                }
        }
        g.zones = sc.zones;
        g.musicIdx = sc.music;
        if (vm) { // effect sprite sets named by sentence 36 of this scenario
            const ids = new Set();
            for (const bl of vm.data.blocks)
                for (const [sid, ops] of bl)
                    if (sid === 36 && ops[0]?.[0] === 1)
                        ids.add(ops[0][1]);
            if (ids.size) {
                const index = await (await fetch(Data.url('fx/index.json'))).json().catch(() => []);
                await Promise.all([...ids].map(async (id) => { const f = fxFolder(index, id), set = f ? await loadFxSet(app, f) : null; if (set)
                    g.fxSets.set(id, set); }));
            }
        }
        // the scripts of the three towns answer a click on object 10000300 (the warehouse, not an Mct record) with sentence 41; draw a chest near the arrival point (PLACEHOLDER position and sprite: the exe's own placement is not decoded)
        if (vm?.data.status.some(([, st, c]) => st === 0 && c === WAREHOUSE_OBJECT)) {
            const [wz] = await loadZones(app, [{ id: WAREHOUSE_OBJECT, type: 0, a: 0, b: 0, rect: [-80, -80, 80, 80], vis: 1, pat: 0 }]);
            const ok = (x, y) => [[0, 0], [30, 0], [-30, 0], [0, 20], [0, -20]].every(([ox, oy]) => !map.blockedReal(x + ox, y + oy));
            outer: for (const r of [240, 300, 360, 420])
                for (let a = 0; a < 360; a += 20) {
                    const x = g.player.x + r * Math.cos(a * Math.PI / 180), y = g.player.y + r * 0.6 * Math.sin(a * Math.PI / 180);
                    if (ok(x, y)) {
                        wz.x = x;
                        wz.y = y;
                        break outer;
                    }
                }
            if (wz.x !== 0 || wz.y !== 0)
                g.zones.push(wz);
        }
        // object-local 0 = "currently shown" (sentences 22/23 keep it up to date); objects placed visible start at 1 (the boss-room polls wait for the reward chest 10011000 to read 1)
        if (vm)
            for (const z of g.zones)
                if (z.visible && z.rec.id >= 10000000 && z.rec.id < 11000000 && !vm.vars.has(`5:${z.rec.id}:1000000`))
                    vm.vars.set(`5:${z.rec.id}:1000000`, 1);
        if (vm)
            for (const [, st, ch] of vm.data.status)
                if (st === 3)
                    g.enterIds.add(ch);
        g.arrivalEntry = opts?.entry ?? 0;
        if (opts?.entry !== undefined) {
            const pt = g.entryPoint(opts.entry);
            if (pt) {
                g.player.x = pt[0];
                g.player.y = pt[1];
                g.spawnPos = { x: pt[0], y: pt[1] };
            }
        }
        if (cr?.pet) {
            g.pet = cr.pet;
            g.petKills = cr.petKills;
            Object.assign(g.pet, { x: g.player.x + 50, y: g.player.y + 20, state: 'idle', t: 0 });
        }
        else if (ld?.pet) {
            g.petKills = new Map(ld.pet.others);
            const pet = await Pet.load(app, tables, ld.pet.idx, g.player.x + 50, g.player.y + 20);
            pet.kills = ld.pet.kills;
            pet.heroLevel = g.hud.level;
            pet.hp = ld.pet.hp;
            pet.mode = ld.pet.mode;
            g.pet = pet;
        }
        g.checkZones(true); // zones already under the player (arrival point) only fire once he has left and re-entered
        g.tables = tables;
        g.expTable = tables['13'].v;
        g.titles = tables['41']?.s ?? [];
        g.syncExp();
        audio.bgm(g.musicFor(scenario));
        g.vm?.event(7, 4294967295); // status 7: map start (area name notice, initial object states)
        return g;
    }
    /** Belt pocket: the first eight belt-capable consumables of the inventory fill slots 1-8 (the original lets you place them yourself - not implemented). */
    belt() { return this.win.inv.entries.filter(e => ItemDb.beltable(e.item)).slice(0, 8); }
    /** Use a consumable: tablets restore HP (field 27), capsules MP (28); Vitality/Mental Source and the fruits raise max HP/MP for good (29/30). Meat is companion food. */
    useItem(e) {
        const it = e.item, fx = ItemDb.effect(it), h = this.hud;
        if (it.sec === 3 && it.f['31']) { // Meat: companion food (heals field / 10 HP, guess)
            const pet = this.pet;
            if (!pet) {
                this.banner = { text: 'You have no companion', t: 0 };
                return;
            }
            if (!pet.dead && pet.hp >= pet.maxHp) {
                this.banner = { text: `${pet.name} is not hungry`, t: 0 };
                return;
            }
            this.win.inv.remove(e);
            const hp = Math.round(it.f['31'] / 10);
            pet.feed(hp);
            this.floaters.push({ x: pet.x, y: pet.y - 60, t: 0, s: `+${hp}` });
            return;
        }
        if (it.sec === 3 && it.f['22'] === 3) { // medicines: Fire..Metal Medicine (field 23 = attribute 1-8) raise that basic attribute, White Medicine (no field 23) resets them all
            const a = this.win.attr, k = (it.f['23'] ?? 0) - 1;
            this.win.inv.remove(e);
            if (k < 0) {
                a.fill(0);
                this.banner = { text: 'All attribute levels returned to 0', t: 0 };
            }
            else {
                a[k] = Math.min(10, a[k] + 1);
                const o = k ^ 1;
                a[o] = Math.max(-10, a[o] - 1);
                this.banner = { text: `${ATTRS[k]} level ${a[k]}`, t: 0 };
            } // GUESS: the opposite attribute (Fire/Water, Earth/Thunder, Holy/Dark, Gel/Metal) drops by one
            return;
        }
        if (it.sec !== 3 || (!fx.hp && !fx.mp && !fx.maxHp && !fx.maxMp)) {
            this.banner = { text: 'This item cannot be used', t: 0 };
            return;
        }
        if (this.dead)
            return;
        if (fx.hp && !fx.maxHp && h.hp >= h.hpMax && !fx.mp) {
            this.banner = { text: 'HP is already full', t: 0 };
            return;
        }
        if (fx.mp && !fx.hp && h.mp >= h.mpMax) {
            this.banner = { text: 'MP is already full', t: 0 };
            return;
        }
        this.win.inv.remove(e);
        if (fx.maxHp)
            h.hpBonus = (h.hpBonus ?? 0) + fx.maxHp;
        if (fx.maxMp)
            h.mpBonus = (h.mpBonus ?? 0) + fx.maxMp;
        if (fx.maxHp || fx.maxMp) {
            this.applyStats(false);
            this.banner = { text: `${it.name}: maximum ${fx.maxHp ? 'HP' : 'MP'} +${fx.maxHp || fx.maxMp}`, t: 0 };
        }
        const hp = Math.min(Math.round(fx.hp * (1 + this.win.fx('stamina') / 100)), h.hpMax - h.hp), mp = Math.min(Math.round(fx.mp * (1 + this.win.fx('mental') / 100)), h.mpMax - h.mp); // Effect of Stamina / Mental Medicine lines
        h.hp += hp;
        h.mp += mp;
        if (hp > 0)
            this.floaters.push({ x: this.player.x, y: this.player.y - 90, t: 0, s: `+${hp}` });
        if (mp > 0)
            this.floaters.push({ x: this.player.x, y: this.player.y - 106, t: 0, s: `+${mp} MP` });
    }
    /** Hero stats from the exe's stat tables (src/pstats.ts); a level-up refills HP/MP. */
    applyStats(refill) {
        if (!this.tables['900'])
            return;
        const h = this.hud, ps = playerStats(this.tables, this.gender, h.level, CLASS_OF[this.win.career]), full = h.hp >= h.hpMax && h.mp >= h.mpMax;
        h.hpMax = ps.hp + (h.hpBonus ?? 0) + this.win.itemHp();
        h.mpMax = ps.mp + (h.mpBonus ?? 0) + this.win.itemMp();
        this.win.ps = ps;
        if (refill || full) {
            h.hp = h.hpMax;
            h.mp = h.mpMax;
        }
        else {
            h.hp = Math.min(h.hp, h.hpMax);
            h.mp = Math.min(h.mp, h.mpMax);
        }
    }
    /** Table.Tbd table 13: cumulative EXP needed to leave level n (1-based). */
    syncExp() {
        const t = this.expTable, h = this.hud;
        const before = h.level;
        while (h.level < 100 && this.totalExp >= t[h.level - 1]) {
            h.level++;
            this.hist.push(CLASS_ID[this.win.career]);
            this.careerLevelUp();
        }
        this.applyStats(h.level > before);
        const lo = h.level > 1 ? t[h.level - 2] : 0;
        h.exp = this.totalExp - lo;
        h.expMax = Math.max(1, t[h.level - 1] - lo);
    }
    /** Dev helpers: X = +30 exp, F2 = add the next item from Item.Ibn to the inventory (cycles weapons, armor, ...). */
    dev() {
        const p = this.app.input.pressed;
        if (p.has('x')) {
            this.totalExp += 30;
            this.syncExp();
        }
        if (p.has('f2')) {
            const all = this.win.db.sections.flat();
            const it = all[(this.devNext += 37) % all.length];
            if (!this.win.inv.add(it))
                this.win.inv.entries.length = 0;
            this.win.item = true;
        }
    }
    /** Monster hit on the hero. Negative Thunder / Metal levels do nothing; positive ones dodge (melee / magic). Magic damage is scaled by the Dark level. */
    hitPlayer(d, magic, attr, from) {
        const hm = this.harmony();
        if (this.dead)
            return;
        const h = this.hud, ev = Math.max(0, this.win.attrLv(magic ? 7 : 3)) * 0.05 + this.win.fx(magic ? 'meva' : 'eva') / 100 + hm.dodge;
        if (Math.random() < ev) {
            this.floaters.push({ x: this.player.x, y: this.player.y - 70, t: 0, s: 'Miss' });
            return;
        }
        if (magic)
            d = Math.max(1, Math.round(d / this.win.attrMul(5) * (1 - Math.min(0.8, this.win.mdef() / 100)) * hm.magicTaken * (this.buffs.mshield > 0 ? 1 - Math.min(0.95, this.spellRate(618)) : 1)));
        if (attr !== undefined)
            d = Math.max(1, Math.round(d / this.wheel(attr)));
        d = Math.max(1, Math.round(d * (9 + Math.floor(Math.random() * 3)) / 10) - this.win.stats().defense);
        if (hm.taken < 1 && !magic)
            d = Math.max(1, Math.round(d * hm.taken));
        if (from && from.alive && Math.random() * 100 < this.win.fx('reflGen')) {
            const r = Math.ceil(d * this.win.fx('reflRate') / 100);
            if (r > 0) {
                this.damage(from, r);
                this.rings.push({ x: from.x, y: from.y, t: 0, r: 30, color: '#e0e0ff' });
            }
        } // shield reflection: chance = Generation of Reflection %, damage = Reflection Rate % (literal reading of the two lines)
        if (this.buffs.counter > 0 && from && !magic && from.alive) {
            this.damage(from, Math.max(1, Math.round(d * Math.min(1, this.spellRate(619)))));
            this.rings.push({ x: from.x, y: from.y, t: 0, r: 40, color: '#ffc040' });
        }
        if (this.buffs.eshield > 0) {
            const ab = Math.min(h.mp, d);
            h.mp -= ab;
            d -= ab;
            if (d <= 0) {
                this.floaters.push({ x: this.player.x, y: this.player.y - 70, t: 0, s: `-${ab} MP` });
                return;
            }
        }
        h.hp = Math.max(0, h.hp - d);
        this.win.wearArmor();
        this.floaters.push({ x: this.player.x, y: this.player.y - 70, t: 0, s: `-${d}` });
        audio.sfx(SFX.hurt, 0.8);
        if (h.hp <= 0) {
            this.dead = true;
            this.target = null;
            this.atkT = -1;
            this.player.anim = 23;
            this.player.t = 0;
        }
    }
    /** Weakness wheel (manual): Fire/Water, Earth/Thunder, Holy/Dark, Gel/Metal are opposites; a strong opposite level is an advantage, a low own level a disadvantage. GUESS: damage x (1 + 5 % per level of (opposite - same)), limited to 0.5-1.5; monster attribute = Mct field 652 (0 Fire, 1 Water, 2 Earth, 3 Thunder, 5 Dark ...). */
    wheel(monsterAttr) { const w = this.win; return Math.max(0.5, Math.min(1.5, 1 + 0.05 * (w.attrLv(monsterAttr ^ 1) - w.attrLv(monsterAttr)))); }
    hurtEnemy(a) {
        // exe 0x412a40 (player->monster): damage = power * (9 + rand%3 | 10 + rand%3) * Table11[neutral=10] / 100 - monster flat defence (+0xe8).
        // power = weapon attack (item field 26; fists = 10) * strength% (stat table row 4: 140 at level 1, +10 per fighter level). The real player attack builder was not found, so using strength as a multiplier is a GUESS.
        // Monster defence is Mct record index 657 (0/20/40/70 by tier) - unverified, so a floor of 25% of power keeps early monsters killable.
        const st = this.win.stats(), str = this.win.strength(), power = (st.atkMax ? st.atkMin + Math.random() * (st.atkMax - st.atkMin) : 10) * str / 100;
        if (Math.random() < Math.max(0, -this.win.attrLv(2)) * 0.05) {
            this.floaters.push({ x: a.x, y: a.y - 80, t: 0, s: 'Miss' });
            return;
        } // negative Earth level = lower hit rate
        const raw = power * this.wheel(a.stats.attr ?? 0) * (this.powerT > 0 ? 1.5 : 1) * (this.tripleLeft > 0 ? 1.4 : 1) * (this.buffs.berserk > 0 ? 1.4 : 1) * this.harmony().dmg * (9 + Math.floor(Math.random() * 3)) / 10;
        this.win.wearWeapon();
        {
            const w = this.win.inv.equipped('weapon')[0];
            this.countHit(w ? ItemDb.arms(w.item) : -1);
        }
        const dealt = Math.max(1, Math.round(Math.max(raw * 0.25, raw - (a.stats.defense ?? 0))));
        this.damage(a, dealt);
        // weapon bonuses: absorption (chance %, then rate % of the damage becomes HP) and stiffness (chance %, longer stagger)
        const w = this.win, h = this.hud;
        if (!this.dead && Math.random() * 100 < w.fx('absGen')) {
            const g = Math.min(h.hpMax - h.hp, Math.ceil(dealt * w.fx('absRate') / 100));
            if (g > 0) {
                h.hp += g;
                this.floaters.push({ x: this.player.x, y: this.player.y - 90, t: 0, s: `+${g}` });
            }
        }
        if (a.alive && Math.random() * 100 < w.fx('stunP'))
            a.stun = Math.max(a.stun, 240 + 100 * w.fx('stunD'));
    }
    /** Apply final damage to a monster: floater, sound, and the death rewards (experience, gold, item drop, kill script event). */
    damage(a, dmg) {
        a.hp -= dmg;
        if (a.hp > 0)
            a.hurt(this.player.x, this.player.y);
        this.floaters.push({ x: a.x, y: a.y - 80, t: 0, s: String(dmg) });
        audio.sfx(a.hp <= 0 ? SFX.kill : (() => { const w = this.win.inv.equipped('weapon')[0], ar = w ? ItemDb.arms(w.item) : 0; return ar === 1 || ar === 3 ? SFX.heavyHit : SFX.hit; })(), 0.8);
        if (a.hp <= 0) {
            a.die();
            this.totalExp += a.stats.exp;
            this.syncExp();
            if (this.pet && !this.pet.dead)
                this.pet.addKill();
            if (this.vm?.event(4, 14000000 + a.rec.id))
                this.openDialog();
            const [g0, g1] = a.stats.gold, gold = Math.random() * 100 < (a.stats.goldChance ?? 100) ? Math.max(1, Math.round((g0 + Math.floor(Math.random() * (g1 - g0 + 1))) * (1 + this.win.fx('gold') / 100))) : 0; // Amount of Gold line   // exe 0x45a030: chance%, then min + rand%(max-min+1)
            if (gold > 0 && g1 > 0)
                this.ground.push({ x: a.x, y: a.y, gold });
            // item drop (exe 0x45a000): always calls the generator with the monster's drop level; the chance lives in Table.Tbd 30
            const st = a.rec.st;
            if (st && st.dlv >= 0) {
                const [wa, wb] = realToWorld(a.x, a.y);
                this.randomDrop(st.dlv, wa, wb);
                // GUESS: no monster carries drop levels 162-165 (Jack, Queen, King, Joker, wanted by the card quest in 99000018); the final monster of each phantom floor 99000019..22 rolls its card
                const fl = PHANTOM_FLOORS[this.scenario];
                if (fl && st.dlv === fl[0])
                    this.randomDrop(fl[1], wa, wb);
            }
        }
    }
    /** Sentence 45 ("Swap Dogs"): the chosen dog joins, the previous one returns to its keeper (the scripts' polls show / hide the keepers' dogs by `partner`). */
    swapPet(i) {
        if (this.partner === i)
            return;
        if (this.pet)
            this.petKills.set(this.pet.idx, this.pet.kills);
        this.petIdx = i;
        const p = this.player;
        Pet.load(this.app, this.tables, i, p.x + 50, p.y + 20).then(pet => {
            pet.kills = this.petKills.get(i) ?? 0;
            pet.heroLevel = this.hud.level;
            pet.hp = pet.maxHp;
            this.pet = pet;
            this.petIdx = null;
            this.banner = { text: `${pet.name} joined you`, t: 0 };
        }).catch(() => { this.petIdx = null; });
    }
    hitPet(d) {
        const pet = this.pet;
        if (!pet || pet.dead)
            return;
        if (Math.random() * 100 < pet.gear.eva) {
            this.floaters.push({ x: pet.x, y: pet.y - 60, t: 0, s: 'Miss' });
            return;
        } // Companion Evasion Rate line (percent, like the hero's)
        const dm = pet.take(Math.round(d * (9 + Math.floor(Math.random() * 3)) / 10));
        this.floaters.push({ x: pet.x, y: pet.y - 60, t: 0, s: `-${dm}` });
        if (pet.dead)
            this.banner = { text: `${pet.name} has fallen - feed it Meat`, t: 0 };
    }
    /** Sentence 3 ("Check Status" in a dog keeper's menu): that dog's status; the active dog shows its real numbers, a resting one level 1 (levels of resting dogs are kept as kills). */
    showDogStatus(i) {
        const t = this.tables['60'];
        if (!t)
            return;
        if (this.pet?.idx === i) {
            this.setDialog(this.pet.statusLines());
            this.dlgPick = () => { };
            return;
        }
        const kills = this.petKills.get(i) ?? 0, lv = Math.max(1, Math.min(this.hud.level, 1 + Math.floor(kills / 6))), m = t.v.slice(i * t.cols + 2, i * t.cols + 5);
        this.setDialog([`${t.s?.[i * t.cols] ?? `Dog ${i}`}   Lv.${lv}`, ' ', `HP ${Math.round((100 + 30 * (lv - 1)) * m[0] / 1000)}`, `Attack ${Math.round((10 + 3 * (lv - 1)) * m[1] / 1000)}   Defense ${Math.round((2 + 1.5 * (lv - 1)) * m[2] / 1000)}`, `Monsters defeated ${kills}`, ' ', '  ~OK~']);
        this.dlgPick = () => { };
    }
    togglePetMode() { if (!this.pet)
        return; this.banner = { text: `${this.pet.name}: ${this.pet.toggleMode().toUpperCase()}`, t: 0 }; }
    /** TAB + left click: click the dog = its status; an item = fetch it; a switch / button = press it; otherwise jump (kicking an enemy there). */
    petCommand(wx, wy, hov, gh, zov) {
        const pet = this.pet;
        if (pet.dead) {
            this.banner = { text: `${pet.name} cannot move`, t: 0 };
            return;
        }
        if (pet.hit(wx, wy)) {
            if (!pet.busy) {
                this.setDialog(pet.statusLines());
                this.dlgPick = () => { };
            }
            return;
        }
        if (gh) {
            pet.fetch(gh.x, gh.y, () => { if (this.ground.includes(gh))
                this.pickUp(gh, true); });
            return;
        }
        if (zov) {
            pet.jumpTo(zov.x, zov.y + 10, null, () => this.useZone(zov, true));
            return;
        }
        const e = hov?.enemy ? hov : null;
        if (!pet.jumpTo(e ? e.x : wx, e ? e.y : wy + 30, e, undefined, e ? undefined : (x, y) => this.map.blockedReal(x, y)) && !pet.busy)
            this.banner = { text: `${pet.name} cannot jump there`, t: 0 };
    }
    // ---- mines (B / MINE button) ----
    mineEntry() { return this.win.inv.entries.find(e => e.item.sec === 4 && (e.item.f['1'] ?? 0) === 1); }
    /** Mines are Mine items (section 4, id 1) of the inventory. GUESSES: arms after 0.6 s, a monster within 44 px or 8 s triggers it, blast radius 110 px, damage 60 + 6 per hero level. */
    layMine() {
        if (this.dead)
            return;
        const e = this.mineEntry();
        if (!e) {
            this.banner = { text: 'You have no mines', t: 0 };
            return;
        }
        this.win.inv.remove(e);
        const n = 1 + Math.max(0, Math.round(this.win.fx('mines'))); // Number of Mines line (GUESS: extra mines laid in one go, spread around the hero)
        for (let i = 0; i < n; i++) {
            const an = i * 2.4;
            this.mines.push({ x: this.player.x + (i ? Math.cos(an) * 36 : 0), y: this.player.y + 4 + (i ? Math.sin(an) * 22 : 0), t: 0 });
        }
    }
    updateMines(dt) {
        this.win.mineStock = this.win.inv.entries.filter(e => e.item.sec === 4 && (e.item.f['1'] ?? 0) === 1).length;
        for (const b of this.blasts)
            b.t += dt;
        this.blasts = this.blasts.filter(b => b.t < 450);
        this.mines = this.mines.filter(m => {
            m.t += dt;
            const trig = (m.t > 600 && this.actors.some(a => a.enemy && !a.gen && a.alive && Math.hypot(a.x - m.x, (a.y - m.y) * 1.6) < 44)) || m.t > 8000;
            if (!trig)
                return true;
            this.blasts.push({ x: m.x, y: m.y, t: 0 });
            audio.sfx(SFX.kill, 0.9);
            const pw = 60 + 6 * (this.hud.level - 1) + this.win.fx('mineFx');
            for (const a of this.actors)
                if (a.enemy && !a.gen && a.alive && Math.hypot(a.x - m.x, (a.y - m.y) * 1.6) < 110)
                    this.damage(a, Math.max(1, Math.round(pw * (9 + Math.floor(Math.random() * 3)) / 10)));
            return false;
        });
    }
    // ---- power-up (P / button) ----
    /** GUESSES: the button starts blinking after 12 s of fighting; the mode lasts 15 s: +25 % speed, +50 % melee damage, +30 % magic damage, +50 % Heal. */
    powerState() { return this.powerT > 0 ? 'on' : this.fightT >= 12000 ? 'ready' : 'off'; }
    activatePower() {
        if (this.powerState() !== 'ready') {
            if (this.powerT <= 0)
                this.banner = { text: 'Power is not ready yet', t: 0 };
            return;
        }
        this.powerT = 15000;
        this.fightT = 0;
        this.banner = { text: 'Power up!', t: 0 };
    }
    updatePower(dt) {
        if (this.powerT > 0) {
            this.powerT -= dt;
            if (this.powerT <= 0)
                this.banner = { text: 'Power returned to normal', t: 0 };
            return;
        }
        const p = this.player, near = !this.dead && this.actors.some(a => a.enemy && !a.gen && a.alive && Math.hypot(a.x - p.x, (a.y - p.y) * 1.6) < 380);
        this.fightT = near ? Math.min(12000, this.fightT + dt) : Math.max(0, this.fightT - dt * 0.5);
    }
    /** The Status / Magic / Map windows share the left half of the screen: opening one closes the others (and the mission list). */
    showLeft(w, keep = false) {
        const cur = this.win.status ? 'status' : this.win.magic ? 'magic' : this.mapwin.open ? 'map' : null, next = w === cur && !keep ? null : w;
        this.win.status = next === 'status';
        this.win.magic = next === 'magic';
        this.mapwin.open = this.win.mapOpen = next === 'map';
        if (next === 'map')
            this.mapwin.recenter();
        if (next && this.qlog)
            this.toggleQuestLog();
    }
    /** Right mouse button: cast the selected magic, or attack (F9 / empty slot) the enemy under the pointer. */
    /** Touch controls (touch.ts): the screen point attacks and spells are aimed at: the nearest living enemy within reach of the screen, else 70 px in front of the hero. */
    touchAim() {
        const p = this.player, sx = p.x - this.camX, sy = p.y - this.camY;
        const near = this.actors.filter(a => a.enemy && a.alive).map(a => [a, Math.hypot(a.x - p.x, (a.y - p.y) * 1.6)]).filter(([, d]) => d < 450).sort((a, b) => a[1] - b[1])[0];
        if (near)
            return [Math.max(0, Math.min(639, near[0].x - this.camX)), Math.max(0, Math.min(HUD_Y - 1, near[0].y - this.camY - 20))];
        for (let k = 0; k < 32; k++) {
            const ang = k * Math.PI / 16, vx = Math.cos(ang), vy = Math.sin(ang);
            if (actorDir(vx, vy) === p.dir)
                return [Math.max(0, Math.min(639, sx + vx * 70)), Math.max(0, Math.min(HUD_Y - 1, sy + vy * 70))];
        }
        return [sx, sy + 70];
    }
    rightAction() {
        const inp = this.app.input, m = this.magic, wx = inp.x + this.camX, wy = inp.y + this.camY, sp = m.selected();
        const hov = this.actors.find(a => a.enemy && a.alive && a.hit(wx, wy));
        if ((!sp || inp.down) && this.tripleOk() && this.tripleLeft <= 0 && this.tripleCd <= 0) { // manual: Warrior Triple Attack = right click with the sword icon (or left + right click)
            const p0 = this.player, t = hov ?? this.actors.filter(a => a.enemy && a.alive && Math.hypot(a.x - p0.x, (a.y - p0.y) * 1.6) < 90 * a.scale)[0];
            if (t) {
                this.target = t;
                this.tripleLeft = 3;
                this.tripleCd = 2500;
                this.atkT = 0;
                this.atkHit = false;
                p0.anim = 3;
                p0.t = 0;
                p0.dir = actorDir(t.x - p0.x, t.y - p0.y);
                return;
            }
        }
        if (!sp) {
            if (hov)
                this.target = hov;
            else if (m.sel < 8)
                this.banner = { text: 'No magic set for this slot', t: 0 };
            return;
        }
        if (this.castT > 0)
            return;
        if (sp.kind === 'none') {
            this.banner = { text: `${sp.name} cannot be cast`, t: 0 };
            return;
        }
        const h = this.hud, p = this.player, fx = SPELL_FX[sp.id], hm = this.harmony(), cost = Math.max(1, Math.round(m.cost(sp.id, this.win.fx('mlv')) * hm.mpCost * Math.max(0.1, 1 + this.win.fx('mcost') / 100)));
        if (h.mp < cost) {
            this.banner = { text: 'Not enough MP', t: 0 };
            return;
        }
        const tx = hov ? hov.x : wx, ty = hov ? hov.y : wy + 30, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
        const base = this.spellPower(sp), mult = this.powerKnown(sp) ? 1 : fx?.mult ?? 1; // spells with a Table 17 power use it directly; the others (Medusa, Mud Javelin, Explosion) keep a guessed multiple of the Fire Ball power
        const bullet = (ang, mult, extra = {}) => { const c = Math.cos(ang), sn = Math.sin(ang), vx = (dx / d) * c - (dy / d) * sn, vy = (dx / d) * sn + (dy / d) * c; this.shots.push({ x: p.x, y: p.y, vx, vy, t: 0, spell: sp, dmg: mult, hit: sp.kind === 'bolt' || sp.kind === 'fan' || sp.kind === 'strike' ? undefined : new Set(), ...extra }); };
        if (sp.kind === 'heal') {
            if (h.hp >= h.hpMax) {
                this.banner = { text: 'HP is already full', t: 0 };
                return;
            }
            const g = Math.min(h.hpMax - h.hp, Math.max(1, Math.round(h.hpMax * m.healPct(sp.id, this.win.fx('mlv')) * (this.powerT > 0 ? 1.5 : 1) / 100)));
            h.hp += g;
            this.floaters.push({ x: p.x, y: p.y - 90, t: 0, s: `+${g}` });
        }
        else if (sp.kind === 'identify') {
            if (!this.win.needsIdentify()) {
                this.banner = { text: 'Nothing to identify', t: 0 };
                return;
            }
            this.win.identifyAll();
            this.banner = { text: 'All items identified', t: 0 };
        }
        else if (sp.kind === 'moon') {
            if (!this.pet) {
                this.banner = { text: 'You have no companion', t: 0 };
                return;
            }
            if (!this.pet.dead && this.pet.hp >= this.pet.maxHp) {
                this.banner = { text: `${this.pet.name} is already fine`, t: 0 };
                return;
            }
            this.pet.feed(this.pet.maxHp);
            this.rings.push({ x: this.pet.x, y: this.pet.y, t: 0, r: 90, color: '#d8e8ff' });
        }
        else if (sp.kind === 'buff') {
            const k = fx.buff;
            this.buffs[k] = fx.dur ?? 30000;
            this.rings.push({ x: p.x, y: p.y, t: 0, r: 70, color: k === 'berserk' ? '#ff4030' : k === 'counter' ? '#ffc040' : '#60a0ff' });
            this.banner = { text: `${sp.name} is active`, t: 0 };
        }
        else if (sp.kind === 'nova' || sp.kind === 'petnova') {
            const cx = sp.kind === 'petnova' ? this.pet?.x : p.x, cy = sp.kind === 'petnova' ? this.pet?.y : p.y;
            if (cx === undefined || cy === undefined || (sp.kind === 'petnova' && (!this.pet || this.pet.dead))) {
                this.banner = { text: this.pet ? `${this.pet.name} cannot fight now` : 'You have no companion', t: 0 };
                return;
            }
            this.rings.push({ x: cx, y: cy, t: 0, r: fx.radius, color: sp.color || '#ff8040' });
            for (const a of this.actors)
                if (a.enemy && a.alive && Math.hypot(a.x - cx, (a.y - cy) * 1.6) < fx.radius * a.scale) {
                    this.spellHit(a, sp, base * mult);
                    if (fx.stun)
                        a.stun = Math.max(a.stun, fx.stun);
                }
        }
        else if (sp.kind === 'storm') {
            const near = this.actors.filter(a => a.enemy && a.alive && Math.hypot(a.x - p.x, (a.y - p.y) * 1.6) < fx.radius);
            for (let i = 0; i < fx.count; i++) {
                const a = near.length ? near[i % near.length] : undefined, x = a ? a.x : p.x + (Math.random() - 0.5) * 360, y = a ? a.y : p.y + (Math.random() - 0.5) * 220;
                this.strikes.push({ x, y, t: -i * 90 });
                if (a)
                    this.spellHit(a, sp, base * mult);
            }
        }
        else if (sp.kind === 'blade') {
            if (this.atkT < 0)
                p.dir = dirIndex(dx, dy);
            bullet(0, Math.max(1, (this.win.stats().atkMax || 10) * this.win.strength() / 100 * (this.magic.param(17, sp.id, this.magic.level(sp.id) + this.win.fx('mlv')) / 100 || fx.mult) * hm.dmg), { phys: true }); // Sonic Blade: Offensive Power x Reflection Rate (Table 17 %)
        }
        else if (sp.kind === 'fan') {
            if (this.atkT < 0)
                p.dir = dirIndex(dx, dy);
            for (let i = 0; i < fx.count; i++)
                bullet((i - (fx.count - 1) / 2) * fx.spread / (fx.count - 1), base * mult);
        }
        else { // bolt / pierce / strike: one projectile
            if (this.atkT < 0)
                p.dir = dirIndex(dx, dy);
            bullet(0, base * mult);
        }
        h.mp -= cost;
        this.castT = 400 * m.castMul(sp.id) * 100 / Math.max(20, 100 + this.win.fx('chant')); // Table 20 = cast time per mille (Earth Spears 0.6, Medusa 1.5) audio.sfx(SFX.hit, 0.5);
        if (m.use(sp.id))
            this.banner = { text: `${sp.name} reached magic level ${m.level(sp.id)}`, t: 0 };
    }
    /** Spell power = Table 17 of the spell at its (gear-raised) magic level + the gear's magic attack, x Holy attribute x power mode x harmony (exe 0x4399db: Table 17 value + player+0x1c4). Spells whose Table 17 entry is 0 or a different quantity (Mud Javelin 600+) fall back to the Fire Ball value. */
    /** Table 17 of a rate spell as a fraction (Magic Shield 25 %+, Counter Burst 50 %+). */
    spellRate(id) { return this.magic.param(17, id, this.magic.level(id) + this.win.fx('mlv')) / 100; }
    powerKnown(sp) { const v = this.magic.param(17, sp.id, 1); return v > 0 && v < 500 && sp.kind !== 'blade'; }
    spellPower(sp) { const lv = this.magic.level(sp.id) + this.win.fx('mlv'), t = this.powerKnown(sp) ? this.magic.param(17, sp.id, lv) : this.magic.param(17, 601, lv); return (t + this.win.fx('matk')) * this.win.attrMul(4) * (this.powerT > 0 ? 1.3 : 1) * this.harmony().magic; }
    /** Elemental effect on a monster: the attribute opposite to the monster's is strong (x1.3), its own attribute weak (x0.7). GUESS. */
    elemMul(a, elem) { if (elem < 0)
        return 1; const m = a.stats.attr ?? 0; return elem === (m ^ 1) ? 1.3 : elem === m ? 0.7 : 1; }
    spellHit(a, sp, dmg) { this.countHit(8); this.damage(a, Math.max(1, Math.round(dmg * this.elemMul(a, SPELL_FX[sp.id]?.elem ?? -1) * (9 + Math.floor(Math.random() * 3)) / 10))); }
    /** Both attributes of an opposite pair at the maximum trigger a special effect (manual: 'special effects can be triggered'; the effects themselves are not documented, so these are GUESSES). */
    harmony() {
        const w = this.win, on = [0, 2, 4, 6].map(i => w.attrLv(i) >= 10 && w.attrLv(i + 1) >= 10);
        return { dmg: on[0] ? 1.2 : 1, taken: on[0] ? 0.8 : 1, dodge: on[1] ? 0.1 : 0, magic: on[2] ? 1.2 : 1, magicTaken: on[2] ? 0.8 : 1, mpCost: on[3] ? 0.75 : 1, on };
    }
    tripleOk() { return this.win.career === 1 && this.hud.level >= TRIPLE_LEVEL && !this.rangedWeapon() && this.win.inv.equipped('weapon').length > 0; }
    rangedWeapon() { const w = this.win.inv.equipped('weapon').find(e => !Inventory.broken(e)); return !!w && ItemDb.isRanged(w.unid ? this.win.db.base(w.item) : w.item); }
    updateArrows(dt) {
        for (const a of this.arrows) {
            const dx = a.target.x - a.x, dy = a.target.y - a.y, d = Math.hypot(dx, dy * 1.6) || 1, st = 0.7 * dt;
            if (d <= st + 14 || !a.target.alive) {
                if (a.target.alive)
                    this.hurtEnemy(a.target);
                a.x = NaN;
            }
            else {
                a.x += dx / d * st;
                a.y += dy / d * st;
            }
        }
        this.arrows = this.arrows.filter(a => !Number.isNaN(a.x));
    }
    updateBullets(dt) {
        for (const b of this.bullets) {
            b.t += dt;
            b.x += b.vx * 0.2 * dt;
            b.y += b.vy * 0.2 * dt;
            if (!this.dead && Math.hypot(b.x - this.player.x, (b.y - this.player.y) * 1.6) < 24) {
                b.t = 9999;
                this.hitPlayer(b.dmg, true);
            }
            else if (this.map.blockedReal(b.x, b.y))
                b.t = 9999;
        }
        this.bullets = this.bullets.filter(b => b.t < 2500);
    }
    updateShots(dt) {
        if (this.castT > 0)
            this.castT -= dt;
        if (this.tripleCd > 0)
            this.tripleCd -= dt;
        {
            const gk = this.win.gear().map(e => e.item.name).join('|');
            if (gk !== this.gearKey) {
                this.gearKey = gk;
                this.applyStats(false);
            }
        } // gear with HP/MP bonuses
        {
            const hk = this.harmony().on.join();
            if (hk !== this.harmonyKey) {
                if (this.harmonyKey && this.harmony().on.some(Boolean))
                    this.banner = { text: 'Attribute harmony!', t: 0 };
                this.harmonyKey = hk;
            }
        }
        if ((this.regenT += dt) >= 1000 && !this.dead) { // Life / Mental Recovery lines: tenths of a percent of the maximum per second (exe format "%4d.%1d%%/s")
            this.regenT = 0;
            const hp = this.win.fx('lifeRec'), mp = this.win.fx('mpRec'), r = (v, max) => v ? (v > 0 ? Math.max(1, Math.round(max * v / 1000)) : Math.min(-1, Math.round(max * v / 1000))) : 0;
            this.hud.hp = Math.max(1, Math.min(this.hud.hpMax, this.hud.hp + r(hp, this.hud.hpMax)));
            this.hud.mp = Math.max(0, Math.min(this.hud.mpMax, this.hud.mp + r(mp, this.hud.mpMax)));
        }
        for (const k of ['berserk', 'eshield', 'mshield', 'counter'])
            if (this.buffs[k] > 0 && (this.buffs[k] -= dt) <= 0) {
                this.buffs[k] = 0;
                this.banner = { text: `${{ berserk: 'Berserker', eshield: 'Energy Shield', mshield: 'Magic Shield', counter: 'Counter Burst' }[k]} wore off`, t: 0 };
            }
        for (const r of this.rings)
            r.t += dt;
        this.rings = this.rings.filter(r => r.t < 500);
        for (const st of this.strikes)
            st.t += dt;
        this.strikes = this.strikes.filter(st => st.t < 260);
        for (const s of this.shots) {
            s.t += dt;
            s.x += s.vx * 0.5 * dt;
            s.y += s.vy * 0.5 * dt;
            const fx = SPELL_FX[s.spell.id];
            for (const a of this.actors) {
                if (!a.enemy || !a.alive || s.t >= 9999 || Math.hypot(a.x - s.x, (a.y - s.y) * 1.6) >= 36 * a.scale || s.hit?.has(a))
                    continue;
                s.hit?.add(a);
                if (s.phys)
                    this.damage(a, Math.max(1, Math.round(s.dmg * (9 + Math.floor(Math.random() * 3)) / 10)));
                else
                    this.spellHit(a, s.spell, s.dmg);
                if (fx?.stun && a.alive)
                    a.stun = Math.max(a.stun, fx.stun);
                if (fx?.boom) {
                    this.rings.push({ x: a.x, y: a.y, t: 0, r: fx.radius, color: '#ffffff' });
                    for (const o of this.actors)
                        if (o !== a && o.enemy && o.alive && Math.hypot(o.x - a.x, (o.y - a.y) * 1.6) < fx.radius * o.scale)
                            this.damage(o, Math.max(1, Math.round(s.dmg * fx.boom * (9 + Math.floor(Math.random() * 3)) / 10)));
                }
                if (!s.hit)
                    s.t = 9999;
            }
            if (this.map.blockedReal(s.x, s.y))
                s.t = 9999;
        }
        this.shots = this.shots.filter(s => s.t < 1100);
    }
    blocked(x, y) {
        return this.map.blockedReal(x, y) || this.actors.some(a => a.solid && Math.hypot(a.x - x, (a.y - y) * 1.6) < a.radius);
    }
    update(dt) {
        if (this.app.input.pressed.has('f12'))
            audio.toggleMute();
        if (this.paused) { // Game Menu open: it owns the keyboard and the mouse
            const act = this.menu.update(dt, this.app.input.x, this.app.input.y, this.app.input.clicked, this.app.input.pressed.has('escape'));
            if (act === 'close')
                this.paused = false;
            else if (act === 'missions') {
                this.paused = false;
                if (!this.qlog)
                    this.toggleQuestLog();
            }
            else if (act === 'map') {
                this.paused = false;
                if (!this.mapwin.open)
                    this.showLeft('map');
            }
            else if (act === 'title' || act === 'exit') {
                this.save();
                this.leaving = true;
                TitleScene.create(this.app).then(t => this.app.go(t));
            }
            return;
        }
        this.dev();
        this.checkZones();
        if (this.warpMenu && !this.dlg) {
            this.warpMenu = false;
            this.showWarpMenu();
        }
        if (this.statusReq !== null && !this.dlg) {
            const i = this.statusReq;
            this.statusReq = null;
            this.showDogStatus(i);
        }
        if ((this.saveT += dt) > 10000 && !this.dead && !this.leaving) {
            this.saveT = 0;
            this.save();
        }
        for (const a of this.actors)
            a.update(dt, this.actorCtx);
        if (this.pet) {
            this.pet.heroLevel = this.hud.level;
            {
                const f = (k) => this.win.fx(k);
                this.pet.gear = { hp: Math.round(f('cHp')), atk: f('cAtk'), def: Math.round(f('cDef')), hit: f('cHit'), eva: f('cEva'), matk: f('cMatk'), mhit: f('cMhit'), mdef: f('cMdef'), meva: f('cMeva') };
            }
            this.pet.update(dt, this.petCtx);
        }
        this.updateMines(dt);
        for (const a of this.actors)
            if (a.slot && a.state === 'die' && a.deadT > 3000)
                a.hidden = true;
        this.actors = this.actors.filter(a => !(a.enemy && !a.slot && a.state === 'die' && a.deadT > 6000));
        for (const f of this.floaters)
            f.t += dt;
        this.floaters = this.floaters.filter(f => f.t < 900);
        if (this.banner && (this.banner.t += dt) > 5000)
            this.banner = null;
        const inp = this.app.input, keys = inp.keys, p = this.player, hud = this.hud;
        if (!this.paused && inp.pressed.has('g'))
            this.debug = !this.debug;
        if (inp.pressed.has('r'))
            hud.running = !hud.running;
        if (inp.pressed.has('s') || inp.pressed.has('c'))
            this.showLeft('status');
        if (inp.pressed.has('m'))
            this.showLeft('magic');
        if (inp.pressed.has('n'))
            this.showLeft('map');
        for (let k = 0; k < 9; k++)
            if (inp.pressed.has(`f${k + 1}`))
                this.magic.sel = k;
        if (!this.dlg && !this.shop && !this.dead) {
            if (inp.pressed.has('b'))
                this.layMine();
            if (inp.pressed.has('p'))
                this.activatePower();
            if (inp.pressed.has(' '))
                this.togglePetMode();
        }
        if (!this.dead)
            this.updatePower(dt);
        this.mapwin.reveal(this.scenario, this.map, p.x, p.y);
        this.mapwin.update(dt, keys, inp.pressed);
        this.updateShots(dt);
        this.updateBullets(dt);
        this.updateArrows(dt);
        this.refreshCareer();
        for (const e of this.fxList)
            e.t += dt;
        this.fxList = this.fxList.filter(e => e.t < fxLife(e.fx));
        if (inp.pressed.has('i'))
            this.win.item = !this.win.item;
        if (inp.pressed.has('q'))
            this.toggleQuestLog();
        if (inp.pressed.has('h')) {
            this.menu.open('help');
            this.paused = true;
            return;
        }
        for (let k = 0; k < 8; k++)
            if (inp.pressed.has(String(k + 1))) {
                const e = this.belt()[k];
                if (e)
                    this.useItem(e);
            }
        if (inp.rclicked && keys.has('tab') && this.pet && !this.dead && !this.dlg && !this.shop && inp.y < HUD_Y) {
            this.pet.dash(inp.x + this.camX - this.pet.x, inp.y + this.camY + 30 - this.pet.y);
        }
        else if (inp.rclicked) { // right click: belt slot, or a consumable in the item window
            const k = BELT.findIndex(r => inp.x >= r.x && inp.x < r.x + r.w && inp.y >= r.y && inp.y < r.y + r.h), e = k >= 0 ? this.belt()[k] : this.win.entryAt(inp.x, inp.y);
            if (e)
                this.useItem(e);
            else if (inp.y < HUD_Y && !this.win.overUI(inp.x, inp.y) && !this.dead && !this.dlg && !this.shop)
                this.rightAction();
        }
        if (inp.pressed.has('escape') && this.qlog)
            this.toggleQuestLog();
        else if (inp.pressed.has('escape')) {
            if (this.win.status || this.win.item || this.win.magic || this.mapwin.open)
                this.win.status = this.win.item = this.win.magic = this.mapwin.open = this.win.mapOpen = false;
            else {
                this.menu.open('main');
                this.paused = true;
                return;
            }
        }
        if (inp.pressed.has('shift+capslock') || inp.pressed.has('capslock'))
            this.win.inv.switchSet(); // manual: CapsLock swaps the two equipment sets
        if (inp.clicked) {
            const b = this.gui.button(inp.x, inp.y);
            const bk = this.magic.barHit(inp.x, inp.y);
            if (bk >= 0)
                this.magic.sel = bk;
            else if (inBox(MINE_BTN, inp.x, inp.y))
                this.layMine();
            else if (inBox(POWER_BTN, inp.x, inp.y))
                this.activatePower();
            else if (this.pet && inBox(PET_GAUGE, inp.x, inp.y))
                this.togglePetMode();
            else if ((this.win.status || this.win.magic) && inp.x < 320 && inp.y >= 4 && inp.y < 36 && inp.x >= 40 && inp.x < 280)
                this.showLeft(inp.x < 165 ? 'status' : 'magic', true);
            else if (this.win.magic && inp.x < 320 && inp.y < 416)
                this.magic.click(inp.x, inp.y);
            else if (this.qlog && inp.x < 320 && inp.y < 416)
                this.qlogClick(inp.x, inp.y);
            else if (this.win.status && this.win.careerMenu && this.win.careerPick(inp.x, inp.y) >= 0) {
                this.win.career = this.win.careerOpts[this.win.careerPick(inp.x, inp.y)];
                this.win.careerMenu = false;
                this.applyStats(false);
                this.refreshCareer();
                this.banner = { text: `Career changed: ${['Mercenary', 'Warrior', 'Wizard', 'Hunter'][this.win.career]}`, t: 0 };
            }
            else if (this.win.status && this.win.careerOpts.length && inBox(CAREER_BTN, inp.x, inp.y))
                this.win.careerMenu = !this.win.careerMenu;
            else if (this.win.item && !this.shop && SET_BTN.some((r, i) => inBox(r, inp.x, inp.y) && (this.win.inv.switchSet(i), true))) { /* Change Equipment I / II */ }
            else if (!this.shop && this.win.entryAt(inp.x, inp.y))
                this.win.inv.toggleEquip(this.win.entryAt(inp.x, inp.y));
            else if (b === 'status')
                this.showLeft('status');
            else if (b === 'item')
                this.win.item = !this.win.item;
            else if (b === 'menu') {
                this.menu.open('main');
                this.paused = true;
                return;
            }
        }
        if (this.dead) {
            this.player.t += dt;
            if (inp.clicked && this.player.t > 800) {
                this.dead = false;
                Object.assign(this.player, { x: this.spawnPos.x, y: this.spawnPos.y, anim: ANIM_IDLE, t: 0 });
                this.hud.hp = this.hud.hpMax;
            }
            return;
        }
        if (this.bj) {
            const k = ['h', 's', 'enter', ' '].find(k => inp.pressed.has(k));
            if ((inp.clicked && this.bj.click(inp.x, inp.y)) || (k && this.bj.key(k))) {
                const r = this.bj.result;
                this.bj = null;
                this.vm?.finishBlackjack(r);
                this.openDialog();
            }
            return;
        }
        if (this.shop) {
            if (inp.pressed.has('escape') || (inp.clicked && (this.shop.over(inp.x, inp.y) ? this.shop.click(inp.x, inp.y, this.win) : (this.shop.sell(inp.x, inp.y, this.win), false))))
                this.closeShop();
            return;
        }
        if (this.dlg) {
            this.updateDialog();
            return;
        }
        if ((this.musicT += dt) > 500) {
            this.musicT = 0;
            const near = this.actors.some(a => a.rec.boss !== undefined && a.alive && Math.hypot(a.x - this.player.x, (a.y - this.player.y) * 1.6) < 500);
            audio.bgm(near ? 'bgm3' : this.musicFor(this.scenario));
        }
        // status-5 polls run at the script tick rate (~30 Hz): scripts count ticks in their variables (e.g. 180 ticks before a trap room spawns)
        if (this.vm && (this.pollT += dt) > 33) {
            this.pollT = 0;
            this.vm.poll();
            if (this.vm.pending)
                this.openDialog();
        }
        const hov = inp.y < HUD_Y && !this.win.overUI(inp.x, inp.y) ? this.actors.find(a => a.hit(inp.x + this.camX, inp.y + this.camY)) : undefined;
        const gh = !hov && inp.y < HUD_Y && !this.win.overUI(inp.x, inp.y) ? this.groundAt(inp.x + this.camX, inp.y + this.camY) : undefined;
        const zov = !hov && !gh && inp.y < HUD_Y && !this.win.overUI(inp.x, inp.y) ? this.zones.find(z => z.hit(inp.x + this.camX, inp.y + this.camY)) : undefined;
        const gz = zov && zov.rec.type === 5 && inp.down && !this.dead && Math.hypot(zov.x - p.x, (zov.y - p.y) * 1.6) < 450 ? zov : null;
        this.holdZone = gz;
        this.holdT = gz ? this.holdT + dt : 0;
        const tab = keys.has('tab') && !!this.pet;
        if (tab && inp.clicked && inp.y < HUD_Y && !this.win.overUI(inp.x, inp.y))
            this.petCommand(inp.x + this.camX, inp.y + this.camY, hov, gh, zov);
        else if (tab && inp.down) { /* TAB held: the mouse commands the dog, the hero stays */ }
        else if (hov?.enemy && (inp.clicked || inp.down))
            this.target = hov;
        else if (inp.clicked && hov)
            this.talkTo(hov);
        else if (inp.clicked && gh)
            this.pickUp(gh);
        else if (inp.clicked && zov)
            this.useZone(zov);
        else if (inp.clicked)
            this.target = null;
        // Shift + mouse button = attack in place (manual): no walking, swing at the nearest enemy in reach or at thin air
        const standing = keys.has('shift') && inp.down && !tab && !this.dead && inp.y < HUD_Y && !this.win.overUI(inp.x, inp.y) && !this.gui.button(inp.x, inp.y);
        if (standing) {
            const rr = this.rangedWeapon() ? 420 : 58, near = hov?.enemy ? hov : this.actors.filter(a => a.enemy && a.alive).sort((a, b) => Math.hypot(a.x - p.x, (a.y - p.y) * 1.6) - Math.hypot(b.x - p.x, (b.y - p.y) * 1.6))[0];
            this.target = near && Math.hypot(near.x - p.x, (near.y - p.y) * 1.6) <= rr * near.scale ? near : null;
        }
        if (this.target && !this.target.alive)
            this.target = null;
        let dx = 0, dy = 0;
        const ar = !this.mapwin.open; // with the map open the arrow keys scroll it
        if (keys.has('a') || (ar && keys.has('arrowleft')))
            dx--;
        if (keys.has('d') || (ar && keys.has('arrowright')))
            dx++;
        if (keys.has('w') || (ar && keys.has('arrowup')))
            dy--;
        if (keys.has('s') || (ar && keys.has('arrowdown')))
            dy++;
        let vx = dx, vy = dy;
        if (!dx && !dy && inp.down && !standing && !tab && !hov && !gh && !gz && inp.y < HUD_Y && !this.win.overUI(inp.x, inp.y) && !this.gui.button(inp.x, inp.y)) {
            // walk towards the mouse pointer (screen space, relative to the player)
            const mx = inp.x - (p.x - this.camX), my = inp.y - (p.y - this.camY), d = Math.hypot(mx, my);
            if (d > 6) {
                vx = mx / d;
                vy = my / d;
            }
        }
        const atk = this.atkT >= 0;
        if (!dx && !dy && this.target) {
            const tx = this.target.x - p.x, ty = this.target.y - p.y, td = Math.hypot(tx, ty * 1.6), tl = Math.hypot(tx, ty) || 1;
            if (!atk)
                p.dir = actorDir(tx, ty);
            const reach = this.rangedWeapon() ? 420 : 58 * (this.target?.scale ?? 1); // bow guns / slings shoot from a distance (manual: keep the button pressed to keep shooting)
            if (td > reach && !atk) {
                vx = tx / tl;
                vy = ty / tl;
            }
            else {
                vx = vy = 0;
                if (!atk) {
                    this.atkT = 0;
                    this.atkHit = false;
                    p.anim = 3;
                    p.t = 0;
                }
            }
        }
        else if (standing && !dx && !dy) {
            if (!atk) {
                p.dir = actorDir(inp.x - (p.x - this.camX), inp.y - (p.y - this.camY));
                this.atkT = 0;
                this.atkHit = false;
                p.anim = 3;
                p.t = 0;
            }
        }
        else if (dx || dy)
            this.target = null;
        if (this.atkT >= 0) {
            vx = vy = 0;
        }
        if (vx || vy) {
            const run = keys.has('shift') || keys.has('control') || hud.running, n = Math.hypot(vx, vy), sp = (run ? 0.30 : 0.16) * dt * (this.powerT > 0 ? 1.25 : 1) * (1 + this.win.walkBonus() / 100);
            p.dir = dirIndex(vx, vy);
            const nx = p.x + vx / n * sp, ny = p.y + vy / n * sp;
            // slide along obstacles: try both axes, then each alone
            if (!this.blocked(nx, ny)) {
                p.x = nx;
                p.y = ny;
            }
            else if (!this.blocked(nx, p.y))
                p.x = nx;
            else if (!this.blocked(p.x, ny))
                p.y = ny;
            const na = run ? ANIM_RUN : ANIM_WALK;
            if (na !== p.anim) {
                p.anim = na;
                p.t = 0;
            }
        }
        else if (this.atkT < 0 && p.anim !== ANIM_IDLE) {
            p.anim = ANIM_IDLE;
            p.t = 0;
        }
        p.t += dt;
        if (this.atkT >= 0) {
            const fr = this.caf.anims[3].dirs[p.dir].frames || 11, dur = fr * FRAME_MS * 100 / Math.max(30, this.win.stats().speed * (this.buffs.berserk > 0 ? 1.2 : 1));
            if (!this.atkHit && p.t >= dur * 0.45) {
                this.atkHit = true;
                if (this.target?.alive) {
                    {
                        const w = this.win.inv.equipped('weapon')[0], ar = w ? ItemDb.arms(w.item) : 0;
                        audio.sfx(this.rangedWeapon() ? SFX.swingBow : ar === 1 || ar === 3 ? SFX.swingHeavy : SFX.swingLight, 0.6);
                    }
                    if (this.rangedWeapon())
                        this.arrows.push({ x: p.x, y: p.y - 4, target: this.target });
                    else
                        this.hurtEnemy(this.target);
                }
            }
            if (p.t >= dur) {
                if (this.tripleLeft > 0 && --this.tripleLeft > 0 && this.target?.alive) {
                    this.atkHit = false;
                    p.t = 0;
                }
                else {
                    this.tripleLeft = 0;
                    this.atkT = -1;
                    p.anim = ANIM_IDLE;
                    p.t = 0;
                }
            }
        }
    }
    draw(ctx) {
        const p = this.player, map = this.map, inp = this.app.input;
        this.camX = Math.round(Math.max(0, Math.min(map.realW - SCREEN_W, p.x - SCREEN_W / 2)));
        this.camY = Math.round(Math.max(0, Math.min(map.realH - HUD_Y, p.y - HUD_Y / 2)));
        const gd = this.ground.map(g => ({ y: g.y, draw: (c, cx, cy) => {
                c.fillStyle = 'rgba(0,0,0,0.35)';
                c.beginPath();
                c.ellipse(g.x - cx, g.y - cy, 14, 7, 0, 0, 7);
                c.fill();
                if (g.item)
                    this.win.drawIcon(c, g.item, g.x - cx, g.y - cy - 10, 0.5);
                else
                    this.text.drawCenter(c, `${g.gold}G`, g.x - cx, g.y - cy - 14);
            } }));
        map.draw(ctx, this.camX, this.camY, SCREEN_W, HUD_Y, [this.drawPlayer, ...(this.pet ? [this.pet] : []), ...this.actors, ...this.zones.filter(z => z.drawn), ...gd]);
        for (const m of this.mines) { // laid mines: dark disc with a blinking red light
            const x = m.x - this.camX, y = m.y - this.camY;
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.beginPath();
            ctx.ellipse(x, y, 11, 6, 0, 0, 7);
            ctx.fill();
            ctx.fillStyle = '#3a3a3a';
            ctx.beginPath();
            ctx.ellipse(x, y - 2, 8, 4, 0, 0, 7);
            ctx.fill();
            if (Math.floor(m.t / 250) % 2 === 0) {
                ctx.fillStyle = '#ff3030';
                ctx.fillRect(Math.round(x) - 1, Math.round(y) - 4, 3, 3);
            }
        }
        for (const b of this.blasts) { // mine explosions
            const x = b.x - this.camX, y = b.y - this.camY - 10, r = 20 + b.t / 450 * 100, g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, 'rgba(255,240,160,0.9)');
            g.addColorStop(0.5, 'rgba(255,120,30,0.6)');
            g.addColorStop(1, 'rgba(120,20,0,0)');
            ctx.globalAlpha = 1 - b.t / 450;
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(x, y, r, r * 0.62, 0, 0, 7);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        if (this.dark && settings.darkness)
            this.dark.draw(ctx, p.x - this.camX, p.y - this.camY - 30);
        for (const s of this.shots) { // bolts: glowing orb with a short trail
            for (let k = 3; k >= 0; k--) {
                const x = s.x - s.vx * k * 9 - this.camX, y = s.y - s.vy * k * 9 - this.camY - 36, r = 8 - k * 1.5, g = ctx.createRadialGradient(x, y, 0, x, y, r + 3);
                g.addColorStop(0, '#fff');
                g.addColorStop(0.45, s.spell.color);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.globalAlpha = 1 - k * 0.22;
                ctx.beginPath();
                ctx.arc(x, y, r + 3, 0, 7);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
        for (const b of this.bullets) { // trap bolts: orange orb with a trail
            for (let k = 3; k >= 0; k--) {
                const x = b.x - b.vx * k * 8 - this.camX, y = b.y - b.vy * k * 8 - this.camY - 36, r = 6 - k, g = ctx.createRadialGradient(x, y, 0, x, y, r + 3);
                g.addColorStop(0, '#ffe8a0');
                g.addColorStop(0.5, '#ff7020');
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.globalAlpha = 1 - k * 0.22;
                ctx.beginPath();
                ctx.arc(x, y, r + 3, 0, 7);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
        for (const r of this.rings) { // spell rings: an expanding translucent ellipse
            const k = Math.min(1, r.t / 350), x = r.x - this.camX, y = r.y - this.camY - 10, rr = r.r * (0.25 + 0.75 * k);
            ctx.globalAlpha = 0.7 * (1 - r.t / 500);
            ctx.strokeStyle = r.color;
            ctx.lineWidth = 4;
            ctx.fillStyle = r.color;
            ctx.beginPath();
            ctx.ellipse(x, y, rr, rr * 0.62, 0, 0, 7);
            ctx.globalAlpha *= 0.35;
            ctx.fill();
            ctx.globalAlpha = 0.7 * (1 - r.t / 500);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.lineWidth = 1;
        }
        for (const st of this.strikes) { // lightning: a jagged bolt from the sky
            if (st.t < 0)
                continue;
            const x = st.x - this.camX, y = st.y - this.camY;
            ctx.strokeStyle = st.t < 130 ? '#ffffff' : '#fff070';
            ctx.lineWidth = 3;
            ctx.globalAlpha = 1 - st.t / 260;
            ctx.beginPath();
            ctx.moveTo(x, y - 300);
            for (let k = 1; k <= 6; k++)
                ctx.lineTo(x + (((k * 37 + Math.round(st.x)) % 23) - 11) * (k < 6 ? 1 : 0), y - 300 + k * 50);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.lineWidth = 1;
        }
        for (const e of this.fxList)
            drawFx(ctx, e, this.camX, this.camY);
        for (const a of this.arrows) {
            ctx.strokeStyle = '#f0e0a0';
            ctx.lineWidth = 2;
            ctx.beginPath();
            const ax = a.x - this.camX, ay = a.y - this.camY - 36, vx = a.target.x - a.x, vy = a.target.y - a.y, n = Math.hypot(vx, vy) || 1;
            ctx.moveTo(ax - vx / n * 10, ay - vy / n * 6);
            ctx.lineTo(ax, ay);
            ctx.stroke();
        }
        if (this.holdZone) {
            const left = Math.max(0, Math.ceil((90 - this.holdT * 0.03) / 30));
            this.text.drawCenter(ctx, String(left), Math.round(this.holdZone.x - this.camX), Math.round(this.holdZone.y - this.camY - 110));
        } // Brain Globe countdown (90 script polls = 3 s)
        for (const f of this.floaters)
            this.text.drawCenter(ctx, f.s, Math.round(f.x - this.camX), Math.round(f.y - this.camY - f.t / 25));
        {
            let by = 52;
            for (const [k, n] of [['berserk', 'Berserker'], ['eshield', 'Energy Shield'], ['mshield', 'Magic Shield'], ['counter', 'Counter Burst']])
                if (this.buffs[k] > 0) {
                    this.text.drawCenter(ctx, `${n} ${Math.ceil(this.buffs[k] / 1000)}s`, 320, by);
                    by += 14;
                }
        }
        if (this.banner) {
            const w = this.banner.text.length * 6 + 24;
            ctx.fillStyle = 'rgba(8,8,24,0.85)';
            ctx.fillRect(320 - w / 2, 20, w, 24);
            ctx.strokeStyle = '#a89868';
            ctx.strokeRect(320 - w / 2 + 0.5, 20.5, w - 1, 23);
            this.text.drawCenter(ctx, this.banner.text, 320, 26);
        }
        if (this.debug) {
            map.drawJudge(ctx, this.camX, this.camY, SCREEN_W, HUD_Y);
            this.text.draw(ctx, `${Math.round(p.x)},${Math.round(p.y)}`, 4, 2);
        }
        const hov = inp.y < HUD_Y ? this.actors.find(a => a.hit(inp.x + this.camX, inp.y + this.camY)) : undefined;
        if (this.pet && inp.y < HUD_Y && this.pet.hit(inp.x + this.camX, inp.y + this.camY))
            this.text.drawCenter(ctx, `${this.pet.name} Lv.${this.pet.level}`, Math.round(this.pet.x - this.camX), Math.round(this.pet.y - this.camY - 60));
        const gh = !hov && inp.y < HUD_Y ? this.groundAt(inp.x + this.camX, inp.y + this.camY) : undefined;
        if (gh)
            this.text.drawCenter(ctx, gh.item ? gh.item.name : `${gh.gold} Gold`, Math.round(gh.x - this.camX), Math.round(gh.y - this.camY - 30));
        if (hov)
            this.text.drawCenter(ctx, hov.name, Math.round(hov.x - this.camX), Math.round(hov.y - this.camY - 84));
        ctx.fillStyle = '#000';
        ctx.fillRect(0, HUD_Y, SCREEN_W, SCREEN_H - HUD_Y);
        this.win.draw(ctx, this.hud, this.name, inp.x, inp.y);
        if (this.win.magic)
            this.magic.draw(ctx, this.text, inp.x, inp.y);
        if (this.mapwin.open)
            this.mapwin.draw(ctx, this.text, this.scenario, this.map, this.areaName(), p.x, p.y);
        this.gui.draw(ctx, this.hud);
        this.gui.power(ctx, this.powerState(), performance.now());
        if (this.pet)
            this.gui.partner(ctx, this.pet.hp / this.pet.maxHp, this.pet.mode === 'active');
        this.magic.drawBar(ctx, this.text, inp.x, inp.y);
        this.belt().forEach((e, k) => this.win.drawIcon(ctx, e.item, BELT[k].x + BELT[k].w / 2, BELT[k].y + BELT[k].h / 2, 0.7));
        this.shop?.draw(ctx, this.text, this.win, inp.x, inp.y);
        this.bj?.draw(ctx, this.text);
        if (this.qlog)
            this.drawQuestLog(ctx);
        if (this.dlg)
            this.drawDialog(ctx);
        if (this.dead) {
            ctx.fillStyle = 'rgba(80,0,0,0.45)';
            ctx.fillRect(0, 0, SCREEN_W, HUD_Y);
            this.text.drawCenter(ctx, 'YOU DIED', 320, 190);
            this.text.drawCenter(ctx, '(click to continue)', 320, 215);
        }
        if (this.paused)
            this.menu.draw(ctx, inp.x, inp.y);
        this.gui.cursor(ctx, inp.x, inp.y, inp.down);
    }
}
//# sourceMappingURL=game.js.map