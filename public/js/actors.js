import { loadCaf } from './caf.js';
import { worldToReal } from './map.js';
import { loadZones } from './zones.js';
const FRAME_MS = 80;
/** Facing index (CAF direction order, guessed) for 8 compass sectors starting at "right" going clockwise on screen. */
const FACING = [6, 7, 0, 1, 2, 3, 4, 5];
export const dirIndex = (vx, vy) => FACING[(Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) + 8) % 8];
/** PLACEHOLDER stats (real values live in Control.aid / Table.Tbd, not decoded yet): ENEMY model -> hp, damage range, exp, gold range, speed px/ms. */
export const ENEMY_STATS = {
    1: { hp: 30, dmg: [3, 7], exp: 8, gold: [5, 25], speed: 0.07 },
    2: { hp: 45, dmg: [4, 9], exp: 12, gold: [8, 30], speed: 0.075 },
    5: { hp: 200, dmg: [8, 16], exp: 120, gold: [200, 400], speed: 0.09 },
};
const ANIM = { idle: 0, walk: 1, attack: 2, die: 3 };
/** Draw order of CAF layers (1 and 0 are the body for the player; higher ones are optional equipment/overlay variants). */
const LAYERS = [1, 0, 2, 3, 4, 5, 6];
/** Static/idle actor placed from Scenario.Mct (NPCs and partners). */
export class Actor {
    constructor(rec, set_, sdw, caf) {
        this.rec = rec;
        this.set_ = set_;
        this.sdw = sdw;
        this.caf = caf;
        this.t = Math.random() * 1000;
        this.hp = 0;
        this.maxHp = 0;
        this.state = 'idle';
        this.deadT = 0;
        this.hitDone = false;
        this.stats = ENEMY_STATS[1];
        [this.x, this.y] = worldToReal(rec.a, rec.b);
        this.dir = rec.dir % 9;
        if (rec.kind === 'enemy') {
            // PLACEHOLDER scaling of the per-model base by the Mct strength multiplier; bosses get a flat bonus.
            const b = ENEMY_STATS[rec.model] ?? ENEMY_STATS[1], k = rec.power ?? 1, bs = rec.boss !== undefined, r = Math.round;
            this.stats = { hp: r(b.hp * k * (bs ? 5 : 1)), dmg: [r(b.dmg[0] * Math.sqrt(k) * (bs ? 1.6 : 1)), r(b.dmg[1] * Math.sqrt(k) * (bs ? 1.6 : 1))], exp: r(b.exp * k * (bs ? 8 : 1)), gold: bs ? [b.gold[0] * 4, b.gold[1] * 4] : b.gold, speed: b.speed };
            this.hp = this.maxHp = this.stats.hp;
        }
    }
    get name() { return this.rec.name; }
    get enemy() { return this.rec.kind === 'enemy'; }
    get alive() { return !this.enemy || this.state !== 'die'; }
    get solid() { return this.alive; }
    /** Collision radius in real pixels (the Mct radius is in world units). */
    get radius() { return 22; }
    static async load(app, r) {
        const base = `data/ep1/actors/${r.kind}/${r.model}`;
        const [set, sdw, caf] = await Promise.all([app.set(base), app.set(base + '_sdw'), loadCaf(base + '.caf.json')]);
        return new Actor(r, set, sdw, caf);
    }
    set(st) { if (this.state !== st) {
        this.state = st;
        this.t = 0;
        this.hitDone = false;
    } }
    die() { this.set('die'); this.deadT = 0; }
    update(dt, c) {
        this.t += dt;
        if (!this.enemy || !c)
            return;
        if (this.state === 'die') {
            this.deadT += dt;
            return;
        }
        const dx = c.px - this.x, dy = (c.py - this.y) * 1.6, d = Math.hypot(dx, dy);
        const frames = this.caf.anims[ANIM.attack]?.dirs[this.dir]?.frames || 10;
        if (this.state === 'attack') {
            if (!this.hitDone && this.t >= frames * FRAME_MS * 0.5) {
                this.hitDone = true;
                if (d < 70)
                    c.hitPlayer(this.stats.dmg[0] + Math.floor(Math.random() * (this.stats.dmg[1] - this.stats.dmg[0] + 1)));
            }
            if (this.t >= frames * FRAME_MS)
                this.set('idle');
            return;
        }
        if (d < 46) {
            this.dir = dirIndex(dx, c.py - this.y);
            this.set('attack');
        }
        else if (d < 300) {
            this.dir = dirIndex(dx, c.py - this.y);
            this.set('walk');
            const sp = this.stats.speed * dt, nx = this.x + dx / d * sp, ny = this.y + (c.py - this.y) / Math.hypot(dx, c.py - this.y) * sp;
            if (!c.blocked(nx, ny)) {
                this.x = nx;
                this.y = ny;
            }
            else if (!c.blocked(nx, this.y))
                this.x = nx;
            else if (!c.blocked(this.x, ny))
                this.y = ny;
        }
        else
            this.set('idle');
    }
    draw(c, camX, camY) {
        const anim = this.enemy ? ANIM[this.state] : 0;
        const d = this.caf.anims[anim]?.dirs[this.dir];
        if (!d)
            return;
        const raw = Math.floor(this.t / FRAME_MS), fi = d.frames ? (this.state === 'die' ? Math.min(raw, d.frames - 1) : raw % d.frames) : 0;
        for (const s of [this.sdw, this.set_])
            for (const l of LAYERS) {
                const seq = d.layers[l];
                if (!seq || !seq.length)
                    continue;
                const f = s.pattern(seq[Math.min(fi, seq.length - 1)][1]);
                if (!f)
                    continue;
                c.drawImage(f.canvas, Math.round(this.x - camX + f.ox), Math.round(this.y - camY + f.oy));
            }
        if (this.enemy && this.alive && this.hp < this.maxHp) {
            const bx = Math.round(this.x - camX) - 16, by = Math.round(this.y - camY) - 72;
            c.fillStyle = '#000';
            c.fillRect(bx - 1, by - 1, 34, 5);
            c.fillStyle = '#c02020';
            c.fillRect(bx, by, Math.round(32 * this.hp / this.maxHp), 3);
        }
    }
    hit(px, py) { return this.alive && Math.abs(px - this.x) < 20 && py < this.y + 6 && py > this.y - 70; }
}
export async function loadScenarioActors(app, scenario) {
    const d = await (await fetch(`data/ep1/scenario/${scenario}.actors.json`)).json();
    return { map: d.map, actors: await Promise.all(d.actors.map(r => Actor.load(app, r))), zones: await loadZones(app, d.objects ?? []) };
}
//# sourceMappingURL=actors.js.map