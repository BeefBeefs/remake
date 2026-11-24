import { audio } from './audio.js';
const KEY = 'shadowflare_settings';
const DEFAULTS = { music: 5, sfx: 7, darkness: true };
export const settings = { ...DEFAULTS };
try {
    Object.assign(settings, JSON.parse(localStorage.getItem(KEY) ?? '{}'));
}
catch { /* keep defaults */ }
export function applySettings() { audio.setVolumes(settings.music / 10, settings.sfx / 10); }
export function saveSettings() { applySettings(); try {
    localStorage.setItem(KEY, JSON.stringify(settings));
}
catch { /* ignore */ } }
applySettings();
//# sourceMappingURL=settings.js.map