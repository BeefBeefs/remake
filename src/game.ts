import { SpriteSet } from './sprites.js';
import { loadCaf, Caf } from './caf.js';
import { GameMap, Drawable } from './map.js';
import { Actor, loadActors } from './actors.js';
import { Gui, HudState, SCREEN_W, SCREEN_H, HUD_Y } from './gui.js';
import { App, Scene, Text } from './app.js';
import { Windows } from './windows.js';
import { ItemDb } from './items.js';
import { TitleScene } from './title.js';
import type { Gender } from './select.js';

const q = new URLSearchParams(location.search);
const MAP = q.get('map') ?? 'f00_01';
const SCENARIO = q.get('scenario') ?? '00000000';
/** CAF layers drawn for the player: 1 = shadow-ish base, 0 = body, 3.. = equipment variants (mapping still unknown). */
const LAYERS = (q.get('layers') ?? '1,0,3').split(',').map(Number);
const FRAME_MS = 60;
const ANIM_IDLE = 0, ANIM_WALK = 1, ANIM_RUN = 2;
/** Facing index (CAF direction order, guessed) for 8 compass sectors starting at "right" going clockwise on screen. */
const FACING = [6, 7, 0, 1, 2, 3, 4, 5];
const dirIndex = (vx: number, vy: number) => FACING[(Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) + 8) % 8];

export class GameScene implements Scene {
  player: { x: number; y: number; dir: number; t: number; anim: number };
  hud: HudState = { hp: 100, hpMax: 100, mp: 60, mpMax: 60, level: 1, exp: 0, expMax: 100, running: false };
  debug = false; paused = false;
  private camX = 0; private camY = 0;
  private expTable: number[] = []; private totalExp = 0; private devNext = 0;
  private drawPlayer: Drawable;

  private constructor(private app: App, private name: string, private map: GameMap, private set: SpriteSet, private caf: Caf, private gui: Gui, private win: Windows, private text: Text, private actors: Actor[]) {
    const mk = map.markerReal();
    this.player = { x: +(q.get('x') ?? mk?.[0] ?? 3600), y: +(q.get('y') ?? mk?.[1] ?? 8100), dir: 0, t: 0, anim: ANIM_IDLE };
    const p = this.player;
    this.drawPlayer = {
      get y() { return p.y; },
      draw: (c, camX, camY) => {
        const d = this.caf.anims[p.anim].dirs[p.dir];
        const fi = d.frames ? Math.max(0, Math.floor(p.t / FRAME_MS)) % d.frames : 0;
        for (const l of LAYERS) {
          const seq = d.layers[l]; if (!seq || !seq.length) continue;
          const f = this.set.pattern(seq[Math.min(fi, seq.length - 1)][1]); if (!f) continue;
          c.drawImage(f.canvas, Math.round(p.x - camX + f.ox), Math.round(p.y - camY + f.oy));
        }
      },
    };
    (window as any).game = this;
  }
  static async create(app: App, gender: Gender, name: string) {
    const [map, set, caf, gui, win, text, tables, actors] = await Promise.all([GameMap.load(MAP), app.set(`data/ep1/${gender}`), loadCaf(`data/ep1/${gender}.caf.json`), Gui.load(), Windows.load(app), Text.load(app), fetch('data/ep1/tables.json').then(r => r.json()), loadActors(app, SCENARIO).catch(() => [] as Actor[])]);
    const g = new GameScene(app, name, map, set, caf, gui, win, text, actors);
    g.expTable = tables['13'].v; g.syncExp();
    return g;
  }

