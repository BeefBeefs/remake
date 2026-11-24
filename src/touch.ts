import { App } from './app.js';
import { SCREEN_W, SCREEN_H } from './gui.js';

/**
 * Touch controls for phones / tablets (Android Chrome): a DOM overlay over the canvas.
 *  - drag on the game screen = the mouse (hold to walk towards the finger, tap an enemy to attack, tap items / NPCs / buttons / windows)
 *  - left pad: virtual stick, drives the arrow keys (WASD would open Status with S)
 *  - right: ATK (hold = Shift + left button aimed at the nearest enemy or in front of the hero), MAGIC (right button aimed the same way), RUN, DOG (Space)
 *  - menu row: ITEM I, STAT C, MAGIC M, MAP N, QUEST Q, HELP H, MENU Esc; belt 1-4
 *  - FULL: fullscreen toggle (landscape lock where the browser allows it)
 * Shown on touch devices (first touch or a coarse pointer); `?touch=1` forces it, `?touch=0` hides it.
 */
const CSS = `
#tc{position:fixed;inset:0;z-index:20;pointer-events:none;font:700 12px sans-serif;color:#fff;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;display:none}
#tc.on{display:block}
#tc .b{position:absolute;pointer-events:auto;touch-action:none;border:2px solid rgba(255,255,255,.55);background:rgba(20,24,40,.45);border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.1;-webkit-tap-highlight-color:transparent}
#tc .b.s{border-radius:10px}
#tc .b.on{background:rgba(220,200,120,.6)}
#tc .stick{left:max(14px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));width:132px;height:132px;background:rgba(20,24,40,.3)}
#tc .knob{position:absolute;width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.45);left:38px;top:38px;pointer-events:none}
`;
type Btn = { label: string; cls?: string; style: string; down?: () => void; up?: () => void; tap?: string; toggle?: boolean };

