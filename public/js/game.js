import { loadCaf } from './caf.js';
import { GameMap, worldToReal } from './map.js';
import { loadScenarioActors } from './actors.js';
import { ScriptVM } from './script.js';
import { Gui, SCREEN_W, SCREEN_H, HUD_Y } from './gui.js';
import { Text } from './app.js';
import { Windows } from './windows.js';
import { TitleScene } from './title.js';
const q = new URLSearchParams(location.search);
const SCENARIO = q.get('scenario') ?? '00000000';
/** CAF layers drawn for the player: 1 = shadow-ish base, 0 = body, 3.. = equipment variants (mapping still unknown). */
const LAYERS = (q.get('layers') ?? '1,0,3').split(',').map(Number);
const FRAME_MS = 60;
const ANIM_IDLE = 0, ANIM_WALK = 1, ANIM_RUN = 2;
/** Facing index (CAF direction order, guessed) for 8 compass sectors starting at "right" going clockwise on screen. */
const FACING = [6, 7, 0, 1, 2, 3, 4, 5];
const dirIndex = (vx, vy) => FACING[(Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) + 8) % 8];
export class GameScene {
    openDialog() {
        const p = this.vm?.pending;
        if (!p) {
            this.dlg = null;
            return;
        }
        const lines = p.text.replace(/%d/g, '100').replace(/\n$/, '').split('\n');
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
            this.vm.advance(pick);
            this.openDialog();
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
    talkTo(a) {
        if (!this.vm || a.rec.kind !== 'people')
            return;
        if (Math.hypot(a.x - this.player.x, (a.y - this.player.y) * 1.6) > 260)
            return;
        this.vm.talk(12000000 + a.rec.id);
        this.openDialog();
    }
    constructor(app, name, map, set, caf, gui, win, text, actors, vm) {
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
        this.hud = { hp: 100, hpMax: 100, mp: 60, mpMax: 60, level: 1, exp: 0, expMax: 100, running: false };
        this.debug = false;
        this.paused = false;
        this.camX = 0;
        this.camY = 0;
        this.expTable = [];
        this.totalExp = 0;
        this.devNext = 0;
        /** Items lying on the ground (real-pixel coordinates). gold > 0 for gold piles. */
        this.ground = [];
        this.groundDraw = { get y() { return 0; }, draw: () => { } };
        /** Open message window: text lines and clickable ~option~ regions (line, col0, col1). */
        this.dlg = null;
        const mk = map.markerReal();
        this.player = { x: +(q.get('x') ?? mk?.[0] ?? 3600), y: +(q.get('y') ?? mk?.[1] ?? 8100), dir: 0, t: 0, anim: ANIM_IDLE };
        const p = this.player;
        this.drawPlayer = {
            get y() { return p.y; },
            draw: (c, camX, camY) => {
                const d = this.caf.anims[p.anim].dirs[p.dir];
                const fi = d.frames ? Math.max(0, Math.floor(p.t / FRAME_MS)) % d.frames : 0;
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
                charPos: char => { const r = this.actors.find(a => a.rec.kind === 'people' && 12000000 + a.rec.id === char); return r ? [r.rec.a, r.rec.b] : null; },
                drop: (cat, id, a, b, amount) => {
                    const [x, y] = worldToReal(a, b);
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
    static async create(app, gender, name) {
        const sc = await loadScenarioActors(app, SCENARIO).catch(() => ({ map: null, actors: [] }));
        const [map, set, caf, gui, win, text, tables, vm] = await Promise.all([GameMap.load(q.get('map') ?? sc.map ?? 'f00_01'), app.set(`data/ep1/${gender}`), loadCaf(`data/ep1/${gender}.caf.json`), Gui.load(), Windows.load(app), Text.load(app), fetch('data/ep1/tables.json').then(r => r.json()), ScriptVM.load(SCENARIO).catch(() => null)]);
        const g = new GameScene(app, name, map, set, caf, gui, win, text, sc.actors, vm);
        g.expTable = tables['13'].v;
        g.syncExp();
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
    blocked(x, y) {
        return this.map.blockedReal(x, y) || this.actors.some(a => Math.hypot(a.x - x, (a.y - y) * 1.6) < a.radius);
    }
    update(dt) {
        this.dev();
        for (const a of this.actors)
            a.update(dt);
        const inp = this.app.input, keys = inp.keys, p = this.player, hud = this.hud;
        if (inp.pressed.has('g') || inp.pressed.has('f1'))
            this.debug = !this.debug;
        if (inp.pressed.has('r'))
            hud.running = !hud.running;
        if (inp.pressed.has('c'))
            this.win.status = !this.win.status;
        if (inp.pressed.has('i'))
            this.win.item = !this.win.item;
        if (inp.pressed.has('escape')) {
            if (this.win.status || this.win.item)
                this.win.status = this.win.item = false;
            else
                this.paused = !this.paused;
        }
        if (inp.clicked) {
            const b = this.gui.button(inp.x, inp.y);
            if (this.paused) {
                if (inp.y > 215 && inp.y < 235)
                    TitleScene.create(this.app).then(t => this.app.go(t));
                else
                    this.paused = false;
            }
            else if (b === 'status')
                this.win.status = !this.win.status;
            else if (b === 'item')
                this.win.item = !this.win.item;
            else if (b === 'menu')
                this.paused = true;
        }
        if (this.paused)
            return;
        if (this.dlg) {
            this.updateDialog();
            return;
        }
        const hov = inp.y < HUD_Y && !this.win.overUI(inp.x, inp.y) ? this.actors.find(a => a.hit(inp.x + this.camX, inp.y + this.camY)) : undefined;
        const gh = !hov && inp.y < HUD_Y && !this.win.overUI(inp.x, inp.y) ? this.groundAt(inp.x + this.camX, inp.y + this.camY) : undefined;
        if (inp.clicked && hov)
            this.talkTo(hov);
        else if (inp.clicked && gh)
            this.pickUp(gh);
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
        else if (p.anim !== ANIM_IDLE) {
            p.anim = ANIM_IDLE;
            p.t = 0;
        }
        p.t += dt;
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
        map.draw(ctx, this.camX, this.camY, SCREEN_W, HUD_Y, [this.drawPlayer, ...this.actors, ...gd]);
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
        if (this.dlg)
            this.drawDialog(ctx);
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