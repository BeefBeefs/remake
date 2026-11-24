import { audio } from './audio.js';
import { App, Scene, put, inRect, Text } from './app.js';
import { SpriteSet } from './sprites.js';
import { SelectScene } from './select.js';
import { LoadScene } from './load.js';
import { GameScene } from './game.js';
import { listSlots, SLOTS } from './saves.js';

/** Title screen: System/Title/Pattern/Title.njp (0 = backdrop, 1..3 = menu entries, 4 = copyright). */
export class TitleScene implements Scene {
  private msg = ''; private msgT = 0;
  private constructor(private app: App, private t: SpriteSet, private text: Text) {}
  static async create(app: App) { audio.bgm('title'); return new TitleScene(app, await app.gui('Title_Title'), await Text.load(app)); }
  /** Pattern numbers of NEW GAME / LOAD GAME / EXIT. Manual: NEW GAME is hidden once six characters exist, LOAD GAME while there is no saved data; the rest move up. */
  private visible(): number[] { const n = listSlots().filter(Boolean).length; return [n < SLOTS ? 1 : 0, n > 0 ? 2 : 0, 3].filter(Boolean); }
  /** Vertical offset that puts entry `p` into menu row `k` (rows are the original positions of the three entries). */
  private rowDy(p: number, k: number) { return (this.t.pattern([1, 2, 3][k])?.oy ?? 0) - (this.t.pattern(p)?.oy ?? 0); }
  private hit(p: number, k: number) { const f = this.t.pattern(p); if (!f) return false; const i = this.app.input, dy = this.rowDy(p, k); return i.x >= f.ox && i.x < f.ox + f.canvas.width && i.y >= f.oy + dy && i.y < f.oy + dy + f.canvas.height; }
  update(dt: number) {
    const i = this.app.input; this.msgT = Math.max(0, this.msgT - dt);
    if (!i.clicked) return;
    const vis = this.visible(), p = vis.find((p, k) => this.hit(p, k));
    if (p === 1) SelectScene.create(this.app).then(s => this.app.go(s));
    else if (p === 2) LoadScene.create(this.app).then(s => this.app.go(s));
    else if (p === 3) { this.msg = 'Close the tab to exit :)'; this.msgT = 2500; }
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 640, 480);
    put(ctx, this.t, 0);
    this.visible().forEach((p, k) => put(ctx, this.t, p, this.hit(p, k) ? 3 : 1, 0, this.rowDy(p, k)));
    put(ctx, this.t, 4);
    if (this.msgT > 0) this.text.drawCenter(ctx, this.msg, 320, 340);
  }
}