  /** Table.Tbd table 13: cumulative EXP needed to leave level n (1-based). */
  private syncExp() {
    const t = this.expTable, h = this.hud;
    while (h.level < 100 && this.totalExp >= t[h.level - 1]) { h.level++; h.hpMax += 12; h.mpMax += 6; h.hp = h.hpMax; h.mp = h.mpMax; }
    const lo = h.level > 1 ? t[h.level - 2] : 0;
    h.exp = this.totalExp - lo; h.expMax = Math.max(1, t[h.level - 1] - lo);
  }
  /** Dev helpers: X = +30 exp, F2 = add the next item from Item.Ibn to the inventory (cycles weapons, armor, ...). */
  private dev() {
    const p = this.app.input.pressed;
    if (p.has('x')) { this.totalExp += 30; this.syncExp(); }
    if (p.has('f2')) {
      const all = this.win.db.sections.flat(); const it = all[(this.devNext += 37) % all.length];
      if (!this.win.inv.add(it)) this.win.inv.entries.length = 0;
      this.win.item = true;
    }
  }
  private blocked(x: number, y: number) {
    return this.map.blockedReal(x, y) || this.actors.some(a => Math.hypot(a.x - x, (a.y - y) * 1.6) < a.radius);
  }
  update(dt: number) {
    this.dev();
    for (const a of this.actors) a.update(dt);
    const inp = this.app.input, keys = inp.keys, p = this.player, hud = this.hud;
    if (inp.pressed.has('g') || inp.pressed.has('f1')) this.debug = !this.debug;
    if (inp.pressed.has('r')) hud.running = !hud.running;
    if (inp.pressed.has('c')) this.win.status = !this.win.status;
    if (inp.pressed.has('i')) this.win.item = !this.win.item;
    if (inp.pressed.has('escape')) { if (this.win.status || this.win.item) this.win.status = this.win.item = false; else this.paused = !this.paused; }
    if (inp.clicked) {
      const b = this.gui.button(inp.x, inp.y);
      if (this.paused) { if (inp.y > 215 && inp.y < 235) TitleScene.create(this.app).then(t => this.app.go(t)); else this.paused = false; }
      else if (b === 'status') this.win.status = !this.win.status;
      else if (b === 'item') this.win.item = !this.win.item;
      else if (b === 'menu') this.paused = true;
    }
    if (this.paused) return;
    let dx = 0, dy = 0;
    if (keys.has('a') || keys.has('arrowleft')) dx--;
    if (keys.has('d') || keys.has('arrowright')) dx++;
    if (keys.has('w') || keys.has('arrowup')) dy--;
    if (keys.has('s') || keys.has('arrowdown')) dy++;
    let vx = dx, vy = dy;
    if (!dx && !dy && inp.down && inp.y < HUD_Y && !this.win.overUI(inp.x, inp.y) && !this.gui.button(inp.x, inp.y)) {
      // walk towards the mouse pointer (screen space, relative to the player)
      const mx = inp.x - (p.x - this.camX), my = inp.y - (p.y - this.camY), d = Math.hypot(mx, my);
      if (d > 6) { vx = mx / d; vy = my / d; }
    }
    if (vx || vy) {
      const run = keys.has('shift') || hud.running, n = Math.hypot(vx, vy), sp = (run ? 0.30 : 0.16) * dt;
      p.dir = dirIndex(vx, vy);
      const nx = p.x + vx / n * sp, ny = p.y + vy / n * sp;
      // slide along obstacles: try both axes, then each alone
      if (!this.blocked(nx, ny)) { p.x = nx; p.y = ny; }
      else if (!this.blocked(nx, p.y)) p.x = nx;
      else if (!this.blocked(p.x, ny)) p.y = ny;
      const na = run ? ANIM_RUN : ANIM_WALK; if (na !== p.anim) { p.anim = na; p.t = 0; }
    } else if (p.anim !== ANIM_IDLE) { p.anim = ANIM_IDLE; p.t = 0; }
    p.t += dt;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const p = this.player, map = this.map, inp = this.app.input;
    this.camX = Math.round(Math.max(0, Math.min(map.realW - SCREEN_W, p.x - SCREEN_W / 2)));
    this.camY = Math.round(Math.max(0, Math.min(map.realH - HUD_Y, p.y - HUD_Y / 2)));
    map.draw(ctx, this.camX, this.camY, SCREEN_W, HUD_Y, [this.drawPlayer, ...this.actors]);
    if (this.debug) { map.drawJudge(ctx, this.camX, this.camY, SCREEN_W, HUD_Y); this.text.draw(ctx, `${Math.round(p.x)},${Math.round(p.y)}`, 4, 2); }
    const hov = inp.y < HUD_Y ? this.actors.find(a => a.hit(inp.x + this.camX, inp.y + this.camY)) : undefined;
    if (hov) this.text.drawCenter(ctx, hov.name, Math.round(hov.x - this.camX), Math.round(hov.y - this.camY - 84));
    ctx.fillStyle = '#000'; ctx.fillRect(0, HUD_Y, SCREEN_W, SCREEN_H - HUD_Y);
    this.win.draw(ctx, this.hud, this.name, inp.x, inp.y);
    this.gui.draw(ctx, this.hud);
    if (this.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, SCREEN_W, HUD_Y);
      this.text.drawCenter(ctx, 'PAUSED', 320, 190); this.text.drawCenter(ctx, 'Exit to title', 320, 220); this.text.drawCenter(ctx, '(click elsewhere to resume)', 320, 245);
    }
    this.gui.cursor(ctx, inp.x, inp.y, inp.down);
  }
}
