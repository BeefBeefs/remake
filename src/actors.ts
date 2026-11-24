import { SpriteSet } from './sprites.js';
import { loadCaf, Caf } from './caf.js';
import { Drawable, worldToReal } from './map.js';
import { Zone, ZoneRec, loadZones } from './zones.js';
import type { App } from './app.js';

export interface ActorRec { name: string; kind: 'people' | 'partner' | 'enemy'; model: number; id: number; a: number; b: number; dir: number; radius: number; /** enemies: strength multiplier from Mct (1000-based head[4]) and boss id when the record is a boss */ power?: number; boss?: number; col?: string; /** per-monster parameters from the Mct record (tools/mct.py): hit points, attack power, speed %, drop chance %, drop level (-1 = none) */ st?: { hp: number; atk: number; spd: number; drop: number; dlv: number; exp: number; gold: number }; }
const FRAME_MS = 80;
/** Facing index (CAF direction order, guessed) for 8 compass sectors starting at "right" going clockwise on screen. */
const FACING = [6, 7, 0, 1, 2, 3, 4, 5];
export const dirIndex = (vx: number, vy: number) => FACING[(Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) + 8) % 8];
/** PLACEHOLDER stats (real values live in Control.aid / Table.Tbd, not decoded yet): ENEMY model -> hp, damage range, exp, gold range, speed px/ms. */
export const ENEMY_STATS: Record<number, { hp: number; dmg: [number, number]; exp: number; gold: [number, number]; speed: number }> = {
  1: { hp: 30, dmg: [3, 7], exp: 8, gold: [5, 25], speed: 0.07 },
  2: { hp: 45, dmg: [4, 9], exp: 12, gold: [8, 30], speed: 0.075 },
  5: { hp: 200, dmg: [8, 16], exp: 120, gold: [200, 400], speed: 0.09 },
};
export interface ActorCtx { px: number; py: number; blocked(x: number, y: number): boolean; hitPlayer(dmg: number): void; }
type State = 'idle' | 'walk' | 'attack' | 'die';
const ANIM: Record<State, number> = { idle: 0, walk: 1, attack: 2, die: 3 };
/** Draw order of CAF layers (1 and 0 are the body for the player; higher ones are optional equipment/overlay variants). */
const LAYERS = [1, 0, 2, 3, 4, 5, 6];

