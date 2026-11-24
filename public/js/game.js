import { loadCaf } from './caf.js';
import { GameMap, worldToReal, realToWorld } from './map.js';
import { audio } from './audio.js';
import { Shop, shopStock, sellPrice } from './shop.js';
import { loadScenarioActors, dirIndex as actorDir } from './actors.js';
import { ScriptVM } from './script.js';
import { Gui, SCREEN_W, SCREEN_H, HUD_Y } from './gui.js';
import { Text } from './app.js';
import { Windows } from './windows.js';
import { ItemDb } from './items.js';
import { TitleScene } from './title.js';
const q = new URLSearchParams(location.search);
const SCENARIO = q.get('scenario') ?? '00000000';
/** Script state kept per scenario so quests are not replayed when re-entering a map. */
const savedVars = new Map();
let savedGlobals = new Map();
const savedGround = new Map();
/** Zone ids whose visibility differs from the Mct default (opened chests ...), per scenario. */
/** PLACEHOLDER combat sound ids (indices into Voice00.Voc; script-driven sounds use the real ids, e.g. chest 77/78, Black Hammer's taunts 40-43). */
const SFX = { hit: 1, hurt: 2, kill: 10 };
const savedZones = new Map();
const SAVE_KEY = 'shadowflare_save_v1';
export function readSave() { try {
    const t = localStorage.getItem(SAVE_KEY);
    return t ? JSON.parse(t) : null;
}
catch {
    return null;
} }
/** CAF layers drawn for the player: 1 = shadow-ish base, 0 = body, 3.. = equipment variants (mapping still unknown). */
const LAYERS = (q.get('layers') ?? '1,0,3').split(',').map(Number);
const FRAME_MS = 60;
const ANIM_IDLE = 0, ANIM_WALK = 1, ANIM_RUN = 2;
/** Facing index (CAF direction order, guessed) for 8 compass sectors starting at "right" going clockwise on screen. */
const FACING = [6, 7, 0, 1, 2, 3, 4, 5];
const dirIndex = (vx, vy) => FACING[(Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) + 8) % 8];
export class GameScene {
    /** Remember per-scenario script flags and ground items (used for transitions and saving). */
    stash() {
        if (this.vm) {
            savedVars.set(this.scenario, this.vm.vars);
            savedGlobals = this.vm.globals;
        }
        savedZones.set(this.scenario, Object.fromEntries(this.zones.filter(z => z.visible !== (z.rec.vis !== 0)).map(z => [z.rec.id, z.visible])));
        savedGround.set(this.scenario, this.ground.map(o => ({ x: o.x, y: o.y, sec: o.item?.sec ?? 0, idx: o.item?.idx ?? 0, gold: o.gold })));
    }
    save() {
        this.stash();
        const d = {
            v: 1, name: this.name, gender: this.gender, scenario: this.scenario, x: this.player.x, y: this.player.y, hud: this.hud, totalExp: this.totalExp, gold: this.win.gold,
            inv: this.win.inv.entries.map(e => [e.item.sec, e.item.idx, e.x, e.y, e.eq ? 1 : 0]),
            vars: Object.fromEntries([...savedVars].map(([k, v]) => [k, [...v]])), globals: [...savedGlobals], ground: Object.fromEntries(savedGround), zones: Object.fromEntries(savedZones),
        };
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(d));
        }
        catch (e) {
            console.warn('save failed', e);
        }
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
        const ok = await fetch(`data/ep1/scenario/${id}.script.json`, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
        if (!ok) {
            this.banner = { text: 'This area is not available', t: 0 };
            return;
        }
        this.target = null;
        this.travel(id, entry);
    }
    /** Walkable real-pixel point nearest to the centre of exit zone `entry`. */
    entryPoint(entry) {
        const z = this.zones.find(z => z.rec.id === 10000000 + entry);
        if (!z)
            return null;
        const r = z.rec.rect, [cx, cy] = worldToReal(z.rec.a + (r[0] + r[2]) / 2, z.rec.b + (r[1] + r[3]) / 2);
        for (let rad = 0; rad < 1500; rad += 8)
            for (let k = 0; k < Math.max(1, rad / 4); k++) {
                const an = k / Math.max(1, rad / 4) * Math.PI * 2, x = cx + Math.cos(an) * rad, y = cy + Math.sin(an) * rad * 0.6;
                if (!this.map.blockedReal(x, y))
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
    pickUp(g) {
        if (Math.hypot(g.x - this.player.x, (g.y - this.player.y) * 1.6) > 140)
            return;
        if (g.item) {
            if (!this.win.inv.add(g.item))
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
    openShop(index) {
        this.qlog = null;
        this.shop = new Shop(shopStock(this.win.db, index, this.tables));
        this.dlg = null;
        this.win.item = true;
        this.win.sellValue = sellPrice;
        this.win.panel = (x, y) => !!this.shop?.over(x, y);
    }
    closeShop() { this.shop = null; this.win.sellValue = null; this.win.panel = null; }
    /** Click a scripted object (chest, barrel...): runs its status-0 block when the player is close enough. */
    useZone(z) {
        if (!this.vm || Math.hypot(z.x - this.player.x, (z.y - this.player.y) * 1.6) > 200)
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
            const item = r[0] !== -1 ? this.win.db.find(r[0], r[3]) : this.windowItem(r[1], r[2], code);
            if (!item)
                continue;
            if (item.sec === 4 && (item.f['1'] ?? 0) >= 99000000 && this.hasQuestItem(item))
                continue; // quest items drop until you hold one / the quest is done
            this.ground.push({ x: x + (n ? (Math.random() - .5) * 40 : 0), y, item, gold: 0 });
        }
    }
    hasQuestItem(it) {
        const id = it.f['1'] ?? 0, quest = id === 99000000 ? 1 : id === 99000001 ? 2 : 0;
        return this.win.inv.entries.some(e => e.item.sec === 4 && (e.item.f['1'] ?? 0) === id) || (quest > 0 && this.vm?.globals.get(`q:${quest}`) === 2);
    }
    /** Random weapon/armor/accessory with power in [min, max] (field 36 for weapons/armor, 25 for accessories), weighted by field 4; the list is picked by its total weight. */
    windowItem(max, min, code) {
        const ok = [true, Math.floor(code / 10) % 10 !== 0, Math.floor(code / 100) % 10 !== 0], g0 = code % 10 !== 0;
        const lists = [0, 1, 2].map(sec => this.win.db.sections[sec].filter(i => {
            const g = i.f['2'] ?? 0, grade = g === 0 ? g0 : g === 3 ? true : ok[g], v = i.f[sec === 2 ? '25' : '36'];
            return grade && v !== undefined && (max < 0 || v <= max) && (min < 0 || v >= min);
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
        if (!this.vm || a.rec.kind !== 'people')
            return;
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
        this.debug = false;
        this.paused = false;
        this.camX = 0;
        this.camY = 0;
        /** Quest titles (Table.Tbd table 41) and the banner shown when a quest changes state. */
        this.titles = [];
        this.banner = null;
        this.partner = -1;
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
        /** Map exits: Mct zone records 10000000+n fire status 3 when the player walks into their rect; the script block runs sentence 17 (destination scenario index, entry zone number). */
        this.inside = new Set();
        this.enterIds = new Set();
        /** Warp gates (sentences 37/38, Table.Tbd 40 = list of gates: name + scenario index). Opened gates are kept in the script globals as `w:<scenario index>`; the town gate starts open. */
        this.warpMenu = false;
        this.dlgPick = null;
        /** Items lying on the ground (real-pixel coordinates). gold > 0 for gold piles. */
        this.ground = [];
        this.groundDraw = { get y() { return 0; }, draw: () => { } };
        /** Open message window: text lines and clickable ~option~ regions (line, col0, col1). */
        this.dlg = null;
        /** Quest log (Q): lists quests set by sentence 62 (state 1 accepted, 2 done); text from Table.Tbd 41 (titles) and 700+q (description lines). */
        this.qlog = null;
        this.shop = null;
        const mk = map.markerReal();
        this.player = { x: +(q.get('x') ?? mk?.[0] ?? 3600), y: +(q.get('y') ?? mk?.[1] ?? 8100), dir: 0, t: 0, anim: ANIM_IDLE };
        const p = this.player;
        this.spawnPos = { x: p.x, y: p.y };
        this.actorCtx = { get px() { return p.x; }, get py() { return p.y; }, blocked: (x, y) => this.map.blockedReal(x, y), hitPlayer: d => this.hitPlayer(d) };
        this.drawPlayer = {
            get y() { return p.y; },
            draw: (c, camX, camY) => {
                const d = this.caf.anims[p.anim].dirs[p.dir];
                const raw = Math.max(0, Math.floor(p.t / FRAME_MS)), fi = d.frames ? (p.anim === 23 ? Math.min(raw, d.frames - 1) : raw % d.frames) : 0;
                for (const l of LAYERS) {
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
                partner: () => this.partner,
                gold: () => this.win.gold, addGold: d => { this.win.gold = Math.max(0, this.win.gold + d); },
                openShop: i => this.openShop(i),
                exit: (idx, entry) => { void this.exit(idx, entry); },
                warp: cmd => this.warp(cmd),
                entity: spawn => { const a = this.actors.find(a => a.enemy && a.rec.id === spawn); return a ? (a.alive ? 1 : 0) : undefined; },
                findSlot: (a, b, alive) => { const m = this.actors.find(m => m.slot && 14000000 + m.rec.id >= a && 14000000 + m.rec.id <= b && (alive ? !m.free : m.free)); return m ? 14000000 + m.rec.id : -1; },
                spawnSlot: (slot, a, b) => { const m = this.actors.find(m => m.slot && 14000000 + m.rec.id === slot); if (m) {
                    const [x, y] = worldToReal(a, b);
                    m.revive(x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 60);
                } },
                sound: id => { audio.sfx(id); },
                notice: text => { this.banner = { text: text.split('\n')[0].replace(/[^\x20-\x7e]/g, '?'), t: 0 }; },
                hasItem: (cat, id) => this.win.inv.entries.some(e => e.item.sec === cat && (e.item.f['1'] ?? 0) === id),
                takeItem: (cat, id) => { const e = this.win.inv.entries.find(e => e.item.sec === cat && (e.item.f['1'] ?? 0) === id); if (e)
                    this.win.inv.remove(e); },
                randomDrop: (tier, a, b) => this.randomDrop(tier, a, b),
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
        const [map, set, caf, gui, win, text, tables, vm] = await Promise.all([GameMap.load(q.get('map') ?? sc.map ?? 'f00_01'), app.set(`data/ep1/${gender}`), loadCaf(`data/ep1/${gender}.caf.json`), Gui.load(), Windows.load(app), Text.load(app), fetch('data/ep1/tables.json').then(r => r.json()), ScriptVM.load(scenario).catch(() => null)]);
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
            g.ground = sg.flatMap(o => o.gold ? [{ x: o.x, y: o.y, gold: o.gold }] : (() => { const item = win.db.get(o.sec, o.idx); return item ? [{ x: o.x, y: o.y, item, gold: 0 }] : []; })());
        if (ld) {
            Object.assign(g.player, { x: ld.x, y: ld.y });
            g.spawnPos = { x: map.markerReal()?.[0] ?? ld.x, y: map.markerReal()?.[1] ?? ld.y };
            g.hud = ld.hud;
            g.totalExp = ld.totalExp;
            g.syncExp();
            g.win.gold = ld.gold;
            for (const [sec, idx, x, y, eq] of ld.inv) {
                const item = win.db.get(sec, idx);
                if (item) {
                    const [w, h] = ItemDb.size(item);
                    g.win.inv.entries.push({ item, x, y, w, h, eq: !!eq });
                }
            }
        }
        const cr = opts?.carry;
        if (cr) {
            g.hud = cr.hud;
            g.totalExp = cr.totalExp;
            g.win.inv = cr.win.inv;
            g.win.gold = cr.win.gold;
        }
        // monsters addressed by script slot ranges (sentences 31/32) start dormant: the script summons them (trap rooms, waves)
        if (vm) {
            const ranges = [];
            for (const b of vm.data.blocks)
                for (const [sid, ops] of b)
                    if ((sid === 31 || sid === 32) && ops[0][0] < 3 && ops[1][0] < 3)
                        ranges.push([ops[0][1], ops[1][1]]);
            for (const a of g.actors)
                if (a.enemy && ranges.some(([lo, hi]) => 14000000 + a.rec.id >= lo && 14000000 + a.rec.id <= hi)) {
                    a.slot = true;
                    a.hidden = true;
                }
        }
        g.zones = sc.zones;
        g.musicIdx = sc.music;
        if (vm)
            for (const [, st, ch] of vm.data.status)
                if (st === 3)
                    g.enterIds.add(ch);
        if (opts?.entry !== undefined) {
            const pt = g.entryPoint(opts.entry);
            if (pt) {
                g.player.x = pt[0];
                g.player.y = pt[1];
                g.spawnPos = { x: pt[0], y: pt[1] };
            }
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
    /** Table.Tbd table 13: cumulative EXP needed to leave level n (1-based). */
    syncExp() {
        const t = this.expTable, h = this.hud;
        while (h.level < 100 && this.totalExp >= t[h.level - 1]) {
            h.level++;
            h.hpMax += 12;
            h.mpMax += 6;
            h.hp = h.hpMax;
            h.mp = h.mpMax;
        }
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
    hitPlayer(d) {
        if (this.dead)
            return;
        const h = this.hud;
        d = Math.max(1, d - Math.floor(this.win.stats().defense * 0.5));
        h.hp = Math.max(0, h.hp - d);
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
    hurtEnemy(a) {
        // placeholder formula: base from level + a roll of the equipped weapon's attack range (fists when none)
        const st = this.win.stats(), roll = st.atkMin + Math.random() * (st.atkMax - st.atkMin);
        const dmg = Math.max(1, Math.round((4 + this.hud.level * 2 + (st.atkMax ? roll : 2)) * (9 + Math.floor(Math.random() * 3)) / 10)); // exe 0x412a40: attack * (9 + rand%3) / 10 (minus defence * Table 11 / 10, defence not modelled)
        a.hp -= dmg;
        this.floaters.push({ x: a.x, y: a.y - 80, t: 0, s: String(dmg) });
        audio.sfx(a.hp <= 0 ? SFX.kill : SFX.hit, 0.8);
        if (a.hp <= 0) {
            a.die();
            this.totalExp += a.stats.exp;
            this.syncExp();
            if (this.vm?.event(4, 14000000 + a.rec.id))
                this.openDialog();
            const [g0, g1] = a.stats.gold, gold = g0 + Math.floor(Math.random() * (g1 - g0 + 1));
            if (gold > 0)
                this.ground.push({ x: a.x, y: a.y, gold });
            // item drop: chance (percent) and level come from the monster's Mct record; level picks the PLACEHOLDER table row (Table.Tbd 902-907 rows 2-8)
            const st = a.rec.st;
            if (st && st.dlv >= 0 && Math.random() * 100 < st.drop) {
                const [wa, wb] = realToWorld(a.x, a.y);
                this.randomDrop(st.dlv, wa, wb);
            }
        }
    }
    blocked(x, y) {
        return this.map.blockedReal(x, y) || this.actors.some(a => a.solid && Math.hypot(a.x - x, (a.y - y) * 1.6) < a.radius);
    }
    update(dt) {
        this.dev();
        this.checkZones();
        if (this.warpMenu && !this.dlg) {
            this.warpMenu = false;
            this.showWarpMenu();
        }
        if ((this.saveT += dt) > 10000 && !this.dead && !this.leaving) {
            this.saveT = 0;
            this.save();
        }
        for (const a of this.actors)
            a.update(dt, this.actorCtx);
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
        if (inp.pressed.has('g') || inp.pressed.has('f1'))
            this.debug = !this.debug;
        if (inp.pressed.has('r'))
            hud.running = !hud.running;
        if (inp.pressed.has('c'))
            this.win.status = !this.win.status;
        if (inp.pressed.has('i'))
            this.win.item = !this.win.item;
        if (inp.pressed.has('q'))
            this.toggleQuestLog();
        if (inp.pressed.has('m'))
            audio.toggleMute();
        if (inp.pressed.has('escape') && this.qlog)
            this.toggleQuestLog();
        else if (inp.pressed.has('escape')) {
            if (this.win.status || this.win.item)
                this.win.status = this.win.item = false;
            else
                this.paused = !this.paused;
        }
        if (inp.clicked) {
            const b = this.gui.button(inp.x, inp.y);
            if (this.qlog && inp.x < 320 && inp.y < 416)
                this.qlogClick(inp.x, inp.y);
            else if (this.paused) {
                if (inp.y > 215 && inp.y < 235) {
                    this.save();
                    TitleScene.create(this.app).then(t => this.app.go(t));
                }
                else
                    this.paused = false;
            }
            else if (!this.shop && this.win.entryAt(inp.x, inp.y))
                this.win.inv.toggleEquip(this.win.entryAt(inp.x, inp.y));
            else if (b === 'status')
                this.win.status = !this.win.status;
            else if (b === 'item')
                this.win.item = !this.win.item;
            else if (b === 'menu')
                this.paused = true;
        }
        if (this.paused)
            return;
        if (this.dead) {
            this.player.t += dt;
            if (inp.clicked && this.player.t > 800) {
                this.dead = false;
                Object.assign(this.player, { x: this.spawnPos.x, y: this.spawnPos.y, anim: ANIM_IDLE, t: 0 });
                this.hud.hp = this.hud.hpMax;
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
        if (hov?.enemy && (inp.clicked || inp.down))
            this.target = hov;
        else if (inp.clicked && hov)
            this.talkTo(hov);
        else if (inp.clicked && gh)
            this.pickUp(gh);
        else if (inp.clicked && zov)
            this.useZone(zov);
        else if (inp.clicked)
            this.target = null;
        if (this.target && !this.target.alive)
            this.target = null;
        let dx = 0, dy = 0;
        if (keys.has('a') || keys.has('arrowleft'))
            dx--;
        if (keys.has('d') || keys.has('arrowright'))
            dx++;
        if (keys.has('w') || keys.has('arrowup'))
            dy--;
        if (keys.has('s') || keys.has('arrowdown'))
            dy++;
        let vx = dx, vy = dy;
        if (!dx && !dy && inp.down && !hov && !gh && inp.y < HUD_Y && !this.win.overUI(inp.x, inp.y) && !this.gui.button(inp.x, inp.y)) {
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
            if (td > 58 && !atk) {
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
        else if (dx || dy)
            this.target = null;
        if (this.atkT >= 0) {
            vx = vy = 0;
        }
        if (vx || vy) {
            const run = keys.has('shift') || hud.running, n = Math.hypot(vx, vy), sp = (run ? 0.30 : 0.16) * dt;
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
            const fr = this.caf.anims[3].dirs[p.dir].frames || 11, dur = fr * FRAME_MS * 100 / Math.max(30, this.win.stats().speed);
            if (!this.atkHit && p.t >= dur * 0.45) {
                this.atkHit = true;
                if (this.target?.alive)
                    this.hurtEnemy(this.target);
            }
            if (p.t >= dur) {
                this.atkT = -1;
                p.anim = ANIM_IDLE;
                p.t = 0;
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
        map.draw(ctx, this.camX, this.camY, SCREEN_W, HUD_Y, [this.drawPlayer, ...this.actors, ...this.zones.filter(z => z.drawn), ...gd]);
        for (const f of this.floaters)
            this.text.drawCenter(ctx, f.s, Math.round(f.x - this.camX), Math.round(f.y - this.camY - f.t / 25));
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
        const gh = !hov && inp.y < HUD_Y ? this.groundAt(inp.x + this.camX, inp.y + this.camY) : undefined;
        if (gh)
            this.text.drawCenter(ctx, gh.item ? gh.item.name : `${gh.gold} Gold`, Math.round(gh.x - this.camX), Math.round(gh.y - this.camY - 30));
        if (hov)
            this.text.drawCenter(ctx, hov.name, Math.round(hov.x - this.camX), Math.round(hov.y - this.camY - 84));
        ctx.fillStyle = '#000';
        ctx.fillRect(0, HUD_Y, SCREEN_W, SCREEN_H - HUD_Y);
        this.win.draw(ctx, this.hud, this.name, inp.x, inp.y);
        this.gui.draw(ctx, this.hud);
        this.shop?.draw(ctx, this.text, this.win, inp.x, inp.y);
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
        if (this.paused) {
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(0, 0, SCREEN_W, HUD_Y);
            this.text.drawCenter(ctx, 'PAUSED', 320, 190);
            this.text.drawCenter(ctx, 'Exit to title', 320, 220);
            this.text.drawCenter(ctx, '(click elsewhere to resume)', 320, 245);
        }
        this.gui.cursor(ctx, inp.x, inp.y, inp.down);
    }
}
//# sourceMappingURL=game.js.map