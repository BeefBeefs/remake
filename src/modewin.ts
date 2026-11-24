import { App, put, inRect, Text } from './app.js';
import { SpriteSet } from './sprites.js';

/** "Choose the game mode" window (Select.njp: frame 38, ONLINE MODE 22/23, SINGLE MODE 24/25, BACK 20/21). Manual: ONLINE MODE = multi-player, SINGLE MODE starts the
 *  game, BACK returns to the previous screen. There is no server, so ONLINE only shows a notice. */
export class ModeWindow {
  private note = ''; private noteT = 0;
  constructor(private app: App, private s: SpriteSet, private text: Text) {}
  /** Returns 'single' or 'back' when a choice is made. */
  update(dt: number): 'single' | 'back' | null {
    const i = this.app.input; this.noteT = Math.max(0, this.noteT - dt);
    if (i.pressed.has('escape')) return 'back';
    if (!i.clicked) return null;
    if (inRect(this.s.pattern(24), i.x, i.y)) return 'single';
    if (inRect(this.s.pattern(22), i.x, i.y)) { this.note = 'Online mode is not available in this version'; this.noteT = 2500; return null; }
    if (inRect(this.s.pattern(20), i.x, i.y)) return 'back';
    return null;
  }
  draw(ctx: CanvasRenderingContext2D) {
    const i = this.app.input, s = this.s, hov = (p: number) => inRect(s.pattern(p), i.x, i.y);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 640, 480);
    put(ctx, s, 38);
    put(ctx, s, hov(22) ? 23 : 22); put(ctx, s, hov(24) ? 25 : 24); put(ctx, s, hov(20) ? 21 : 20);
    if (this.noteT > 0) this.text.drawCenter(ctx, this.note, 320, 340);
  }
}
