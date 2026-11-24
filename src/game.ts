import { SpriteSet } from './sprites.js';
import { loadCaf, Caf } from './caf.js';
import { GameMap, Drawable } from './map.js';
import { Gui, HudState, SCREEN_W, SCREEN_H, HUD_Y } from './gui.js';

const q = new URLSearchParams(location.search);
const MAP = q.get('map') ?? '3rd_2-1';
/** CAF layers drawn for the player: 1 = shadow-ish base, 0 = body, 3.. = equipment variants (mapping still unknown). */
const LAYERS = (q.get('layers') ?? '1,0,3').split(',').map(Number);
const FRAME_MS = 60;
// 8 facing directions in CAF order (guessed; tweak after visual check) -> unit vectors on screen
const DIRS: [number, number][] = [[0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1]];
const ANIM_IDLE = 0, ANIM_WALK = 1, ANIM_RUN = 2;

async function main() {
  const cv = document.getElementById('cv') as HTMLCanvasElement;
  const ctx = cv.getContext('2d')!; ctx.imageSmoothingEnabled = false;
  const st = document.getElementById('status')!;
  st.textContent = 'loading…';
  const [map, set, caf, gui] = await Promise.all([GameMap.load(MAP), SpriteSet.load('data/ep1/male'), loadCaf('data/ep1/male.caf.json'), Gui.load()]);
  const hud: HudState = { hp: 100, hpMax: 100, mp: 60, mpMax: 60, level: 1, exp: 0, expMax: 100, running: false };
  const mouse = { x: 320, y: 200, down: false };
  cv.width = SCREEN_W; cv.height = SCREEN_H;
  st.textContent = `${MAP} ${map.m.w}x${map.m.h}, ${map.m.objects.length} objects — WASD/arrows to walk, Shift to run`;
  const mk = map.markerReal();
  const player = { x: +(q.get('x') ?? mk?.[0] ?? 3600), y: +(q.get('y') ?? mk?.[1] ?? 8100), dir: 0, t: 0, anim: ANIM_IDLE };
  let debug = false;
  const keys = new Set<string>();
  addEventListener('keydown', e => { keys.add(e.key.toLowerCase()); if (e.key === 'F1' || e.key === 'g') { debug = !debug; e.preventDefault(); } if (e.key.toLowerCase() === 'r') hud.running = !hud.running; if (e.key.startsWith('Arrow')) e.preventDefault(); });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  cv.addEventListener('mousemove', e => { const r = cv.getBoundingClientRect(); mouse.x = (e.clientX - r.left) * SCREEN_W / r.width; mouse.y = (e.clientY - r.top) * SCREEN_H / r.height; });
  cv.addEventListener('mousedown', e => { if (e.button === 0) mouse.down = true; cv.focus(); });
  addEventListener('mouseup', () => mouse.down = false);
  (window as any).game = { player, keys, map, hud, mouse };

  const drawPlayer: Drawable = {
    get y() { return player.y; },
    draw(c, camX, camY) {
      const a: Caf['anims'][number] = caf.anims[player.anim]; const d = a.dirs[player.dir];
      const fi = d.frames ? Math.max(0, Math.floor(player.t / FRAME_MS)) % d.frames : 0;
      for (const l of LAYERS) {
        const seq = d.layers[l]; if (!seq || !seq.length) continue;
        const f = set.pattern(seq[Math.min(fi, seq.length - 1)][1]); if (!f) continue;
        c.drawImage(f.canvas, Math.round(player.x - camX + f.ox), Math.round(player.y - camY + f.oy));
      }
    },
  };

  let camX0 = 0, camY0 = 0;
  const dirIndex = (vx: number, vy: number) => { const ang = Math.atan2(vy, vx); /* 0 = right */ const order = [6, 7, 0, 1, 2, 3, 4, 5]; return order[(Math.round(ang / (Math.PI / 4)) + 8) % 8]; };
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.max(0, Math.min(50, now - last)); last = now;
    let dx = 0, dy = 0;
    if (keys.has('a') || keys.has('arrowleft')) dx--;
    if (keys.has('d') || keys.has('arrowright')) dx++;
    if (keys.has('w') || keys.has('arrowup')) dy--;
    if (keys.has('s') || keys.has('arrowdown')) dy++;
    let fdx = dx, fdy = dy;
    if (!dx && !dy && mouse.down && mouse.y < HUD_Y) {
      // walk towards the mouse pointer (screen space, relative to the player)
      const px = player.x - camX0, py = player.y - camY0;
      const vx = mouse.x - px, vy = mouse.y - py, d = Math.hypot(vx, vy);
      if (d > 6) { fdx = vx / d; fdy = vy / d; dx = Math.round(fdx * 1.2) ; dy = Math.round(fdy * 1.2); if (!dx && !dy) dx = 1; }
    }
    if (dx || dy) {
      const run = keys.has('shift') || hud.running;
      player.dir = dirIndex(fdx || dx, fdy || dy);
      const sp = (run ? 0.30 : 0.16) * dt, n = Math.hypot(fdx || dx, fdy || dy);
      const nx = player.x + (fdx || dx) / n * sp, ny = player.y + (fdy || dy) / n * sp;
      // slide along obstacles: try both axes, then each alone
      if (!map.blockedReal(nx, ny)) { player.x = nx; player.y = ny; }
      else if (!map.blockedReal(nx, player.y)) player.x = nx;
      else if (!map.blockedReal(player.x, ny)) player.y = ny;
      const na = run ? ANIM_RUN : ANIM_WALK; if (na !== player.anim) { player.anim = na; player.t = 0; }
    } else if (player.anim !== ANIM_IDLE) { player.anim = ANIM_IDLE; player.t = 0; }
    player.t += dt;
    camX0 = Math.round(Math.max(0, Math.min(map.realW - SCREEN_W, player.x - SCREEN_W / 2)));
    camY0 = Math.round(Math.max(0, Math.min(map.realH - HUD_Y, player.y - HUD_Y / 2)));
    map.draw(ctx, camX0, camY0, SCREEN_W, HUD_Y, [drawPlayer]);
    if (debug) map.drawJudge(ctx, camX0, camY0, SCREEN_W, HUD_Y);
    ctx.fillStyle = '#000'; ctx.fillRect(0, HUD_Y, SCREEN_W, SCREEN_H - HUD_Y);
    gui.draw(ctx, hud);
    gui.text(ctx, `${Math.round(player.x)},${Math.round(player.y)}`, 4, 2);
    gui.cursor(ctx, mouse.x, mouse.y, mouse.down);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
main().catch(e => { document.getElementById('status')!.textContent = String(e); console.error(e); });