export class TouchControls {
  private root = document.createElement('div'); private stickEl!: HTMLDivElement; private knob!: HTMLDivElement; private stickId = -1;
  private held = new Set<string>(); private fsBtn?: HTMLDivElement;
  constructor(private app: App) {
    const q = new URLSearchParams(location.search).get('touch');
    if (q === '0') return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
    this.root.id = 'tc'; document.body.append(this.root); this.build();
    const show = () => this.root.classList.add('on');
    if (q === '1' || matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) show(); else addEventListener('touchstart', show, { once: true, passive: true });
    document.addEventListener('fullscreenchange', () => { if (this.fsBtn) this.fsBtn.textContent = document.fullscreenElement ? 'EXIT' : 'FULL'; });
    addEventListener('blur', () => this.releaseAll());
  }
  get visible() { return this.root.classList.contains('on'); }
  private key(k: string, on: boolean) { const i = this.app.input; if (on) { if (!i.keys.has(k)) i.pressed.add(k); i.keys.add(k); this.held.add(k); } else { i.keys.delete(k); this.held.delete(k); } }
  private releaseAll() { for (const k of [...this.held]) this.key(k, false); this.app.input.down = false; this.knob && (this.knob.style.transform = ''); this.stickId = -1; }
  /** Aim the mouse pointer at the nearest enemy, or in front of the hero (scene.touchAim), or the screen centre. */
  private aim() { const a = this.app.scene?.touchAim?.() ?? [SCREEN_W / 2, SCREEN_H / 2]; this.app.input.x = a[0]; this.app.input.y = a[1]; }
  private btn(b: Btn) {
    const e = document.createElement('div'); e.className = `b ${b.cls ?? ''}`; e.style.cssText = b.style; e.textContent = b.label; this.root.append(e);
    let id = -1;
    e.addEventListener('pointerdown', ev => { ev.preventDefault(); e.setPointerCapture(ev.pointerId); id = ev.pointerId; e.classList.add('on'); if (b.tap) { this.app.input.pressed.add(b.tap); } b.down?.(); });
    const end = (ev: PointerEvent) => { if (ev.pointerId !== id) return; id = -1; e.classList.remove('on'); b.up?.(); };
    e.addEventListener('pointerup', end); e.addEventListener('pointercancel', end);
    return e;
  }
  private build() {
    // stick
    const s = this.stickEl = document.createElement('div'); s.className = 'b stick'; const k = this.knob = document.createElement('div'); k.className = 'knob'; s.append(k); this.root.append(s);
    const move = (ev: PointerEvent) => {
      const r = s.getBoundingClientRect(), dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy), m = r.width / 2, c = d > m ? m / d : 1;
      k.style.transform = `translate(${dx * c}px,${dy * c}px)`;
      const dz = 18; this.key('arrowleft', dx < -dz); this.key('arrowright', dx > dz); this.key('arrowup', dy < -dz); this.key('arrowdown', dy > dz);   // arrow keys, not WASD: S is also the Status hotkey
    };
    s.addEventListener('pointerdown', ev => { ev.preventDefault(); s.setPointerCapture(ev.pointerId); this.stickId = ev.pointerId; move(ev); });
    s.addEventListener('pointermove', ev => { if (ev.pointerId === this.stickId) move(ev); });
    const end = (ev: PointerEvent) => { if (ev.pointerId !== this.stickId) return; this.stickId = -1; k.style.transform = ''; for (const c of ['arrowleft', 'arrowright', 'arrowup', 'arrowdown']) this.key(c, false); };
    s.addEventListener('pointerup', end); s.addEventListener('pointercancel', end);
    const R = 'right:max(14px,env(safe-area-inset-right));', B = 'bottom:max(14px,env(safe-area-inset-bottom));';
    // action buttons (right, thumb reach)
    let atkTimer = 0;
    this.btn({ label: 'ATK', style: `${R}${B}width:84px;height:84px;font-size:15px`, down: () => { this.key('shift', true); this.aim(); this.app.input.down = true; atkTimer = window.setInterval(() => this.aim(), 80); },
      up: () => { clearInterval(atkTimer); this.key('shift', false); this.app.input.down = false; } });
    this.btn({ label: 'MAGIC', style: `right:calc(max(14px,env(safe-area-inset-right)) + 96px);${B}width:64px;height:64px`, down: () => { this.aim(); this.app.rightClickAt(this.app.input.x, this.app.input.y); } });
    this.btn({ label: 'RUN', style: `${R}bottom:calc(max(14px,env(safe-area-inset-bottom)) + 96px);width:56px;height:56px`, tap: 'r' });
    this.btn({ label: 'DOG', style: `right:calc(max(14px,env(safe-area-inset-right)) + 66px);bottom:calc(max(14px,env(safe-area-inset-bottom)) + 76px);width:48px;height:48px`, tap: ' ' });
    // belt 1-4 (potions)
    ['1', '2', '3', '4'].forEach((n, i) => this.btn({ label: n, cls: 's', style: `${R}bottom:calc(max(14px,env(safe-area-inset-bottom)) + 164px);width:40px;height:40px;right:calc(max(14px,env(safe-area-inset-right)) + ${(3 - i) * 46}px)`, tap: n }));
    // menu row (top, centre-left)
    const row: [string, string][] = [['ITEM', 'i'], ['STAT', 'c'], ['MAGIC', 'm'], ['MAP', 'n'], ['QUEST', 'q'], ['HELP', 'h'], ['MENU', 'escape']];
    row.forEach(([l, key], i) => this.btn({ label: l, cls: 's', style: `left:calc(max(8px,env(safe-area-inset-left)) + ${i * 50}px);top:max(6px,env(safe-area-inset-top));width:46px;height:26px;font-size:9px`, tap: key }));
    // fullscreen
    if (document.fullscreenEnabled || (document.documentElement as any).webkitRequestFullscreen) {
      this.fsBtn = this.btn({ label: 'FULL', cls: 's', style: 'right:max(8px,env(safe-area-inset-right));top:max(6px,env(safe-area-inset-top));width:56px;height:30px;font-size:11px', down: () => this.toggleFullscreen() });
    }
  }
  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); (screen.orientation as any)?.unlock?.(); return; }
      const el = document.documentElement as any; await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
      try { await (screen.orientation as any)?.lock?.('landscape'); } catch { /* not allowed on this browser */ }
    } catch (e) { console.warn('fullscreen refused', e); }
  }
}
