import { audio } from './audio.js';

/** Player options (Settings Menu of the original: screen/effect switches and info). Stored in localStorage; music and effect volume are additions of the remake. */
export interface Settings { music: number; sfx: number; darkness: boolean; }
const KEY = 'shadowflare_settings';
const DEFAULTS: Settings = { music: 5, sfx: 7, darkness: true };

export const settings: Settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { /* keep defaults */ }
export function applySettings() { audio.setVolumes(settings.music / 10, settings.sfx / 10); }
export function saveSettings() { applySettings(); try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ } }
applySettings();
