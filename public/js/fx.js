import { Data } from './data.js';
import { loadCaf } from './caf.js';
const FRAME_MS = 80;
/** Effect id used by script sentence 36 -> sprite set folder. GUESS: 20000 + k is the k-th folder of Character\Option (the exe enumerates that directory; see tools/build_fx.py). */
export const fxFolder = (index, id) => index[id - 20000];
export async function loadFxSet(app, folder) {
    try {
        const [set, caf] = await Promise.all([app.set(Data.url(`fx/${folder}`)), loadCaf(Data.url(`fx/${folder}.caf.json`))]);
        return { set, caf };
    }
    catch {
        return null;
    }
}
export const fxLife = (f) => (f.caf.anims[0]?.dirs[0]?.frames || 8) * FRAME_MS;
/** Draw one effect instance (animation 0, direction 0, additive-ish soft blending) at real position (x, y) minus the camera. */
export function drawFx(c, e, camX, camY) {
    const d = e.fx.caf.anims[0]?.dirs[0];
    if (!d)
        return;
    const fi = Math.min(Math.floor(e.t / FRAME_MS), Math.max(0, (d.frames || 1) - 1));
    c.save();
    c.globalAlpha = 0.7;
    for (const seq of d.layers) {
        if (!seq || !seq.length)
            continue;
        const f = e.fx.set.pattern(seq[Math.min(fi, seq.length - 1)][1]);
        if (f)
            c.drawImage(f.canvas, Math.round(e.x - camX + f.ox), Math.round(e.y - camY + f.oy));
    }
    c.restore();
}
//# sourceMappingURL=fx.js.map