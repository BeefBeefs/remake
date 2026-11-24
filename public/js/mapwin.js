import { put } from './app.js';
/** Explored cells are 64x64 real pixels; walking reveals a disc of REVEAL pixels around the hero. */
const CELL = 64, REVEAL = 352, SCALE = 0.25;
/** Interior of the frame (Game/Status pattern 71 is the 320x415 left-half frame). */
const IX = 16, IY = 40, IW = 288, IH = 358;
/** Map screen (N / Game Menu): overhead view of the explored parts of the current area; unexplored ground stays black. */
export class MapWindow {
    constructor(st, icon) {
        this.st = st;
        this.icon = icon;
        this.open = false;
        this.ox = 0;
        this.oy = 0;
        this.cells = new Map();
        this.pending = {};
        /** Mark the cells around the hero as explored (cheap: only runs when the hero changes cell). */
        this.last = '';
    }
    static async load(app) { return new MapWindow(await app.gui('Game_Status'), await app.gui('Game_MapIcon')); }
    grid(key, map) {
        let g = this.cells.get(key);
        const n = Math.ceil(map.realW / CELL) * Math.ceil(map.realH / CELL);
        if (!g || g.length !== n) {
            g = new Uint8Array(n);
            this.cells.set(key, g);
            const runs = this.pending[key];
            if (runs) {
                for (let i = 0; i < runs.length; i += 2)
                    g.fill(1, runs[i], Math.min(n, runs[i] + runs[i + 1]));
                delete this.pending[key];
            }
        }
        return g;
    }
    reveal(key, map, px, py) {
        const cx = Math.floor(px / CELL), cy = Math.floor(py / CELL), tag = `${key}:${cx},${cy}`;
        if (tag === this.last)
            return;
        this.last = tag;
        const g = this.grid(key, map), cols = Math.ceil(map.realW / CELL), rows = Math.ceil(map.realH / CELL), r = Math.ceil(REVEAL / CELL);
        for (let y = Math.max(0, cy - r); y <= Math.min(rows - 1, cy + r); y++)
            for (let x = Math.max(0, cx - r); x <= Math.min(cols - 1, cx + r); x++)
                if (Math.hypot((x + 0.5) * CELL - px, (y + 0.5) * CELL - py) <= REVEAL)
                    g[y * cols + x] = 1;
    }
    encode() {
        const out = { ...this.pending };
        for (const [k, g] of this.cells) {
            const runs = [];
            for (let i = 0; i < g.length;) {
                if (!g[i]) {
                    i++;
                    continue;
                }
                let j = i;
                while (j < g.length && g[j])
                    j++;
                runs.push(i, j - i);
                i = j;
            }
            if (runs.length)
                out[k] = runs;
        }
        return out;
    }
    decode(s) {
        this.cells.clear();
        this.pending = s ? { ...s } : {}; // expanded lazily: the grid size depends on the map
    }
    recenter() { this.ox = this.oy = 0; }
    /** Arrow keys scroll the view, Enter returns to the hero (the manual's controls). */
    update(dt, keys, pressed) {
        if (!this.open)
            return;
        if (pressed.has('enter'))
            this.ox = this.oy = 0;
        const sp = 0.6 * dt;
        if (keys.has('arrowleft'))
            this.ox -= sp;
        if (keys.has('arrowright'))
            this.ox += sp;
        if (keys.has('arrowup'))
            this.oy -= sp;
        if (keys.has('arrowdown'))
            this.oy += sp;
        const lim = 6000;
        this.ox = Math.max(-lim, Math.min(lim, this.ox));
        this.oy = Math.max(-lim, Math.min(lim, this.oy));
    }
    draw(ctx, text, key, map, area, px, py) {
        const camX = Math.round(px + this.ox - IW / SCALE / 2), camY = Math.round(py + this.oy - IH / SCALE / 2);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 320, 416);
        ctx.save();
        ctx.beginPath();
        ctx.rect(IX, IY, IW, IH);
        ctx.clip();
        ctx.translate(IX, IY);
        ctx.scale(SCALE, SCALE);
        const g = this.grid(key, map), cols = Math.ceil(map.realW / CELL), rows = Math.ceil(map.realH / CELL), vw = IW / SCALE, vh = IH / SCALE;
        const x0 = Math.max(0, Math.floor(camX / CELL)), x1 = Math.min(cols - 1, Math.floor((camX + vw) / CELL)), y0 = Math.max(0, Math.floor(camY / CELL)), y1 = Math.min(rows - 1, Math.floor((camY + vh) / CELL));
        ctx.beginPath();
        let any = false;
        for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++)
                if (g[y * cols + x]) {
                    ctx.rect(x * CELL - camX, y * CELL - camY, CELL, CELL);
                    any = true;
                }
        if (any) {
            ctx.clip();
            ctx.imageSmoothingEnabled = true;
            map.draw(ctx, camX, camY, vw, vh, []);
            ctx.imageSmoothingEnabled = false;
        }
        ctx.restore();
        put(ctx, this.st, 71);
        // hero marker (MapIcon pattern 0: small blue arrow whose tip is the position)
        const mx = IX + (px - camX) * SCALE, my = IY + (py - camY) * SCALE;
        if (mx > IX && mx < IX + IW && my > IY && my < IY + IH) {
            const f = this.icon.pattern(0);
            if (f)
                ctx.drawImage(f.canvas, Math.round(mx + f.ox), Math.round(my + f.oy));
        }
        text.draw(ctx, area || 'Unknown area', 56, 52);
        text.draw(ctx, 'MAP', 22, 52);
        text.drawCenter(ctx, 'Arrows: scroll   Enter: back to hero', 160, 382);
    }
}
//# sourceMappingURL=mapwin.js.map