/** Static/idle actor placed from Scenario.Mct (NPCs and partners). */
export class Actor implements Drawable {
  x: number; y: number; dir: number; t = Math.random() * 1000;
  hp = 0; maxHp = 0; state: State = 'idle'; deadT = 0; private hitDone = false;
  stats = ENEMY_STATS[1];
  private constructor(public rec: ActorRec, private set_: SpriteSet, private sdw: SpriteSet, private caf: Caf) {
    [this.x, this.y] = worldToReal(rec.a, rec.b); this.dir = rec.dir % 9;
    if (rec.kind === 'enemy') {
      // PLACEHOLDER scaling of the per-model base by the Mct strength multiplier; bosses get a flat bonus.
      const b = ENEMY_STATS[rec.model] ?? ENEMY_STATS[1], k = rec.power ?? 1, bs = rec.boss !== undefined, r = Math.round;
      this.stats = { hp: r(b.hp * k * (bs ? 5 : 1)), dmg: [r(b.dmg[0] * Math.sqrt(k) * (bs ? 1.6 : 1)), r(b.dmg[1] * Math.sqrt(k) * (bs ? 1.6 : 1))], exp: r(b.exp * k * (bs ? 8 : 1)), gold: bs ? [b.gold[0] * 4, b.gold[1] * 4] : b.gold, speed: b.speed };
      const st = rec.st;
      if (st && !this.gen) {
        // Hit points, attack, speed, exp and the gold figure come from the Mct record (Mct power multiplier on top of hp/attack); the gold spread of +-50% around the record value is a guess.
        const hp = Math.max(1, r(st.hp * k)), at = st.atk * Math.sqrt(k), noLoot = st.dlv < 0;
        this.stats = { hp, dmg: [Math.max(1, r(at * 0.7)), Math.max(1, r(at * 1.3))], exp: st.exp, gold: noLoot ? [0, 0] : [r(st.gold * 0.5), r(st.gold * 1.5)], speed: 0.07 * st.spd / 170 };
      }
      if (this.gen) this.stats = { hp: 80, dmg: [0, 0], exp: 30, gold: [0, 0], speed: 0 };   // PLACEHOLDER hp for the Enemy Hole generators
      this.hp = this.maxHp = this.stats.hp;
    }
  }
  /** "Enemy Hole" monster generator (Mct boss-A record with model -1): no sprite of its own (the room's zone objects draw the hole), just a killable hit box that scripts read via operand 3. */
  get gen() { return this.rec.model < 0; }
  get name() { return this.rec.name; }
  get enemy() { return this.rec.kind === 'enemy'; }
  /** Hidden by script sentence 23 (e.g. partner NPCs that are following the player). */
  hidden = false;
  /** Member of a scripted monster group (sentences 25/31/32): dormant until the script summons it, reusable after death. */
  slot = false;
  get alive() { return !this.hidden && (!this.enemy || this.state !== 'die'); }
  get solid() { return this.alive; }
  /** Collision radius in real pixels (the Mct radius is in world units). */
  get radius() { return 22; }
  static async load(app: App, r: ActorRec) {
    if (r.model < 0) return new Actor(r, null as unknown as SpriteSet, null as unknown as SpriteSet, null as unknown as Caf);
    const base = `data/ep1/actors/${r.kind}/${r.model}`;
    const [set, sdw, caf] = await Promise.all([app.set(base), app.set(base + '_sdw'), loadCaf(base + '.caf.json')]);
    return new Actor(r, set, sdw, caf);
  }
  private set(st: State) { if (this.state !== st) { this.state = st; this.t = 0; this.hitDone = false; } }
  /** Bring a dormant/dead slot monster into the world at real position (x, y). */
  revive(x: number, y: number) { this.x = x; this.y = y; this.hp = this.maxHp; this.hidden = false; this.deadT = 0; this.set('idle'); this.state = 'idle'; }
  /** A slot is free when its monster is hidden or dead (sentence 32). */
  get free() { return this.hidden || this.state === 'die'; }
  die() { this.set('die'); this.deadT = 0; }
  update(dt: number, c?: ActorCtx) {
    this.t += dt;
    if (this.hidden || !this.enemy || !c || this.gen) return;
    if (this.state === 'die') { this.deadT += dt; return; }
    const dx = c.px - this.x, dy = (c.py - this.y) * 1.6, d = Math.hypot(dx, dy);
    const frames = this.caf.anims[ANIM.attack]?.dirs[this.dir]?.frames || 10;
    if (this.state === 'attack') {
      if (!this.hitDone && this.t >= frames * FRAME_MS * 0.5) { this.hitDone = true; if (d < 70) c.hitPlayer(this.stats.dmg[0] + Math.floor(Math.random() * (this.stats.dmg[1] - this.stats.dmg[0] + 1))); }
      if (this.t >= frames * FRAME_MS) this.set('idle');
      return;
    }
    if (d < 46) { this.dir = dirIndex(dx, c.py - this.y); this.set('attack'); }
    else if (d < 300) {
      this.dir = dirIndex(dx, c.py - this.y); this.set('walk');
      const sp = this.stats.speed * dt, nx = this.x + dx / d * sp, ny = this.y + (c.py - this.y) / Math.hypot(dx, c.py - this.y) * sp;
      if (!c.blocked(nx, ny)) { this.x = nx; this.y = ny; } else if (!c.blocked(nx, this.y)) this.x = nx; else if (!c.blocked(this.x, ny)) this.y = ny;
    } else this.set('idle');
  }
  draw(c: CanvasRenderingContext2D, camX: number, camY: number) {
    if (this.hidden) return;
    if (this.gen) { this.bar(c, camX, camY, -40); return; }
    const anim = this.enemy ? ANIM[this.state] : 0;
    const d = this.caf.anims[anim]?.dirs[this.dir]; if (!d) return;
    const raw = Math.floor(this.t / FRAME_MS), fi = d.frames ? (this.state === 'die' ? Math.min(raw, d.frames - 1) : raw % d.frames) : 0;
    for (const s of [this.sdw, this.set_]) for (const l of LAYERS) {
      const seq = d.layers[l]; if (!seq || !seq.length) continue;
      const f = s.pattern(seq[Math.min(fi, seq.length - 1)][1]); if (!f) continue;
      c.drawImage(f.canvas, Math.round(this.x - camX + f.ox), Math.round(this.y - camY + f.oy));
    }
    this.bar(c, camX, camY, -72);
  }
  private bar(c: CanvasRenderingContext2D, camX: number, camY: number, dy: number) {
    if (!this.enemy || !this.alive || this.hp >= this.maxHp) return;
    const bx = Math.round(this.x - camX) - 16, by = Math.round(this.y - camY) + dy;
    c.fillStyle = '#000'; c.fillRect(bx - 1, by - 1, 34, 5); c.fillStyle = '#c02020'; c.fillRect(bx, by, Math.round(32 * this.hp / this.maxHp), 3);
  }
  hit(px: number, py: number) { if (this.gen) return this.alive && Math.abs(px - this.x) < 55 && Math.abs(py - this.y) < 40; return this.alive && Math.abs(px - this.x) < 20 && py < this.y + 6 && py > this.y - 70; }
}
export async function loadScenarioActors(app: App, scenario: string): Promise<{ map: string | null; actors: Actor[]; zones: Zone[] }> {
  const d: { map: string | null; actors: ActorRec[]; objects?: ZoneRec[] } = await (await fetch(`data/ep1/scenario/${scenario}.actors.json`)).json();
  return { map: d.map, actors: await Promise.all(d.actors.map(r => Actor.load(app, r))), zones: await loadZones(app, d.objects ?? []) };
}
