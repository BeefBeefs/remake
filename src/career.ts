import type { ClassKind } from './pstats.js';

/** Professions (manual job.html): Mercenary is the primary one and cannot be returned to; the others are chosen on the Status screen. */
export const CAREERS = ['Mercenary', 'Warrior', 'Wizard', 'Hunter'] as const;
/** Growth table family per profession (Table.Tbd 902/904/906). GUESS: warrior = fighter table (also the mercenary start), wizard = mage, hunter = hybrid. */
export const CLASS_OF: ClassKind[] = ['fighter', 'fighter', 'mage', 'hybrid'];
export interface Usage { melee: number; magic: number; ranged: number; }
/**
 * Table.Tbd 100-103 (4 x 1 each) are per-profession weights of the three skill kinds: Warrior (melee 10, magic 2, ranged 4), Wizard (2, 10, 4), Hunter (5, 2, 10), i.e. what each
 * profession is good at. The real requirement (tables 104-107, 22 categories of arms/magic, 99999 = n/a) is not decoded, so the rule here is a GUESS: level >= 5 and enough use of the matching skill.
 */
export const REQUIRE = { level: 5, uses: [0, 60, 30, 60] as const };
const KEY: (keyof Usage | null)[] = [null, 'melee', 'magic', 'ranged'];
/** Professions the hero may change to now (never Mercenary, never the current one). */
export function careerOptions(current: number, level: number, u: Usage): number[] {
  const out: number[] = [];
  for (let c = 1; c < 4; c++) if (c !== current && level >= REQUIRE.level && u[KEY[c]!] >= REQUIRE.uses[c]) out.push(c);
  return out;
}

/**
 * Spell learning (manual: "the types of magic and the order in which spells are learned depend on the player's profession and their basic attributes").
 * The real rules are not decoded (Tables 104-107 / skill data), so this tree is a GUESS: [spell id, professions that may learn it (0 Mercenary 1 Warrior 2 Wizard 3 Hunter), hero level needed].
 * Heal (606) and Fire Ball (601) are known from the start.
 */
export const SPELL_TREE: [id: number, careers: number[], level: number][] = [
  [606, [0, 1, 2, 3], 1], [601, [0, 1, 2, 3], 1], [617, [0, 1, 2, 3], 4], [602, [0, 1, 2, 3], 6],
  [608, [1], 8], [615, [1], 12], [619, [1], 15],
  [603, [2, 3], 10], [610, [2], 8], [604, [2], 12], [605, [2], 14], [609, [2], 10], [618, [2], 16], [611, [2], 18], [613, [2], 22], [612, [2], 20], [621, [2], 30],
  [616, [3], 8], [614, [3], 12], [607, [0, 1, 2, 3], 10], [620, [3], 14],
];
/** Spells a hero of this profession and level may know. */
export function spellsFor(career: number, level: number): number[] { return SPELL_TREE.filter(([, c, l]) => c.includes(career) && level >= l).map(([id]) => id); }
