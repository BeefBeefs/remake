import type { SaveData } from './game.js';

/** Six character slots like the original (manual: "The boxes numbered from 1 to 6 on the screen are saved data files"). Stored in localStorage, one key per slot. */
export const SLOTS = 6;
const key = (i: number) => `shadowflare_save_slot${i}`;
const LEGACY = 'shadowflare_save_v1';

export function readSlot(i: number): SaveData | null { try { const t = localStorage.getItem(key(i)); return t ? JSON.parse(t) : null; } catch { return null; } }
export function writeSlot(i: number, d: SaveData): boolean { try { localStorage.setItem(key(i), JSON.stringify(d)); return true; } catch (e) { console.warn('save failed', e); return false; } }
export function deleteSlot(i: number) { try { localStorage.removeItem(key(i)); } catch { /* ignore */ } }
/** Moves the single save of the first prototype (one key) into slot 1. */
export function migrateLegacy() {
  try {
    const t = localStorage.getItem(LEGACY); if (!t) return;
    if (!localStorage.getItem(key(0))) localStorage.setItem(key(0), t);
    localStorage.removeItem(LEGACY);
  } catch { /* ignore */ }
}
export function listSlots(): (SaveData | null)[] { migrateLegacy(); return Array.from({ length: SLOTS }, (_, i) => readSlot(i)); }
export function firstFree(): number { return listSlots().findIndex(d => !d); }
