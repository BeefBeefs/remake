import { SpriteSet } from './sprites.js';
import { loadCaf, Caf } from './caf.js';
import { GameMap, Drawable } from './map.js';

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
  const [map, set, caf] = await Promise.all([GameMap.load(MAP), SpriteSet.load('data/ep1/male'), loadCaf('data/ep1/male.caf.json')]);
  st.textContent = `${MAP} ${map.m.w}x${map.m.h}, ${map.m.objects.length} objects — WASD/arrows to walk, Shift to run`;
  const player = { x: +(q.get('x') ?? 3600), y: +(q.get('y') ?? 8100), dir: 0, t: 0, anim: ANIM_IDLE };
  const keys = new Set<string>();
  addEventListener('keydown', e => { keys.add(e.key.toLowerCase()); if (e.key.startsWith('Arrow')) e.preventDefault(); });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  (window as any).game = { player, keys, map };

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

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.max(0, Math.min(50, now - last)); last = now;
    let dx = 0, dy = 0;
    if (keys.has('a') || keys.has('arrowleft')) dx--;
    if (keys.has('d') || keys.has('arrowright')) dx++;
    if (keys.has('w') || keys.has('arrowup')) dy--;
    if (keys.has('s') || keys.has('arrowdown')) dy++;
    if (dx || dy) {
      const run = keys.has('shift');
      const di = DIRS.findIndex(v => v[0] === dx && v[1] === dy);
      if (di >= 0) player.dir = di;
      const sp = (run ? 0.30 : 0.16) * dt, n = Math.hypot(dx, dy);
      player.x = Math.max(0, Math.min(map.realW - 1, player.x + dx / n * sp));
      player.y = Math.max(0, Math.min(map.realH - 1, player.y + dy / n * sp));
      const na = run ? ANIM_RUN : ANIM_WALK; if (na !== player.anim) { player.anim = na; player.t = 0; }
    } else if (player.anim !== ANIM_IDLE) { player.anim = ANIM_IDLE; player.t = 0; }
    player.t += dt;
    const camX = Math.round(Math.max(0, Math.min(map.realW - cv.width, player.x - cv.width / 2)));
    const camY = Math.round(Math.max(0, Math.min(map.realH - cv.height, player.y - cv.height / 2)));
    map.draw(ctx, camX, camY, cv.width, cv.height, [drawPlayer]);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
main().catch(e => { document.getElementById('status')!.textContent = String(e); console.error(e); });
