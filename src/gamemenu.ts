import { App, Text } from './app.js';
import { SpriteSet } from './sprites.js';
import { settings, saveSettings } from './settings.js';

export type MenuAction = 'close' | 'missions' | 'map' | 'title' | 'exit' | null;
type Page = 'main' | 'settings' | 'help';

const MAIN: [string, string][] = [['settings', 'Settings'], ['missions', 'Mission List'], ['map', 'Map'], ['help', 'Help'], ['title', 'Save and Return to Title'], ['exit', 'Save and Exit']];
/** Key list for the Help page: only controls that exist in this remake (the original manual lists more, see docs). */
export const HELP: [string, string][] = [
  ['Left click', 'Walk / talk / attack / pick up'], ['Ctrl + click', 'Run while Walk is selected'], ['R', 'Switch Walk / Run'],
  ['S or C', 'Status window'], ['I', 'Item window'], ['Q', 'Mission List'], ['H', 'This help'], ['Esc', 'Game menu / close windows'],
  ['1 - 8', 'Use belt pocket item (or right click)'], ['M', 'Magic window'], ['N', 'Map'],
  ['F1 - F8', 'Select a magic for the right mouse button'], ['F9', 'Select attack for right click'], ['Right click', 'Cast / attack (items: use)'],
  ['B', 'Lay a mine'], ['P', 'Power-up mode (when blinking)'], ['Space', 'Companion ACTIVE / INACTIVE'],
  ['Tab + click', 'Companion: jump / fetch / switch / status'], ['Tab + right click', 'Companion dash'],
  ['F12', 'Mute sound'], ['G', 'Debug overlay'],
];

/** Game Menu (MENU button / Esc): frame from Game/Status pattern 119, entries from the manual: Settings, Mission List, Map, Help, Save and Return to Title, Save and Exit. */
export class GameMenu {
  page: Page = 'main'; private note = ''; private noteT = 0;
  private constructor(private st: SpriteSet, private text: Text) {}
  static async load(app: App) { return new GameMenu(await app.gui('Game_Status'), await Text.load(app)); }
  open(page: Page = 'main') { this.page = page; this.note = ''; }
  private rows(): { id: string; label: string; x: number; y: number; w: number; h: number }[] {
    if (this.page === 'main') return MAIN.map(([id, label], k) => ({ id, label, x: 170, y: 78 + k * 40, w: 300, h: 30 }));
    if (this.page === 'settings') return [
      { id: 'music', label: `Music volume        ${'|'.repeat(settings.music)}${'.'.repeat(10 - settings.music)}`, x: 120, y: 90, w: 400, h: 30 },
      { id: 'sfx', label: `Sound effects       ${'|'.repeat(settings.sfx)}${'.'.repeat(10 - settings.sfx)}`, x: 120, y: 134, w: 400, h: 30 },
      { id: 'dark', label: `Display Darkness    ${settings.darkness ? 'ON' : 'OFF'}`, x: 120, y: 178, w: 400, h: 30 },
      { id: 'back', label: 'Back', x: 250, y: 300, w: 140, h: 30 },
    ];
    return [{ id: 'back', label: 'Back', x: 250, y: 372, w: 140, h: 30 }];
  }
  update(dt: number, x: number, y: number, clicked: boolean, esc: boolean): MenuAction {
    this.noteT = Math.max(0, this.noteT - dt);
    if (esc) { if (this.page === 'main') return 'close'; this.page = 'main'; return null; }
    if (!clicked) return null;
    const r = this.rows().find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    if (!r) return null;
    switch (r.id) {
      case 'settings': case 'help': this.page = r.id; return null;
      case 'back': this.page = 'main'; return null;
      case 'missions': case 'map': case 'title': case 'exit': return r.id;
      case 'music': settings.music = (settings.music + (x > r.x + r.w / 2 ? 1 : 10)) % 11; saveSettings(); return null;
      case 'sfx': settings.sfx = (settings.sfx + (x > r.x + r.w / 2 ? 1 : 10)) % 11; saveSettings(); return null;
      case 'dark': settings.darkness = !settings.darkness; saveSettings(); return null;
    }
    return null;
  }
  draw(ctx: CanvasRenderingContext2D, mx: number, my: number) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = '#12161a'; ctx.fillRect(16, 42, 608, 332);
    const f = this.st.pattern(119); if (f) ctx.drawImage(f.canvas, f.ox, f.oy);
    const title = this.page === 'main' ? 'GAME MENU' : this.page === 'settings' ? 'SETTINGS' : 'HELP';
    this.text.drawCenter(ctx, title, 320, 54);
    for (const r of this.rows()) {
      const on = mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h;
      ctx.fillStyle = on ? 'rgba(90,66,28,0.9)' : 'rgba(30,26,20,0.85)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = on ? '#e8c860' : '#7a6a48'; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      if (this.page === 'settings' && r.id !== 'back') this.text.draw(ctx, r.label, r.x + 14, r.y + 9); else this.text.drawCenter(ctx, r.label, r.x + r.w / 2, r.y + 9);
    }
    if (this.page === 'settings') this.text.drawCenter(ctx, 'Click the left half of a bar to lower, the right half to raise', 320, 240);
    if (this.page === 'help') HELP.forEach(([k, d], i) => { this.text.draw(ctx, k, 90, 70 + i * 15); this.text.draw(ctx, d, 250, 70 + i * 15); });
    if (this.noteT > 0) this.text.drawCenter(ctx, this.note, 320, 336);
  }
}
