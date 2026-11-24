import { App } from './app.js';

/** "Display Darkness": dungeons, ruins and towers are dark and only the area around the player is lit (manual, Settings Menu). Game/Dark.njp holds grayscale light masks
 *  (patterns 1-6 = ellipses from 90x60 up to 280x200, white = lit); the mask's brightness becomes the amount punched out of a black layer. */
export class DarkLayer {
  private layer = document.createElement('canvas'); private light: HTMLCanvasElement;
  private constructor(light: HTMLCanvasElement) { this.layer.width = 640; this.layer.height = 420; this.light = light; }
  static async load(app: App, size = 6) {
    const f = (await app.gui('Game_Dark')).pattern(size);
    const c = document.createElement('canvas'); c.width = f?.canvas.width ?? 1; c.height = f?.canvas.height ?? 1;
    if (f) {
      const g = c.getContext('2d')!; g.drawImage(f.canvas, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
      for (let i = 0; i < px.length; i += 4) { const a = px[i + 3] ? px[i] : 0; px[i] = px[i + 1] = px[i + 2] = 0; px[i + 3] = a; }
      g.putImageData(d, 0, 0);
    }
    return new DarkLayer(c);
  }
  /** Draw the darkness over the playing field (0..420) with the lit ellipse centred on screen point (x, y). */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const g = this.layer.getContext('2d')!;
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, 640, 420); g.fillStyle = '#000'; g.fillRect(0, 0, 640, 420);
    g.globalCompositeOperation = 'destination-out'; g.drawImage(this.light, Math.round(x - this.light.width / 2), Math.round(y - this.light.height / 2));
    ctx.globalAlpha = 0.88; ctx.drawImage(this.layer, 0, 0); ctx.globalAlpha = 1;
  }
}
/** Maps named d?? (dungeons) and y?? (ruins / towers) are dark; f?? fields and towns are not. */
export const isDarkMap = (name: string) => /^[dy]\d/i.test(name);
