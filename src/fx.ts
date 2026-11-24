import { App } from './app.js';
import { SpriteSet } from './sprites.js';
import { loadCaf, Caf } from './caf.js';

const FRAME_MS = 80;
/** Effect id used by script sentence 36 -> sprite set folder. GUESS: 20000 + k is the k-th folder of Character\Option (the exe enumerates that directory; see tools/build_fx.py). */
export const fxFolder = (index: string[], id: number) => index[id - 20000];

export interface FxSet { set: SpriteSet; caf: Caf; }
export interface FxInst { fx: FxSet; id: number; x: number; y: number; t: number; }

export async function loadFxSet(app: App, folder: string): Promise<FxSet | null> {
  try { const [set, caf] = await Promise.all([app.set(`data/ep1/fx/${folder}`), loadCaf(`data/ep1/fx/${folder}.caf.json`)]); return { set, caf }; } catch { return null; }
}
export const fxLife = (f: FxSet) => (f.caf.anims[0]?.dirs[0]?.frames || 8) * FRAME_MS;
/** Draw one effect instance (animation 0, direction 0, additive-ish soft blending) at real position (x, y) minus the camera. */
export function drawFx(c: CanvasRenderingContext2D, e: FxInst, camX: number, camY: number) {
  const d = e.fx.caf.anims[0]?.dirs[0]; if (!d) return;
  const fi = Math.min(Math.floor(e.t / FRAME_MS), Math.max(0, (d.frames || 1) - 1));
  c.save(); c.globalAlpha = 0.7;
  for (const seq of d.layers) { if (!seq || !seq.length) continue; const f = e.fx.set.pattern(seq[Math.min(fi, seq.length - 1)][1]); if (f) c.drawImage(f.canvas, Math.round(e.x - camX + f.ox), Math.round(e.y - camY + f.oy)); }
  c.restore();
}
