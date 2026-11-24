import { Data } from './data.js';
import { loadCaf } from './caf.js';
import { dirIndex } from './actors.js';
/**
 * Companion dogs. Table.Tbd 60 = one row per dog `(0, model, a, b, c, 1, 1)` plus the dog's name (a, b, c = 400..1000 per mille multipliers).
 * GUESSES (nothing of the real companion stat code was found): a/b/c scale max HP / attack / defence, base values and growth below,
 * Meat (Item.Ibn field 31 = 500 / 1000 / 2000 / 3000) heals field / 10 HP, level = 1 + kills / 6 capped by the hero's level.
 * Animations (partner CAF): 0 idle, 1 run, 3 bite, 5 dash attack, 8 hit, 10 jump kick (model 2 has fewer animations -> falls back).
 */
const ANIM = { idle: 0, walk: 1, attack: 3, dash: 5, jump: 10 };
const MODEL_OF = [0, 1, 2, 0]; // dog index -> sprite model as placed by the scenarios (0-3); Harley / Hawk use table column 1
const FRAME_MS = 60, LAYERS = [1, 0, 2, 3, 4, 5, 6];
export class Pet {
    constructor(idx, name, mult, set_, sdw, caf, x, y) {
        this.idx = idx;
        this.name = name;
        this.mult = mult;
        this.set_ = set_;
        this.sdw = sdw;
        this.caf = caf;
        this.dir = 0;
        this.t = 0;
        this.state = 'idle';
        this.mode = 'active';
        this.hp = 1;
        this.kills = 0;
        this.heroLevel = 1;
        this.tgt = null;
        this.hitDone = false;
        this.from = { x: 0, y: 0 };
        this.to = { x: 0, y: 0 };
        this.dur = 1;
        this.done = null;
        this.dashHit = new Set();
        this.cmdT = 0;
        this.fetchTo = null;
        /** Companion HP / Attack / Defense lines of the hero's worn gear (set every frame by the game). */
        this.gear = { hp: 0, atk: 0, def: 0, hit: 0, eva: 0, matk: 0, mhit: 0, mdef: 0, meva: 0 };
        this.x = x;
        this.y = y;
        this.hp = this.maxHp;
    }
    static async load(app, tables, idx, x, y) {
        const t = tables['60'], row = t ? t.v.slice(idx * t.cols, idx * t.cols + t.cols) : [0, 0, 1000, 1000, 1000], name = t?.s?.[idx * t.cols] || `Dog ${idx}`;
        const model = idx < MODEL_OF.length ? MODEL_OF[idx] : row[1] ?? 0, base = Data.url(`actors/partner/${model}`);
        const [set, sdw, caf] = await Promise.all([app.set(base), app.set(base + '_sdw'), loadCaf(base + '.caf.json')]);
        return new Pet(idx, name, [row[2] ?? 1000, row[3] ?? 1000, row[4] ?? 1000], set, sdw, caf, x, y);
    }
    get dead() { return this.hp <= 0; }
    get level() { return Math.max(1, Math.min(this.heroLevel, 1 + Math.floor(this.kills / 6))); }
    get maxHp() { return Math.max(1, Math.round((100 + 30 * (this.level - 1)) * this.mult[0] / 1000) + this.gear.hp); }
    get attack() { return (10 + 3 * (this.level - 1)) * this.mult[1] / 1000 + this.gear.atk; }
    get defense() { return Math.round((2 + 1.5 * (this.level - 1)) * this.mult[2] / 1000) + this.gear.def; }
    get busy() { return this.state === 'attack' || this.state === 'jump' || this.state === 'dash'; }
    dmg(k = 1) { return Math.max(1, Math.round(this.attack * k * (9 + Math.floor(Math.random() * 3)) / 10)); }
    /** Damage taken from a monster. Returns the final amount. */
    take(raw) { const d = Math.max(1, Math.round(raw) - this.defense); this.hp = Math.max(0, this.hp - d); if (this.dead) {
        this.state = 'dead';
        this.tgt = null;
        this.fetchTo = null;
        this.done = null;
    } return d; }
    /** Meat: restores HP (and revives a fallen dog). */
    feed(hp) { this.hp = Math.min(this.maxHp, this.hp + hp); if (this.state === 'dead') {
        this.state = 'idle';
        this.t = 0;
    } }
    toggleMode() { this.mode = this.mode === 'active' ? 'inactive' : 'active'; this.tgt = null; return this.mode; }
    addKill() { this.kills++; }
    statusLines() { const g = this.gear; return [`${this.name}   Lv.${this.level}`, ` `, `HP ${Math.round(this.hp)}/${this.maxHp}`, `Attack ${Math.round(this.attack)}   Defense ${this.defense}`, `Hit Rate +${Math.round(g.hit)}   Evasion +${Math.round(g.eva)}`, `Monsters defeated ${this.kills}   Mode ${this.mode.toUpperCase()}`, ` `, `  ~OK~`]; }
    // ---- commands from the player (TAB + click) ----
    /** Jump kick to (x, y); `onLand` runs after landing (switches). Returns false when the dog cannot jump now. */
    jumpTo(x, y, enemy, onLand, blocked) {
        if (this.dead || this.busy || (blocked && blocked(x, y)))
            return false;
        this.state = 'jump';
        this.t = 0;
        this.hitDone = false;
        this.from = { x: this.x, y: this.y };
        this.to = { x, y };
        this.tgt = enemy;
        this.done = onLand ?? null;
        this.dir = dirIndex(x - this.x, y - this.y);
        this.dur = (this.caf.anims[ANIM.jump]?.dirs[0]?.frames || 14) * FRAME_MS;
        return true;
    }
    dash(dx, dy) {
        if (this.dead || this.busy)
            return false;
        const d = Math.hypot(dx, dy) || 1;
        this.dir = dirIndex(dx, dy);
        this.state = 'dash';
        this.t = 0;
        this.dashHit.clear();
        this.from = { x: this.x, y: this.y };
        this.to = { x: this.x + dx / d * 260, y: this.y + dy / d * 260 };
        this.dur = 560;
        return true;
    }
    fetch(x, y, done) { if (this.dead)
        return false; this.fetchTo = { x, y, done }; this.cmdT = 0; this.tgt = null; return true; }
    anim() { const a = this.state === 'attack' ? ANIM.attack : this.state === 'jump' ? ANIM.jump : this.state === 'dash' ? ANIM.dash : this.state === 'walk' ? ANIM.walk : ANIM.idle; return this.caf.anims[a]?.dirs[this.dir]?.frames ? a : this.caf.anims[ANIM.dash]?.dirs[this.dir]?.frames && this.state === 'jump' ? ANIM.dash : ANIM.idle; }
    step(tx, ty, speed, dt, c) {
        const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1, s = Math.min(d, speed * dt), nx = this.x + dx / d * s, ny = this.y + dy / d * s;
        this.dir = dirIndex(dx, dy);
        if (!c.blocked(nx, ny)) {
            this.x = nx;
            this.y = ny;
        }
        else if (!c.blocked(nx, this.y))
            this.x = nx;
        else if (!c.blocked(this.x, ny))
            this.y = ny;
    }
    setState(s) { if (this.state !== s) {
        this.state = s;
        this.t = 0;
        this.hitDone = false;
    } }
    update(dt, c) {
        this.t += dt;
        if (this.dead) {
            this.state = 'dead';
            return;
        }
        if (this.state === 'jump' || this.state === 'dash') {
            const p = Math.min(1, this.t / this.dur);
            if (this.state === 'jump') {
                const nx = this.from.x + (this.to.x - this.from.x) * p, ny = this.from.y + (this.to.y - this.from.y) * p;
                this.x = nx;
                this.y = ny;
                if (!this.hitDone && p >= 0.8) {
                    this.hitDone = true;
                    const e = this.tgt && this.tgt.alive ? this.tgt : c.enemies().find(a => Math.hypot(a.x - this.x, (a.y - this.y) * 1.6) < 60);
                    if (e)
                        c.hit(e, this.dmg(1.5));
                }
            }
            else {
                const nx = this.from.x + (this.to.x - this.from.x) * p, ny = this.from.y + (this.to.y - this.from.y) * p;
                if (!c.blocked(nx, ny)) {
                    this.x = nx;
                    this.y = ny;
                }
                else
                    this.t = this.dur;
                for (const a of c.enemies())
                    if (!this.dashHit.has(a) && Math.hypot(a.x - this.x, (a.y - this.y) * 1.6) < 46) {
                        this.dashHit.add(a);
                        c.hit(a, this.dmg(1.25));
                    }
            }
            if (this.t >= this.dur) {
                this.setState('idle');
                const f = this.done;
                this.done = null;
                f?.();
            }
            return;
        }
        if (this.state === 'attack') {
            const frames = this.caf.anims[ANIM.attack]?.dirs[this.dir]?.frames || 13, dur = frames * FRAME_MS;
            if (!this.hitDone && this.t >= dur * 0.45) {
                this.hitDone = true;
                if (this.tgt?.alive && Math.hypot(this.tgt.x - this.x, (this.tgt.y - this.y) * 1.6) < 80)
                    c.hit(this.tgt, this.dmg());
            }
            if (this.t >= dur)
                this.setState('idle');
            return;
        }
        // fetch command (pick up an item for the player)
        if (this.fetchTo) {
            this.cmdT += dt;
            const f = this.fetchTo;
            if (Math.hypot(f.x - this.x, (f.y - this.y) * 1.6) < 26 || this.cmdT > 6000) {
                this.fetchTo = null;
                if (this.cmdT <= 6000)
                    f.done();
            }
            else {
                this.setState('walk');
                this.step(f.x, f.y, 0.3, dt, c);
                return;
            }
        }
        const pd = Math.hypot(c.px - this.x, (c.py - this.y) * 1.6);
        if (pd > 900) {
            for (const [ox, oy] of [[60, 20], [-60, 20], [0, 60], [0, -50]])
                if (!c.blocked(c.px + ox, c.py + oy)) {
                    this.x = c.px + ox;
                    this.y = c.py + oy;
                    break;
                }
            return;
        }
        // ACTIVE: pick and fight the nearest awake monster near the hero
        if (this.mode === 'active') {
            if (!this.tgt || !this.tgt.alive) {
                let best = 1e9;
                this.tgt = null;
                for (const a of c.enemies()) {
                    const d = Math.hypot(a.x - this.x, (a.y - this.y) * 1.6);
                    if (d < 280 && d < best && Math.hypot(a.x - c.px, (a.y - c.py) * 1.6) < 450) {
                        best = d;
                        this.tgt = a;
                    }
                }
            }
            if (this.tgt) {
                const dx = this.tgt.x - this.x, dy = this.tgt.y - this.y, d = Math.hypot(dx, dy * 1.6);
                if (d < 52) {
                    this.dir = dirIndex(dx, dy);
                    this.setState('attack');
                }
                else {
                    this.setState('walk');
                    this.step(this.tgt.x, this.tgt.y, 0.28, dt, c);
                }
                return;
            }
        }
        else if (this.hp < this.maxHp)
            this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.01 * dt / 1000); // INACTIVE: HP recovers (manual, version 1.004)
        // follow the hero
        if (pd > 120) {
            this.setState('walk');
            this.step(c.px + (this.x < c.px ? -50 : 50), c.py + 20, pd > 260 ? 0.34 : 0.22, dt, c);
        }
        else if (pd < 80 || this.state === 'walk') {
            if (pd < 80)
                this.setState('idle');
            else
                this.step(c.px, c.py + 20, 0.22, dt, c);
        }
    }
    draw(c, camX, camY) {
        const a = this.anim(), d = this.caf.anims[a]?.dirs[this.dir];
        if (!d)
            return;
        const raw = Math.floor(this.t / FRAME_MS), fi = d.frames ? (this.state === 'jump' || this.state === 'dash' ? Math.min(Math.floor(this.t / this.dur * d.frames), d.frames - 1) : raw % d.frames) : 0;
        const air = this.state === 'jump' ? Math.sin(Math.min(1, this.t / this.dur) * Math.PI) * 40 : 0;
        if (this.dead)
            c.globalAlpha = 0.45;
        for (const s of [this.sdw, this.set_])
            for (const l of LAYERS) {
                const seq = d.layers[l];
                if (!seq || !seq.length)
                    continue;
                const f = s.pattern(seq[Math.min(fi, seq.length - 1)][1]);
                if (!f)
                    continue;
                c.drawImage(f.canvas, Math.round(this.x - camX + f.ox), Math.round(this.y - camY + f.oy - (s === this.sdw ? 0 : air)));
            }
        c.globalAlpha = 1;
    }
    hit(px, py) { return Math.abs(px - this.x) < 26 && py < this.y + 8 && py > this.y - 46; }
    save(others) { return { idx: this.idx, kills: this.kills, hp: Math.round(this.hp), mode: this.mode, others: [...others] }; }
}
//# sourceMappingURL=companion.js.map