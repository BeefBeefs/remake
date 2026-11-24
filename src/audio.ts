/** WebAudio wrapper: looping background music (data/ep1/audio/bgmN.ogg, title.ogg) and one-shot sound effects (sfxN.ogg = Voice00.Voc entry N). */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private cache = new Map<string, Promise<AudioBuffer | null>>();
  private music: { src: AudioBufferSourceNode; gain: GainNode; name: string } | null = null;
  private want = '';
  muted = false; musicVol = 0.5; sfxVol = 0.7;
  constructor() {
    const unlock = () => { this.ensure(); if (this.ctx?.state === 'suspended') this.ctx.resume(); };
    for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, unlock);
  }
  private ensure() { if (!this.ctx) { try { this.ctx = new AudioContext(); } catch { /* no audio available */ } } return this.ctx; }
  private load(name: string) {
    let p = this.cache.get(name);
    if (!p) {
      p = (async () => { const c = this.ensure(); if (!c) return null; try { return await c.decodeAudioData(await (await fetch(`data/ep1/audio/${name}.ogg`)).arrayBuffer()); } catch { return null; } })();
      this.cache.set(name, p);
    }
    return p;
  }
  /** Start looping music `name` (e.g. 'bgm1'); no-op when it is already playing. */
  async bgm(name: string) {
    this.want = name;
    if (this.music?.name === name) return;
    const buf = await this.load(name), c = this.ctx;
    if (!buf || !c || this.want !== name) return;
    this.stopMusic();
    const src = c.createBufferSource(), gain = c.createGain(); src.buffer = buf; src.loop = true; gain.gain.value = this.muted ? 0 : this.musicVol;
    src.connect(gain).connect(c.destination); src.start(); this.music = { src, gain, name };
  }
  stopMusic() { try { this.music?.src.stop(); } catch { /* already stopped */ } this.music = null; }
  /** Play sound effect `id` once. */
  async sfx(id: number, vol = 1) {
    if (this.muted || id < 0) return;
    const buf = await this.load(`sfx${id}`), c = this.ctx; if (!buf || !c) return;
    const src = c.createBufferSource(), gain = c.createGain(); src.buffer = buf; gain.gain.value = this.sfxVol * vol; src.connect(gain).connect(c.destination); src.start();
  }
  /** Volumes 0-1 (Settings menu). */
  setVolumes(music: number, sfx: number) { this.musicVol = music; this.sfxVol = sfx; if (this.music) this.music.gain.gain.value = this.muted ? 0 : this.musicVol; }
  toggleMute() { this.muted = !this.muted; if (this.music) this.music.gain.gain.value = this.muted ? 0 : this.musicVol; return this.muted; }
}
export const audio = new AudioEngine();
