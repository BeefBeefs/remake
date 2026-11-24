import { SpriteSet } from './sprites.js';
import { loadCaf, Caf } from './caf.js';
import { Drawable, worldToReal } from './map.js';
import type { App } from './app.js';

export interface ActorRec { name: string; kind: 'people' | 'partner' | 'enemy'; model: number; id: number; a: number; b: number; dir: number; radius: number; }
const FRAME_MS = 80;
/** Draw order of CAF layers (1 and 0 are the body for the player; higher ones are optional equipment/overlay variants). */
const LAYERS = [1, 0, 2, 3, 4, 5, 6];

/** Static/idle actor placed from Scenario.Mct (NPCs and partners). */
export class Actor implements Drawable {
  x: number; y: number; dir: number; t = Math.random() * 1000; anim = 0;
  private constructor(public rec: ActorRec, private set: SpriteSet, private sdw: SpriteSet, private caf: Caf) {
    [this.x, this.y] = worldToReal(rec.a, rec.b); this.dir = rec.dir % 9;
  }
  get name() { return this.rec.name; }
  /** Collision radius in real pixels (the Mct radius is in world units). */
  get radius() { return 22; }
  static async load(app: App, r: ActorRec) {
    const base = `data/ep1/actors/${r.kind}/${r.model}`;
    const [set, sdw, caf] = await Promise.all([app.set(base), app.set(base + '_sdw'), loadCaf(base + '.caf.json')]);
    return new Actor(r, set, sdw, caf);
  }
  update(dt: number) { this.t += dt; }
  draw(c: CanvasRenderingContext2D, camX: number, camY: number) {
    const d = this.caf.anims[this.anim]?.dirs[this.dir]; if (!d) return;
    const fi = d.frames ? Math.floor(this.t / FRAME_MS) % d.frames : 0;
    for (const s of [this.sdw, this.set]) for (const l of LAYERS) {
      const seq = d.layers[l]; if (!seq || !seq.length) continue;
      const f = s.pattern(seq[Math.min(fi, seq.length - 1)][1]); if (!f) continue;
      c.drawImage(f.canvas, Math.round(this.x - camX + f.ox), Math.round(this.y - camY + f.oy));
    }
  }
  hit(px: number, py: number) { return Math.abs(px - this.x) < 20 && py < this.y + 6 && py > this.y - 70; }
}
export async function loadScenarioActors(app: App, scenario: string): Promise<{ map: string | null; actors: Actor[] }> {
  const d: { map: string | null; actors: ActorRec[] } = await (await fetch(`data/ep1/scenario/${scenario}.actors.json`)).json();
  return { map: d.map, actors: await Promise.all(d.actors.map(r => Actor.load(app, r))) };
}
