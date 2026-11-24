import { Data } from './data.js';
import { SpriteSet, Frame } from './sprites.js';
import { SCREEN_W, SCREEN_H } from './gui.js';

export interface Scene {
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

/** Shared input state; `clicked` is true for exactly one frame after a left button press. */
export class Input {
  x = SCREEN_W / 2; y = SCREEN_H / 2; down = false; clicked = false; rclicked = false;
  keys = new Set<string>(); typed: string[] = []; pressed = new Set<string>();
}

export class App {
  ctx: CanvasRenderingContext2D;
  input = new Input();
  scene: Scene | null = null;
  private sets = new Map<string, Promise<SpriteSet>>();
  private rawClick = false; private rawRight = false;
  constructor(public cv: HTMLCanvasElement) {
    cv.width = SCREEN_W; cv.height = SCREEN_H;
    this.ctx = cv.getContext('2d')!; this.ctx.imageSmoothingEnabled = false;
    const i = this.input;
    cv.addEventListener('mousemove', e => { const r = cv.getBoundingClientRect(); i.x = (e.clientX - r.left) * SCREEN_W / r.width; i.y = (e.clientY - r.top) * SCREEN_H / r.height; });
    cv.addEventListener('mousedown', e => { if (e.button === 0) { i.down = true; this.rawClick = true; } else if (e.button === 2) this.rawRight = true; cv.focus(); });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mouseup', () => i.down = false);
    addEventListener('keydown', e => {
      const k = e.key.toLowerCase(); if (!i.keys.has(k)) i.pressed.add(k);
      if (e.shiftKey && k === 'capslock') i.pressed.add('shift+capslock');
      i.keys.add(k); if (e.key.length === 1 || e.key === 'Backspace') i.typed.push(e.key);
      if (e.key.startsWith('Arrow') || e.key === 'F1' || e.key === ' ' || e.key === 'Tab') e.preventDefault();
    });
    addEventListener('keyup', e => i.keys.delete(e.key.toLowerCase()));
    (window as any).app = this;
  }
  /** Memoised sprite-set loader: gui('Game_Bar') -> data/ep1/gui/Game_Bar */
  gui(name: string) { return this.set(Data.url(`gui/${name}`)); }
  set(base: string) { if (!this.sets.has(base)) this.sets.set(base, SpriteSet.load(base)); return this.sets.get(base)!; }
  go(s: Scene) { this.scene = s; }
  run() {
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(50, now - last)); last = now;
      const i = this.input; i.clicked = this.rawClick; this.rawClick = false; i.rclicked = this.rawRight; this.rawRight = false;
      this.scene?.update(dt); this.scene?.draw(this.ctx);
      i.clicked = false; i.rclicked = false; i.typed.length = 0; i.pressed.clear();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

/** Draw a pattern at its absolute position (+ optional offset); returns the frame rect for hit testing. */
export function put(ctx: CanvasRenderingContext2D, set: SpriteSet, idx: number, pal?: number, dx = 0, dy = 0): Frame | null {
  const f = set.pattern(idx, pal); if (f) ctx.drawImage(f.canvas, f.ox + dx, f.oy + dy);
  return f;
}
export const inRect = (f: Frame | null, x: number, y: number) => !!f && x >= f.ox && y >= f.oy && x < f.ox + f.canvas.width && y < f.oy + f.canvas.height;
/** Pixel-accurate hit test against a (mask) frame. */
export function inMask(f: Frame | null, x: number, y: number): boolean {
  if (!f || !inRect(f, x, y)) return false;
  return f.canvas.getContext('2d')!.getImageData(Math.floor(x - f.ox), Math.floor(y - f.oy), 1, 1).data[3] > 0;
}

/** 6x12 half-width bitmap font (Common/Font00 pattern 0). */
export class Text {
  constructor(private sheet: Frame) {}
  static async load(app: App) { const s = await app.gui('Common_Font00'); return new Text(s.pattern(0)!); }
  draw(ctx: CanvasRenderingContext2D, s: string, x: number, y: number) {
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i) & 0xff; ctx.drawImage(this.sheet.canvas, (c & 15) * 6, (c >> 4) * 12, 6, 12, x + i * 6, y, 6, 12); }
  }
  drawRight(ctx: CanvasRenderingContext2D, s: string, xr: number, y: number) { this.draw(ctx, s, xr - s.length * 6, y); }
  drawCenter(ctx: CanvasRenderingContext2D, s: string, xc: number, y: number) { this.draw(ctx, s, Math.round(xc - s.length * 3), y); }
}
