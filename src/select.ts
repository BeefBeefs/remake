import { App, Scene, put, inRect, Text } from './app.js';
import { SpriteSet } from './sprites.js';
import { GameScene } from './game.js';
import { TitleScene } from './title.js';
import { ModeWindow } from './modewin.js';

export type Gender = 'male' | 'female';

/** New-character screen: Select.njp portraits (7/8 male, 9/10 female), OK 4/5, BACK 2/3, NAME label 34. */
export class SelectScene implements Scene {
  gender: Gender = 'male'; name = 'SHADOW'; ep = 4; busy = false; private mode: ModeWindow | null = null;
  private constructor(private app: App, private s: SpriteSet, private t: SpriteSet, private text: Text) {}
  static async create(app: App) { return new SelectScene(app, await app.gui('Select_Select'), await app.gui('Title_Title'), await Text.load(app)); }
  update(dt = 16) {
    const i = this.app.input;
    if (this.mode) {
      const r = this.mode.update(dt);
      if (r === 'back') this.mode = null;
      else if (r === 'single') { this.busy = true; this.mode = null; GameScene.create(this.app, this.gender, this.name.trim(), { ep: this.ep }).then(g => this.app.go(g)); }
      return;
    }
    for (const k of i.typed) {
      if (k === 'Backspace') this.name = this.name.slice(0, -1);
      else if (/^[A-Za-z0-9 ]$/.test(k) && this.name.length < 12) this.name += k;
    }
    if (!i.clicked || this.busy) return;
    if (inRect(this.s.pattern(7), i.x, i.y)) this.gender = 'male';
    else if (inRect(this.s.pattern(9), i.x, i.y)) this.gender = 'female';
    else if (i.x >= 400 && i.x < 620 && i.y >= 404 && i.y < 432) this.ep = this.ep % 4 + 1;   // episode (data overlay) switch
    else if (inRect(this.s.pattern(4), i.x, i.y) && this.name.trim()) {
      this.mode = new ModeWindow(this.app, this.s, this.text);
    } else if (inRect(this.s.pattern(2), i.x, i.y)) TitleScene.create(this.app).then(t => this.app.go(t));
  }
  draw(ctx: CanvasRenderingContext2D) {
    const i = this.app.input, s = this.s;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 640, 480);
    put(ctx, this.t, 5, 2);
    put(ctx, s, 36);
    const hov = (p: number) => inRect(s.pattern(p), i.x, i.y);
    put(ctx, s, this.gender === 'male' || hov(7) ? 8 : 7);
    put(ctx, s, this.gender === 'female' || hov(9) ? 10 : 9);
    put(ctx, s, hov(4) ? 5 : 4); put(ctx, s, hov(2) ? 3 : 2);
    put(ctx, s, 34);
    this.text.draw(ctx, this.name + (Math.floor(performance.now() / 500) % 2 ? '_' : ''), 190, 412);
    this.text.draw(ctx, `Episode ${this.ep} >`, 410, 412);
    this.mode?.draw(ctx);
    if (this.busy) this.text.drawCenter(ctx, 'Loading...', 320, 440);
  }
}
