// Loads sprite sets produced by tools/convert.py and renders palette-indexed patterns.
export interface SpriteMeta {
  magic: string; sheets: number;
  images: [sheet: number, x: number, y: number, w: number, h: number][];
  patterns: [defaultPalette: number, parts: [img: number, x: number, y: number, sx: number, sy: number][]][];
  palettes: string[]; // 256 * RRGGBB hex
}

export interface Frame { canvas: HTMLCanvasElement; ox: number; oy: number; }

export class SpriteSet {
  private sheetData: ImageData[] = [];
  private palettes: Uint8Array[] = [];
  private cache = new Map<number, Frame | null>();
  readonly isShadow: boolean;
  constructor(public meta: SpriteMeta) {
    this.isShadow = meta.magic.startsWith('ShadowLow');
    this.palettes = meta.palettes.map(hex => {
      const p = new Uint8Array(256 * 3);
      for (let i = 0; i < 256; i++) for (let k = 0; k < 3; k++) p[i * 3 + k] = parseInt(hex.substr(i * 6 + k * 2, 2), 16);
      return p;
    });
  }
  static async load(base: string): Promise<SpriteSet> {
    const meta: SpriteMeta = await (await fetch(base + '.json')).json();
    const set = new SpriteSet(meta);
    for (let s = 0; s < meta.sheets; s++) {
      const img = new Image();
      img.src = `${base}_${s}.png`;
      await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      set.sheetData.push(ctx.getImageData(0, 0, c.width, c.height));
    }
    return set;
  }
  get patternCount() { return this.meta.patterns.length; }

  /** Render pattern `idx` with palette `pal` (default: the pattern's own palette). Cached. */
  pattern(idx: number, pal?: number): Frame | null {
    const p = this.meta.patterns[idx]; if (!p) return null;
    const pi = pal ?? p[0];
    const key = idx * 64 + pi;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const palette = this.palettes[pi] ?? this.palettes[0];
    // bounding box over parts
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const parts = p[1].filter(q => this.meta.images[q[0]]);
    for (const q of parts) { const im = this.meta.images[q[0]]; x0 = Math.min(x0, q[1]); y0 = Math.min(y0, q[2]); x1 = Math.max(x1, q[1] + im[3]); y1 = Math.max(y1, q[2] + im[4]); }
    if (!parts.length || x1 <= x0 || y1 <= y0) { this.cache.set(key, null); return null; }
    const c = document.createElement('canvas'); c.width = x1 - x0; c.height = y1 - y0;
    const ctx = c.getContext('2d')!; const out = ctx.createImageData(c.width, c.height);
    for (const q of parts) {
      const [sh, sx, sy, w, h] = this.meta.images[q[0]]; const src = this.sheetData[sh];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const si = ((sy + y) * src.width + sx + x) * 4;
        if (src.data[si + 3] === 0) continue;
        const v = src.data[si]; const di = ((q[2] - y0 + y) * c.width + (q[1] - x0 + x)) * 4;
        if (this.isShadow) { out.data[di] = out.data[di + 1] = out.data[di + 2] = 0; } else { out.data[di] = palette[v * 3]; out.data[di + 1] = palette[v * 3 + 1]; out.data[di + 2] = palette[v * 3 + 2]; } out.data[di + 3] = this.isShadow ? 90 : 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    const f = { canvas: c, ox: x0, oy: y0 };
    this.cache.set(key, f); return f;
  }
}
