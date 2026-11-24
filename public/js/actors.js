import { loadCaf } from './caf.js';
import { worldToReal } from './map.js';
const FRAME_MS = 80;
/** Draw order of CAF layers (1 and 0 are the body for the player; higher ones are optional equipment/overlay variants). */
const LAYERS = [1, 0, 2, 3, 4, 5, 6];
/** Static/idle actor placed from Scenario.Mct (NPCs and partners). */
export class Actor {
    constructor(rec, set, sdw, caf) {
        this.rec = rec;
        this.set = set;
        this.sdw = sdw;
        this.caf = caf;
        this.t = Math.random() * 1000;
        this.anim = 0;
        [this.x, this.y] = worldToReal(rec.a, rec.b);
        this.dir = rec.dir % 9;
    }
    get name() { return this.rec.name; }
    /** Collision radius in real pixels (the Mct radius is in world units). */
    get radius() { return 22; }
    static async load(app, r) {
        const base = `data/ep1/actors/${r.kind}/${r.model}`;
        const [set, sdw, caf] = await Promise.all([app.set(base), app.set(base + '_sdw'), loadCaf(base + '.caf.json')]);
        return new Actor(r, set, sdw, caf);
    }
    update(dt) { this.t += dt; }
    draw(c, camX, camY) {
        const d = this.caf.anims[this.anim]?.dirs[this.dir];
        if (!d)
            return;
        const fi = d.frames ? Math.floor(this.t / FRAME_MS) % d.frames : 0;
        for (const s of [this.sdw, this.set])
            for (const l of LAYERS) {
                const seq = d.layers[l];
                if (!seq || !seq.length)
                    continue;
                const f = s.pattern(seq[Math.min(fi, seq.length - 1)][1]);
                if (!f)
                    continue;
                c.drawImage(f.canvas, Math.round(this.x - camX + f.ox), Math.round(this.y - camY + f.oy));
            }
    }
    hit(px, py) { return Math.abs(px - this.x) < 20 && py < this.y + 6 && py > this.y - 70; }
}
export async function loadActors(app, scenario) {
    const recs = await (await fetch(`data/ep1/scenario/${scenario}.actors.json`)).json();
    return Promise.all(recs.map(r => Actor.load(app, r)));
}
//# sourceMappingURL=actors.js.map