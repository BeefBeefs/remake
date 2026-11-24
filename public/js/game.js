import { loadCaf } from './caf.js';
import { GameMap } from './map.js';
import { Gui, SCREEN_W, SCREEN_H, HUD_Y } from './gui.js';
import { Text } from './app.js';
import { Windows } from './windows.js';
import { TitleScene } from './title.js';
const q = new URLSearchParams(location.search);
const MAP = q.get('map') ?? '3rd_2-1';
/** CAF layers drawn for the player: 1 = shadow-ish base, 0 = body, 3.. = equipment variants (mapping still unknown). */
const LAYERS = (q.get('layers') ?? '1,0,3').split(',').map(Number);
const FRAME_MS = 60;
const ANIM_IDLE = 0, ANIM_WALK = 1, ANIM_RUN = 2;
/** Facing index (CAF direction order, guessed) for 8 compass sectors starting at "right" going clockwise on screen. */
const FACING = [6, 7, 0, 1, 2, 3, 4, 5];
const dirIndex = (vx, vy) => FACING[(Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) + 8) % 8];
export class GameScene {
    constructor(app, name, map, set, caf, gui, win, text) {
        this.app = app;
        this.name = name;
        this.map = map;
        this.set = set;
        this.caf = caf;
        this.gui = gui;
        this.win = win;
        this.text = text;
        this.hud = { hp: 100, hpMax: 100, mp: 60, mpMax: 60, level: 1, exp: 0, expMax: 100, running: false };
        this.debug = false;
        this.paused = false;
        this.camX = 0;
        this.camY = 0;
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
    }
    static async create(app, gender, name) {
        const [map, set, caf, gui, win, text] = await Promise.all([GameMap.load(MAP), app.set(`data/ep1/${gender}`), loadCaf(`data/ep1/${gender}.caf.json`), Gui.load(), Windows.load(app), Text.load(app)]);
        return new GameScene(app, name, map, set, caf, gui, win, text);
    }
    update(dt) {
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
        if (!dx && !dy && inp.down && inp.y < HUD_Y && !this.win.overUI(inp.x, inp.y) && !this.gui.button(inp.x, inp.y)) {
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
            if (!this.map.blockedReal(nx, ny)) {
                p.x = nx;
                p.y = ny;
            }
            else if (!this.map.blockedReal(nx, p.y))
                p.x = nx;
            else if (!this.map.blockedReal(p.x, ny))
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
        map.draw(ctx, this.camX, this.camY, SCREEN_W, HUD_Y, [this.drawPlayer]);
        if (this.debug) {
            map.drawJudge(ctx, this.camX, this.camY, SCREEN_W, HUD_Y);
            this.text.draw(ctx, `${Math.round(p.x)},${Math.round(p.y)}`, 4, 2);
        }
        ctx.fillStyle = '#000';
        ctx.fillRect(0, HUD_Y, SCREEN_W, SCREEN_H - HUD_Y);
        this.win.draw(ctx, this.hud, this.name);
        this.gui.draw(ctx, this.hud);
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