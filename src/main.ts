import { App } from './app.js';
import { TitleScene } from './title.js';
import { GameScene } from './game.js';
import { TouchControls } from './touch.js';

async function main() {
  const app = new App(document.getElementById('cv') as HTMLCanvasElement);
  app.run(); (window as any).touch = new TouchControls(app);
  const q = new URLSearchParams(location.search);
  if (q.has('skip')) app.go(await GameScene.create(app, q.get('skip') === 'female' ? 'female' : 'male', 'SHADOW', { ep: +(q.get('ep') ?? 1) }));  // dev shortcut
  else app.go(await TitleScene.create(app));
}
main().catch(e => { document.body.append(String(e)); console.error(e); });
