import type { ClassKind } from './pstats.js';

/** Professions (manual job.html): Mercenary is the primary one and cannot be returned to; the others are chosen on the Status screen. */
export const CAREERS = ['Mercenary', 'Warrior', 'Wizard', 'Hunter'] as const;
/** Growth table family per profession (Table.Tbd 902/904/906). GUESS: warrior = fighter table (also the mercenary start), wizard = mage, hunter = hybrid. */
export const CLASS_OF: ClassKind[] = ['fighter', 'fighter', 'mage', 'hybrid'];
/** Hits dealt since the last level-up (exe 0x4135a3: total at player+0xc0, counters at +0xc4..+0xe4): counter k = hits with a weapon of arms class k (0..7, Item.Ibn field 0), counter 8 = damaging spells (and weapon classes 8 / 9); bare-handed hits only raise the total. Reset at every level-up. */
export interface Usage { n: number[]; total: number; }
export const newUsage = (): Usage => ({ n: Array(9).fill(0), total: 0 });
/**
 * Career choice, decoded from the exe's level-up routine (0x41333b-0x413438): at every level-up from level 5 on, with p[k] = 100 * counter[k] / total (integer %):
 * Wizard is offered when p[8] >= 20 (and the hero is not one), else Hunter when p[5] >= 30 (arms class 5 = bow guns), else Warrior when p[0] + p[1] + p[3] >= 50; otherwise nothing changes.
 * The offer (player+0x30) is what the Status screen's "Change Profession to ..." button shows ("It is possible to change your occupation to [..]" when it changes).
 * Reaching level 5 turns the Mercenary into a Warrior unconditionally (the routine sets both +0x2c and +0x30 to 6).
 */
export function careerTarget(current: number, level: number, u: Usage): number {
  if (level < 5) return current;
  const p = u.n.map(c => (u.total > 0 ? Math.trunc(c * 100 / u.total) : 0));
  if (current !== 2 && p[8]! >= 20) return 2;
  if (current !== 3 && p[5]! >= 30) return 3;
  if (current !== 1 && p[0]! + p[1]! + p[3]! >= 50) return 1;
  return current;
}

/**
 * Spell learning, decoded from the exe's level-up routine (0x412fb0): every level-up appends the hero's current class id to a history (one byte per level). Class ids: 16 Mercenary, 6 Warrior, 9 Wizard, 5 Hunter.
 * Score of the current profession p = sum over the history of Table.Tbd (100 + p)[row of the class id] (rows: 0 = Mercenary, 1 = Warrior, 2 = Wizard, 3 = Hunter; Warrior levels count 10 for a Warrior, 2 for a Wizard, 4 for a Hunter ...).
 * Spell n (id 600 + n, 22 entries incl. Transport) is learned as soon as Table.Tbd (104 + p)[n] <= score (99999 = never). Tables 104-107 are the thresholds of Mercenary / Warrior / Wizard / Hunter.
 */
export const CLASS_ID = [16, 6, 9, 5] as const;
const ROW: Record<number, number> = { 16: 0, 6: 1, 9: 2, 5: 3 };
type Tbl = Record<string, { v: number[] } | undefined>;
export function spellScore(tables: Tbl, career: number, hist: number[]): number { const w = tables[String(100 + career)]?.v ?? []; return hist.reduce((a, c) => a + (w[ROW[c] ?? -1] ?? 0), 0); }
/** Spell ids (600 = Transport .. 621) a hero of this profession and level history may know. */
export function spellsFrom(tables: Tbl, career: number, hist: number[]): number[] {
  const th = tables[String(104 + career)]?.v ?? [], sc = spellScore(tables, career, hist);
  return th.map((t, i) => (t <= sc ? 600 + i : 0)).filter(id => id > 0);
}
