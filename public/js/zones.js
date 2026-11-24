import { worldToReal } from './map.js';
/** A scripted map object: chests/barrels come as a closed + open pair at the same spot (script sentences 22/23 show/hide them); other types are invisible trigger zones. */
export class Zone {
    constructor(rec, set_, sdw) {
        this.rec = rec;
        this.set_ = set_;
        this.sdw = sdw;
        [this.x, this.y] = worldToReal(rec.a, rec.b);
        this.visible = rec.vis !== 0;
    }
    get drawn() { return this.visible && this.rec.pat >= 0 && !!this.set_; }
    draw(c, camX, camY) {
        if (!this.drawn)
            return;
        for (const s of [this.sdw, this.set_]) {
            const f = s?.pattern(this.rec.pat);
            if (!f)
                continue;
            c.drawImage(f.canvas, Math.round(this.x - camX + f.ox), Math.round(this.y - camY + f.oy));
        }
    }
    /** Click test against the sprite's bounding box. */
    hit(px, py) {
        const f = this.drawn ? this.set_.pattern(this.rec.pat) : null;
        if (!f)
            return false;
        const x = this.x + f.ox, y = this.y + f.oy;
        return px >= x && px < x + f.canvas.width && py >= y && py < y + f.canvas.height;
    }
}
export async function loadZones(app, recs) {
    if (!recs.some(r => r.pat >= 0))
        return recs.map(r => new Zone(r, null, null));
    const [set, sdw] = await Promise.all([app.set('data/ep1/objects/0'), app.set('data/ep1/objects/0_sdw')]);
    return recs.map(r => new Zone(r, set, sdw));
}
//# sourceMappingURL=zones.js.map