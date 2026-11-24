import { Data } from './data.js';
import { SpriteSet } from './sprites.js';
/** World (iso) -> real pixel conversion used by RKC_RPGSCRN (defaults 15 / 10). */
export const worldToReal = (wx, wy) => [Math.trunc((wx - wy) * 15 / 100), Math.trunc((wx + wy) * 10 / 100)];
/** Inverse of worldToReal: a-b = rx*100/15, a+b = ry*100/10. */
export const realToWorld = (rx, ry) => { const d = rx * 100 / 15, s = ry * 100 / 10; return [(s + d) / 2, (s - d) / 2]; };
function b64(s) { const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++)
    a[i] = bin.charCodeAt(i); return a; }
export class GameMap {
    constructor(m) {
        this.m = m;
        this.sets = [];
        this.chipSlot = new Map();
        this.objs = [];
        this.markerSet = null;
        const raw = b64(m.cells);
        this.cells = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
        const n = m.w * m.h;
        this.slotPl = this.cells.subarray(n, 2 * n);
        this.patPl = this.cells.subarray(2 * n, 3 * n);
        this.judge = b64(m.judge);
        this.objs = m.objects.map(([x, y, slot, pat]) => { const [rx, ry] = worldToReal(x, y); return { rx, ry, slot, pat }; });
        this.objs.sort((a, b) => a.ry - b.ry);
    }
    static async load(name) {
        const m = await (await fetch(Data.url(`maps/${name}.json`))).json();
        const map = new GameMap(m);
        const cache = new Map();
        map.sets = await Promise.all(m.lst.map(f => {
            if (!f)
                return Promise.resolve(null);
            if (!cache.has(f))
                cache.set(f, SpriteSet.load(Data.url(`pat/${f}`)));
            return cache.get(f);
        }));
        return map;
    }
    /** Judge grid value at world coords: 0 free, 1 blocked, 3 special free zone. Outside the grid counts as blocked. */
    judgeAt(a, b) {
        const { judgeW: W, judgeH: H, judgeCell: C, judgeOrigin: [oa, ob] } = this.m;
        const gx = Math.floor((a + oa) / C), gy = Math.floor((b + ob) / C);
        return gx < 0 || gy < 0 || gx >= W || gy >= H ? 1 : this.judge[gy * W + gx];
    }
    blockedReal(rx, ry) { const [a, b] = realToWorld(rx, ry); return this.judgeAt(a, b) === 1; }
    /** Real-pixel position of the judge-grid marker cell (centre). */
    markerReal() {
        if (this.m.spawn)
            return worldToReal(this.m.spawn[0], this.m.spawn[1]);
        const mk = this.m.marker[0];
        if (!mk)
            return null;
        const { judgeCell: C, judgeOrigin: [oa, ob] } = this.m;
        return worldToReal((mk[0] + 0.5) * C - oa, (mk[1] + 0.5) * C - ob);
    }
    /** True when the real-pixel point lies within `reach` judge cells of a 0x8000-flagged cell (exit/event zone; on f00_01 the zone is a blocked gate in the wall, so reach > 0 is needed). */
    inMarker(rx, ry, reach = 0) {
        const { judgeCell: C, judgeOrigin: [oa, ob], judgeW: W } = this.m;
        this.markerSet ?? (this.markerSet = new Set(this.m.marker.map(([x, y]) => y * W + x)));
        const [a, b] = realToWorld(rx, ry), gx = Math.floor((a + oa) / C), gy = Math.floor((b + ob) / C);
        for (let dy = -reach; dy <= reach; dy++)
            for (let dx = -reach; dx <= reach; dx++)
                if (this.markerSet.has((gy + dy) * W + gx + dx))
                    return true;
        return false;
    }
    get hasMarkerZone() { return this.m.marker.length > 0; }
    /** Debug overlay: tint judge cells (red blocked, yellow special). */
    drawJudge(ctx, camX, camY, vw, vh) {
        const { judgeW: W, judgeH: H, judgeCell: C, judgeOrigin: [oa, ob] } = this.m;
        const [a0, b0] = realToWorld(camX, camY), [a1, b1] = realToWorld(camX + vw, camY + vh);
        const [a2, b2] = realToWorld(camX + vw, camY), [a3, b3] = realToWorld(camX, camY + vh);
        const amin = Math.min(a0, a1, a2, a3), amax = Math.max(a0, a1, a2, a3), bmin = Math.min(b0, b1, b2, b3), bmax = Math.max(b0, b1, b2, b3);
        const gx0 = Math.max(0, Math.floor((amin + oa) / C)), gx1 = Math.min(W - 1, Math.floor((amax + oa) / C));
        const gy0 = Math.max(0, Math.floor((bmin + ob) / C)), gy1 = Math.min(H - 1, Math.floor((bmax + ob) / C));
        ctx.save();
        ctx.globalAlpha = 0.35;
        for (let gy = gy0; gy <= gy1; gy++)
            for (let gx = gx0; gx <= gx1; gx++) {
                const v = this.judge[gy * W + gx];
                if (v === 0)
                    continue;
                ctx.fillStyle = v === 1 ? '#f00' : '#ff0';
                const a = gx * C - oa, b = gy * C - ob;
                const p = [worldToReal(a, b), worldToReal(a + C, b), worldToReal(a + C, b + C), worldToReal(a, b + C)];
                ctx.beginPath();
                p.forEach(([x, y], i) => i ? ctx.lineTo(x - camX, y - camY) : ctx.moveTo(x - camX, y - camY));
                ctx.fill();
            }
        ctx.restore();
    }
    get realW() { return this.m.w * this.m.chipW; }
    get realH() { return this.m.h * this.m.chipH; }
    /** A slot is a ground set when its images are whole 64 x 48 chips (drawn on the cell); anything else is a decor set anchored at the cell centre. */
    isChip(slot) {
        let v = this.chipSlot.get(slot);
        if (v !== undefined)
            return v;
        const set = this.sets[slot];
        let f = null;
        for (let i = 0; set && !f && i < set.patternCount; i++)
            f = set.pattern(i);
        v = !!f && !set.isShadow && f.canvas.width === this.m.chipW && f.canvas.height === this.m.chipH && f.ox === 0 && f.oy === 0;
        this.chipSlot.set(slot, v);
        return v;
    }
    shadowSet(slot) {
        const f = this.m.lst[slot + 1];
        return f && f.endsWith('_sdw') ? this.sets[slot + 1] : null;
    }
    /** Draw ground + decor + objects (+ extra drawables, e.g. the player) depth-sorted. */
    draw(ctx, camX, camY, vw, vh, extra = []) {
        const { w, h, chipW: cw, chipH: ch } = this.m;
        const x0 = Math.max(0, Math.floor(camX / cw)), x1 = Math.min(w - 1, Math.floor((camX + vw) / cw));
        const y0 = Math.max(0, Math.floor(camY / ch)), y1 = Math.min(h - 1, Math.floor((camY + vh) / ch));
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, vw, vh);
        // ground chips: one image (slot, pattern) per cell
        for (let cy = y0; cy <= y1; cy++)
            for (let cx = x0; cx <= x1; cx++) {
                const i = cy * w + cx, slot = this.slotPl[i];
                if (slot < 0 || !this.sets[slot] || !this.isChip(slot))
                    continue;
                const f = this.sets[slot].pattern(this.patPl[i]);
                if (f)
                    ctx.drawImage(f.canvas, cx * cw - camX + f.ox, cy * ch - camY + f.oy);
            }
        // collect shadows and sortable objects
        const shadows = [];
        const items = [...extra];
        const seen = (f, rx, ry) => rx + f.ox < camX + vw && rx + f.ox + f.canvas.width > camX && ry + f.oy < camY + vh && ry + f.oy + f.canvas.height > camY; // sprite rectangle meets the view
        const addObj = (slot, pat, rx, ry) => {
            const set = this.sets[slot];
            if (!set)
                return;
            const f0 = set.pattern(pat);
            if (!f0)
                return;
            const sh = this.shadowSet(slot), shf = sh?.pattern(pat);
            if (shf && seen(shf, rx, ry))
                shadows.push(() => ctx.drawImage(shf.canvas, rx + shf.ox - camX, ry + shf.oy - camY));
            if (!seen(f0, rx, ry))
                return;
            if (set.isShadow) {
                shadows.push(() => ctx.drawImage(f0.canvas, rx + f0.ox - camX, ry + f0.oy - camY));
                return;
            }
            items.push({ y: ry, draw: () => ctx.drawImage(f0.canvas, rx + f0.ox - camX, ry + f0.oy - camY) });
        };
        // decor sets anchored in cells: wide margins because buildings reach far above / beside their anchor cell
        const cy0 = Math.max(0, Math.floor(camY / ch) - 4), cy1 = Math.min(h - 1, Math.floor((camY + vh) / ch) + 16), cx0 = Math.max(0, x0 - 10), cx1 = Math.min(w - 1, x1 + 10);
        for (let cy = cy0; cy <= cy1; cy++)
            for (let cx = cx0; cx <= cx1; cx++) {
                const i = cy * w + cx, slot = this.slotPl[i];
                if (slot >= 0 && this.sets[slot] && !this.isChip(slot))
                    addObj(slot, this.patPl[i], cx * cw + cw / 2, cy * ch + 40);
            }
        for (const o of this.objs) {
            if (o.ry < camY - 200 || o.ry > camY + vh + 900 || o.rx < camX - 800 || o.rx > camX + vw + 800)
                continue;
            addObj(o.slot, o.pat, o.rx, o.ry);
        }
        for (const s of shadows)
            s();
        items.sort((a, b) => a.y - b.y);
        for (const it of items)
            it.draw(ctx, camX, camY);
    }
}
//# sourceMappingURL=map.js.map