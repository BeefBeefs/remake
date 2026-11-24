import { SpriteSet } from './sprites.js';
import { loadCaf, Caf } from './caf.js';
import { GameMap, Drawable, worldToReal } from './map.js';
import { ItemDef } from './items.js';
import { Zone } from './zones.js';
import { Actor, ActorCtx, loadScenarioActors, dirIndex as actorDir } from './actors.js';
import { ScriptVM } from './script.js';
import { Gui, HudState, SCREEN_W, SCREEN_H, HUD_Y } from './gui.js';
import { App, Scene, Text } from './app.js';
import { Windows } from './windows.js';
import { ItemDb } from './items.js';
import { TitleScene } from './title.js';
import type { Gender } from './select.js';

const q = new URLSearchParams(location.search);
const SCENARIO = q.get('scenario') ?? '00000000';
/** PROVISIONAL scene links (the real exit table is not decoded yet): flagged zone / spawn circle -> scenario. */
/** Episode 1 map graph (PROVISIONAL): the town's exit opens an area list; every other map returns to the town at its arrival point.
 *  Names are message 1000000 of each Scenario.Scs. The real game picks the destination on a world map. */
const HOME = '00000000';
const AREAS: [string, string][] = [
  ['00000001', 'Near the Remote Town'], ['00000003', 'Wasteland of Hesitation'], ['00000004', 'Iron Boundary Line'], ['00000005', 'Frosty Forest'], ['00000006', 'Wasteland of Pillars'],
  ['00010000', 'Dusty Ruins, B1F'], ['00010001', 'Dusty Ruins, B3F'], ['00010002', 'Dusty Ruins, B4F'], ['00010003', 'Dusty Ruins, B5F'], ['00010004', 'Dusty Ruins, Room of Judgment'], ['00010005', 'Dusty Ruins, Continued Room'],
];
/** Script state kept per scenario so quests are not replayed when re-entering a map. */
const savedVars = new Map<string, Map<string, number>>(); let savedGlobals = new Map<string, number>();
interface GroundSave { x: number; y: number; sec: number; idx: number; gold: number; }
const savedGround = new Map<string, GroundSave[]>();
/** Zone ids whose visibility differs from the Mct default (opened chests ...), per scenario. */
const savedZones = new Map<string, Record<number, boolean>>();
const SAVE_KEY = 'shadowflare_save_v1';
export interface SaveData {
  v: 1; name: string; gender: Gender; scenario: string; x: number; y: number; hud: HudState; totalExp: number; gold: number;
  inv: [number, number, number, number, number?][]; vars: Record<string, [string, number][]>; globals: [string, number][]; ground: Record<string, GroundSave[]>; zones?: Record<string, Record<number, boolean>>;
}
export function readSave(): SaveData | null { try { const t = localStorage.getItem(SAVE_KEY); return t ? JSON.parse(t) : null; } catch { return null; } }
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
  /** Quest titles (Table.Tbd table 41) and the banner shown when a quest changes state. */
  private titles: string[] = []; private banner: { text: string; t: number } | null = null;
  private pollT = 0; zones: Zone[] = []; tables: Record<string, { cols: number; v: number[] }> = {};
  private expTable: number[] = []; private totalExp = 0; private devNext = 0;
  private drawPlayer: Drawable;
  // --- combat ---
  private target: Actor | null = null; private atkT = -1; private atkHit = false; private dead = false;
  private spawnPos = { x: 0, y: 0 };
  floaters: { x: number; y: number; t: number; s: string }[] = [];
  private actorCtx: ActorCtx;
  private armed = false; private leaving = false; private saveT = 0;
  /** Remember per-scenario script flags and ground items (used for transitions and saving). */
  private stash() {
    if (this.vm) { savedVars.set(this.scenario, this.vm.vars); savedGlobals = this.vm.globals; }
    savedZones.set(this.scenario, Object.fromEntries(this.zones.filter(z => z.visible !== (z.rec.vis !== 0)).map(z => [z.rec.id, z.visible])));
    savedGround.set(this.scenario, this.ground.map(o => ({ x: o.x, y: o.y, sec: o.item?.sec ?? 0, idx: o.item?.idx ?? 0, gold: o.gold })));
  }
  save() {
    this.stash();
    const d: SaveData = {
      v: 1, name: this.name, gender: this.gender, scenario: this.scenario, x: this.player.x, y: this.player.y, hud: this.hud, totalExp: this.totalExp, gold: this.win.gold,
      inv: this.win.inv.entries.map(e => [e.item.sec, e.item.idx, e.x, e.y, e.eq ? 1 : 0]),
      vars: Object.fromEntries([...savedVars].map(([k, v]) => [k, [...v]])), globals: [...savedGlobals], ground: Object.fromEntries(savedGround), zones: Object.fromEntries(savedZones),
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) { console.warn('save failed', e); }
  }
  private atExit() {
    const p = this.player;
    if (this.scenario === HOME && this.map.hasMarkerZone) return this.map.inMarker(p.x, p.y, 5);
    return Math.hypot(p.x - this.spawnPos.x, (p.y - this.spawnPos.y) * 1.6) < 90;
  }
  private checkExit() {
    if (this.leaving || this.dlg) return;
    const at = this.atExit(), far = Math.hypot(this.player.x - this.spawnPos.x, this.player.y - this.spawnPos.y) > 220;
    if (far) this.armed = true;
    if (!at || !this.armed) return;
    if (this.scenario !== HOME) return this.travel(HOME);
    this.armed = false; this.target = null;
    this.dlgPick = i => { if (i < AREAS.length) this.travel(AREAS[i][0]); };
    this.setDialog(['Where do you want to go?', '', ...AREAS.map(a => `  ~${a[1]}~`), '', '  ~Stay in town~']);
  }
  private travel(scenario: string) {
    this.leaving = true; this.save();
    GameScene.create(this.app, this.gender, this.name, { scenario, carry: this }).then(g => this.app.go(g));
  }
  private dlgPick: ((i: number) => void) | null = null;
  private setDialog(lines: string[]) {
    const opts: [number, number, number][] = [];
    lines.forEach((l, i) => { const re = /~([^~]*)~/g; let m; while ((m = re.exec(l))) opts.push([i, m.index, m.index + m[0].length]); });
    this.dlg = { lines: lines.map(l => l.replace(/~/g, ' ')), opts };
  }
  /** Items lying on the ground (real-pixel coordinates). gold > 0 for gold piles. */
  ground: { x: number; y: number; item?: ItemDef; gold: number }[] = [];
  private groundDraw: Drawable = { get y() { return 0; }, draw: () => {} };
  /** Open message window: text lines and clickable ~option~ regions (line, col0, col1). */
  private dlg: { lines: string[]; opts: [number, number, number][] } | null = null;
  private openDialog() {
    this.dlgPick = null;
    const p = this.vm?.pending; if (!p) { this.dlg = null; return; }
    const lines = p.text.replace(/%d/g, '100').replace(/\n$/, '').split('\n'); const opts: [number, number, number][] = [];
    lines.forEach((l, i) => { const re = /~([^~]*)~/g; let m; while ((m = re.exec(l))) opts.push([i, m.index, m.index + m[0].length]); });
    this.dlg = { lines: lines.map(l => l.replace(/~/g, ' ').replace(/[^\x20-\x7e]/g, c => c === '・' ? '-' : '?')), opts };
  }
  private dlgBox() { const h = this.dlg!.lines.length * 13 + 24; return { x: 90, y: HUD_Y - 8 - h, w: 460, h }; }
  private updateDialog() {
    const inp = this.app.input, d = this.dlg!, b = this.dlgBox();
    let pick = -1;
    if (d.opts.length) {
      if (inp.clicked) d.opts.forEach(([l, c0, c1], i) => { const x = b.x + 12 + c0 * 6, y = b.y + 12 + l * 13; if (inp.x >= x && inp.x < x + (c1 - c0) * 6 && inp.y >= y && inp.y < y + 13) pick = i; });
    } else if (inp.clicked || inp.pressed.has('enter') || inp.pressed.has(' ')) pick = 0;
    if (pick >= 0) { if (this.dlgPick) { const f = this.dlgPick; this.dlgPick = null; this.dlg = null; f(pick); } else { this.vm!.advance(pick); this.openDialog(); } }
  }
  private drawDialog(ctx: CanvasRenderingContext2D) {
    const d = this.dlg!, b = this.dlgBox(), inp = this.app.input;
    ctx.fillStyle = 'rgba(8,8,24,0.88)'; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = '#a89868'; ctx.lineWidth = 2; ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    d.opts.forEach(([l, c0, c1]) => { const x = b.x + 12 + c0 * 6, y = b.y + 12 + l * 13; if (inp.x >= x && inp.x < x + (c1 - c0) * 6 && inp.y >= y && inp.y < y + 13) { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(x, y, (c1 - c0) * 6, 13); } });
    d.lines.forEach((l, i) => this.text.draw(ctx, l, b.x + 12, b.y + 12 + i * 13));
  }
  private groundAt(px: number, py: number) { return this.ground.find(g => Math.abs(px - g.x) < 18 && py > g.y - 30 && py < g.y + 8); }
  private pickUp(g: GameScene['ground'][number]) {
    if (Math.hypot(g.x - this.player.x, (g.y - this.player.y) * 1.6) > 140) return;
    if (g.item) { if (!this.win.inv.add(g.item)) return; } else this.win.gold += g.gold;
    this.ground.splice(this.ground.indexOf(g), 1);
  }
  /** Click a scripted object (chest, barrel...): runs its status-0 block when the player is close enough. */
  private useZone(z: Zone) {
    if (!this.vm || Math.hypot(z.x - this.player.x, (z.y - this.player.y) * 1.6) > 200) return;
    this.vm.talk(z.rec.id); this.openDialog();
  }
  /** Sentence 24 (PLACEHOLDER): the real drop tables are Table.Tbd 900-907 (13 rows = tiers); rows give weights per base item type for weapons (902), armor (904) and another category (906). */
  private randomDrop(tier: number, a: number, b: number) {
    const [x, y] = worldToReal(a, b), t = this.tables, row = (id: string) => { const T = t[id]; return T ? T.v.slice(tier * T.cols, (tier + 1) * T.cols) as number[] : []; };
    const cats: [number, number[]][] = [[0, row('902')], [1, row('904')], [3, row('906')]];
    const sum = (w: number[]) => w.reduce((p, c) => p + c, 0), total = cats.reduce((p, c) => p + sum(c[1]), 0);
    if (total <= 0) { this.ground.push({ x, y, gold: 10 + Math.floor(Math.random() * 40) * Math.max(1, tier) }); return; }
    let r = Math.random() * total, sec = 0, w: number[] = [];
    for (const [s, ws] of cats) { if (r < sum(ws)) { sec = s; w = ws; break; } r -= sum(ws); }
    let r2 = Math.random() * sum(w), col = 0; for (; col < w.length; col++) { if (r2 < w[col]) break; r2 -= w[col]; }
    const list = this.win.db.sections[sec], types = [...new Set(list.map(i => i.type))];
    const pool = sec === 3 ? [list[col % list.length]] : list.filter(i => i.type === types[col % types.length]);
    const item = Math.random() < 0.7 ? pool[0] : pool[Math.floor(Math.random() * pool.length)];
    if (item) this.ground.push({ x, y, item, gold: 0 });
  }
  private talkTo(a: Actor) {
    if (!this.vm || a.rec.kind !== 'people') return;
    if (Math.hypot(a.x - this.player.x, (a.y - this.player.y) * 1.6) > 260) return;
    this.vm.talk(12000000 + a.rec.id); this.openDialog();
  }

  private constructor(private app: App, private name: string, private map: GameMap, private set: SpriteSet, private caf: Caf, private gui: Gui, private win: Windows, private text: Text, private actors: Actor[], private vm: ScriptVM | null, private scenario: string, private gender: Gender) {
    const mk = map.markerReal();
    this.player = { x: +(q.get('x') ?? mk?.[0] ?? 3600), y: +(q.get('y') ?? mk?.[1] ?? 8100), dir: 0, t: 0, anim: ANIM_IDLE };
    const p = this.player; this.spawnPos = { x: p.x, y: p.y };
    this.actorCtx = { get px() { return p.x; }, get py() { return p.y; }, blocked: (x, y) => this.map.blockedReal(x, y), hitPlayer: d => this.hitPlayer(d) };
    this.drawPlayer = {
      get y() { return p.y; },
      draw: (c, camX, camY) => {
        const d = this.caf.anims[p.anim].dirs[p.dir];
        const raw = Math.max(0, Math.floor(p.t / FRAME_MS)), fi = d.frames ? (p.anim === 23 ? Math.min(raw, d.frames - 1) : raw % d.frames) : 0;
        for (const l of LAYERS) {
          const seq = d.layers[l]; if (!seq || !seq.length) continue;
          const f = this.set.pattern(seq[Math.min(fi, seq.length - 1)][1]); if (!f) continue;
          c.drawImage(f.canvas, Math.round(p.x - camX + f.ox), Math.round(p.y - camY + f.oy));
        }
      },
    };
    (window as any).game = this;
    if (this.vm) this.vm.hooks = {
      charPos: char => { const r = this.actors.find(a => a.rec.kind === 'people' && 12000000 + a.rec.id === char); if (r) return [r.rec.a, r.rec.b]; const z = this.zones.find(z => z.rec.id === char); return z ? [z.rec.a, z.rec.b] : null; },
      level: () => this.hud.level,
      quest: (q, st) => {
        const title = (this.titles[q] ?? `Quest ${q}`).replace(/[^\x20-\x7e]/g, '?');
        if (st === 1 || st === 2) this.banner = { text: `${st === 1 ? 'Quest accepted' : 'Quest completed'}: ${title}`, t: 0 };
      },
      show: (id, v) => { const z = this.zones.find(z => z.rec.id === id); if (z) z.visible = v; },
      randomDrop: (tier, a, b) => this.randomDrop(tier, a, b),
      drop: (cat, id, a, b, min, max) => {
        const [x, y] = worldToReal(a, b), amount = min + Math.floor(Math.random() * Math.max(1, max - min + 1));
        if (cat === 4 && id === 0) this.ground.push({ x, y, gold: amount });
        else { const item = this.win.db.find(cat, id); if (item) this.ground.push({ x, y, item, gold: 0 }); else console.warn('script drop: unknown item', cat, id); }
      },
    };
  }
  static async create(app: App, gender: Gender, name: string, opts?: { scenario?: string; carry?: GameScene; load?: SaveData }) {
    const ld = opts?.load;
    if (ld) { savedGlobals = new Map(ld.globals); savedVars.clear(); for (const [k, v] of Object.entries(ld.vars)) savedVars.set(k, new Map(v)); savedGround.clear(); for (const [k, v] of Object.entries(ld.ground)) savedGround.set(k, v); savedZones.clear(); for (const [k, v] of Object.entries(ld.zones ?? {})) savedZones.set(k, v); }
    const scenario = opts?.scenario ?? SCENARIO;
    const sc = await loadScenarioActors(app, scenario).catch(() => ({ map: null as string | null, actors: [] as Actor[], zones: [] as Zone[] }));
    const [map, set, caf, gui, win, text, tables, vm] = await Promise.all([GameMap.load(q.get('map') ?? sc.map ?? 'f00_01'), app.set(`data/ep1/${gender}`), loadCaf(`data/ep1/${gender}.caf.json`), Gui.load(), Windows.load(app), Text.load(app), fetch('data/ep1/tables.json').then(r => r.json()), ScriptVM.load(scenario).catch(() => null)]);
    const g = new GameScene(app, name, map, set, caf, gui, win, text, sc.actors, vm, scenario, gender);
    if (vm) { vm.globals = savedGlobals; const sv = savedVars.get(scenario); if (sv) vm.vars = sv; }
    const sz = savedZones.get(scenario); if (sz) for (const z of sc.zones) if (z.rec.id in sz) z.visible = sz[z.rec.id];
    const sg = savedGround.get(scenario);
    if (sg) g.ground = sg.flatMap(o => o.gold ? [{ x: o.x, y: o.y, gold: o.gold }] : (() => { const item = win.db.get(o.sec, o.idx); return item ? [{ x: o.x, y: o.y, item, gold: 0 }] : []; })());
    if (ld) {
      Object.assign(g.player, { x: ld.x, y: ld.y }); g.spawnPos = { x: map.markerReal()?.[0] ?? ld.x, y: map.markerReal()?.[1] ?? ld.y };
      g.hud = ld.hud; g.totalExp = ld.totalExp; g.syncExp(); g.win.gold = ld.gold;
      for (const [sec, idx, x, y, eq] of ld.inv) { const item = win.db.get(sec, idx); if (item) { const [w, h] = ItemDb.size(item); g.win.inv.entries.push({ item, x, y, w, h, eq: !!eq }); } }
    }
    const cr = opts?.carry; if (cr) { g.hud = cr.hud; g.totalExp = cr.totalExp; g.win.inv = cr.win.inv; g.win.gold = cr.win.gold; }
    g.zones = sc.zones; g.tables = tables; g.expTable = tables['13'].v; g.titles = tables['41']?.s ?? []; g.syncExp();
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
  private hitPlayer(d: number) {
    if (this.dead) return; const h = this.hud; d = Math.max(1, d - Math.floor(this.win.stats().defense * 0.5)); h.hp = Math.max(0, h.hp - d);
    this.floaters.push({ x: this.player.x, y: this.player.y - 70, t: 0, s: `-${d}` });
    if (h.hp <= 0) { this.dead = true; this.target = null; this.atkT = -1; this.player.anim = 23; this.player.t = 0; }
  }
  private hurtEnemy(a: Actor) {
    // placeholder formula: base from level + a roll of the equipped weapon's attack range (fists when none)
    const st = this.win.stats(), roll = st.atkMin + Math.random() * (st.atkMax - st.atkMin);
    const dmg = Math.max(1, Math.round((4 + this.hud.level * 2 + (st.atkMax ? roll : 2)) * (0.9 + Math.random() * 0.2)));
    a.hp -= dmg; this.floaters.push({ x: a.x, y: a.y - 80, t: 0, s: String(dmg) });
    if (a.hp <= 0) {
      a.die(); this.totalExp += a.stats.exp; this.syncExp();
      if (this.vm?.event(4, 14000000 + a.rec.id)) this.openDialog();
      const [g0, g1] = a.stats.gold; this.ground.push({ x: a.x, y: a.y, gold: g0 + Math.floor(Math.random() * (g1 - g0 + 1)) });
    }
  }
  private blocked(x: number, y: number) {
    return this.map.blockedReal(x, y) || this.actors.some(a => a.solid && Math.hypot(a.x - x, (a.y - y) * 1.6) < a.radius);
  }
  update(dt: number) {
    this.dev();
    this.checkExit();
    if ((this.saveT += dt) > 10000 && !this.dead && !this.leaving) { this.saveT = 0; this.save(); }
    for (const a of this.actors) a.update(dt, this.actorCtx);
    this.actors = this.actors.filter(a => !(a.enemy && a.state === 'die' && a.deadT > 6000));
    for (const f of this.floaters) f.t += dt; this.floaters = this.floaters.filter(f => f.t < 900);
    if (this.banner && (this.banner.t += dt) > 5000) this.banner = null;
    const inp = this.app.input, keys = inp.keys, p = this.player, hud = this.hud;
    if (inp.pressed.has('g') || inp.pressed.has('f1')) this.debug = !this.debug;
    if (inp.pressed.has('r')) hud.running = !hud.running;
    if (inp.pressed.has('c')) this.win.status = !this.win.status;
    if (inp.pressed.has('i')) this.win.item = !this.win.item;
    if (inp.pressed.has('escape')) { if (this.win.status || this.win.item) this.win.status = this.win.item = false; else this.paused = !this.paused; }
    if (inp.clicked) {
      const b = this.gui.button(inp.x, inp.y);
      if (this.paused) { if (inp.y > 215 && inp.y < 235) { this.save(); TitleScene.create(this.app).then(t => this.app.go(t)); } else this.paused = false; }
      else if (this.win.entryAt(inp.x, inp.y)) this.win.inv.toggleEquip(this.win.entryAt(inp.x, inp.y)!);
      else if (b === 'status') this.win.status = !this.win.status;
      else if (b === 'item') this.win.item = !this.win.item;
      else if (b === 'menu') this.paused = true;
    }
    if (this.paused) return;
    if (this.dead) {
      this.player.t += dt;
      if (inp.clicked && this.player.t > 800) { this.dead = false; Object.assign(this.player, { x: this.spawnPos.x, y: this.spawnPos.y, anim: ANIM_IDLE, t: 0 }); this.hud.hp = this.hud.hpMax; }
      return;
    }
    if (this.dlg) { this.updateDialog(); return; }
    if (this.vm && (this.pollT += dt) > 500) { this.pollT = 0; this.vm.poll(); if (this.vm.pending) this.openDialog(); }
    const hov = inp.y < HUD_Y && !this.win.overUI(inp.x, inp.y) ? this.actors.find(a => a.hit(inp.x + this.camX, inp.y + this.camY)) : undefined;
    const gh = !hov && inp.y < HUD_Y && !this.win.overUI(inp.x, inp.y) ? this.groundAt(inp.x + this.camX, inp.y + this.camY) : undefined;
    const zov = !hov && !gh && inp.y < HUD_Y && !this.win.overUI(inp.x, inp.y) ? this.zones.find(z => z.hit(inp.x + this.camX, inp.y + this.camY)) : undefined;
    if (hov?.enemy && (inp.clicked || inp.down)) this.target = hov;
    else if (inp.clicked && hov) this.talkTo(hov); else if (inp.clicked && gh) this.pickUp(gh);
    else if (inp.clicked && zov) this.useZone(zov);
    else if (inp.clicked) this.target = null;
    if (this.target && !this.target.alive) this.target = null;
    let dx = 0, dy = 0;
    if (keys.has('a') || keys.has('arrowleft')) dx--;
    if (keys.has('d') || keys.has('arrowright')) dx++;
    if (keys.has('w') || keys.has('arrowup')) dy--;
    if (keys.has('s') || keys.has('arrowdown')) dy++;
    let vx = dx, vy = dy;
    if (!dx && !dy && inp.down && !hov && !gh && inp.y < HUD_Y && !this.win.overUI(inp.x, inp.y) && !this.gui.button(inp.x, inp.y)) {
      // walk towards the mouse pointer (screen space, relative to the player)
      const mx = inp.x - (p.x - this.camX), my = inp.y - (p.y - this.camY), d = Math.hypot(mx, my);
      if (d > 6) { vx = mx / d; vy = my / d; }
    }
    const atk = this.atkT >= 0;
    if (!dx && !dy && this.target) {
      const tx = this.target.x - p.x, ty = this.target.y - p.y, td = Math.hypot(tx, ty * 1.6), tl = Math.hypot(tx, ty) || 1;
      if (!atk) p.dir = actorDir(tx, ty);
      if (td > 58 && !atk) { vx = tx / tl; vy = ty / tl; } else { vx = vy = 0; if (!atk) { this.atkT = 0; this.atkHit = false; p.anim = 3; p.t = 0; } }
    } else if (dx || dy) this.target = null;
    if (this.atkT >= 0) { vx = vy = 0; }
    if (vx || vy) {
      const run = keys.has('shift') || hud.running, n = Math.hypot(vx, vy), sp = (run ? 0.30 : 0.16) * dt;
      p.dir = dirIndex(vx, vy);
      const nx = p.x + vx / n * sp, ny = p.y + vy / n * sp;
      // slide along obstacles: try both axes, then each alone
      if (!this.blocked(nx, ny)) { p.x = nx; p.y = ny; }
      else if (!this.blocked(nx, p.y)) p.x = nx;
      else if (!this.blocked(p.x, ny)) p.y = ny;
      const na = run ? ANIM_RUN : ANIM_WALK; if (na !== p.anim) { p.anim = na; p.t = 0; }
    } else if (this.atkT < 0 && p.anim !== ANIM_IDLE) { p.anim = ANIM_IDLE; p.t = 0; }
    p.t += dt;
    if (this.atkT >= 0) {
      const fr = this.caf.anims[3].dirs[p.dir].frames || 11, dur = fr * FRAME_MS * 100 / Math.max(30, this.win.stats().speed);
      if (!this.atkHit && p.t >= dur * 0.45) { this.atkHit = true; if (this.target?.alive) this.hurtEnemy(this.target); }
      if (p.t >= dur) { this.atkT = -1; p.anim = ANIM_IDLE; p.t = 0; }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const p = this.player, map = this.map, inp = this.app.input;
    this.camX = Math.round(Math.max(0, Math.min(map.realW - SCREEN_W, p.x - SCREEN_W / 2)));
    this.camY = Math.round(Math.max(0, Math.min(map.realH - HUD_Y, p.y - HUD_Y / 2)));
    const gd: Drawable[] = this.ground.map(g => ({ y: g.y, draw: (c: CanvasRenderingContext2D, cx: number, cy: number) => {
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(g.x - cx, g.y - cy, 14, 7, 0, 0, 7); c.fill();
      if (g.item) this.win.drawIcon(c, g.item, g.x - cx, g.y - cy - 10, 0.5); else this.text.drawCenter(c, `${g.gold}G`, g.x - cx, g.y - cy - 14);
    } }));
    map.draw(ctx, this.camX, this.camY, SCREEN_W, HUD_Y, [this.drawPlayer, ...this.actors, ...this.zones.filter(z => z.drawn), ...gd]);
    for (const f of this.floaters) this.text.drawCenter(ctx, f.s, Math.round(f.x - this.camX), Math.round(f.y - this.camY - f.t / 25));
    if (this.banner) { const w = this.banner.text.length * 6 + 24; ctx.fillStyle = 'rgba(8,8,24,0.85)'; ctx.fillRect(320 - w / 2, 20, w, 24); ctx.strokeStyle = '#a89868'; ctx.strokeRect(320 - w / 2 + 0.5, 20.5, w - 1, 23); this.text.drawCenter(ctx, this.banner.text, 320, 26); }
    if (this.debug) { map.drawJudge(ctx, this.camX, this.camY, SCREEN_W, HUD_Y); this.text.draw(ctx, `${Math.round(p.x)},${Math.round(p.y)}`, 4, 2); }
    const hov = inp.y < HUD_Y ? this.actors.find(a => a.hit(inp.x + this.camX, inp.y + this.camY)) : undefined;
    const gh = !hov && inp.y < HUD_Y ? this.groundAt(inp.x + this.camX, inp.y + this.camY) : undefined;
    if (gh) this.text.drawCenter(ctx, gh.item ? gh.item.name : `${gh.gold} Gold`, Math.round(gh.x - this.camX), Math.round(gh.y - this.camY - 30));
    if (hov) this.text.drawCenter(ctx, hov.name, Math.round(hov.x - this.camX), Math.round(hov.y - this.camY - 84));
    ctx.fillStyle = '#000'; ctx.fillRect(0, HUD_Y, SCREEN_W, SCREEN_H - HUD_Y);
    this.win.draw(ctx, this.hud, this.name, inp.x, inp.y);
    this.gui.draw(ctx, this.hud);
    if (this.dlg) this.drawDialog(ctx);
    if (this.dead) { ctx.fillStyle = 'rgba(80,0,0,0.45)'; ctx.fillRect(0, 0, SCREEN_W, HUD_Y); this.text.drawCenter(ctx, 'YOU DIED', 320, 190); this.text.drawCenter(ctx, '(click to continue)', 320, 215); }
    if (this.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, SCREEN_W, HUD_Y);
      this.text.drawCenter(ctx, 'PAUSED', 320, 190); this.text.drawCenter(ctx, 'Exit to title', 320, 220); this.text.drawCenter(ctx, '(click elsewhere to resume)', 320, 245);
    }
    this.gui.cursor(ctx, inp.x, inp.y, inp.down);
  }
}
