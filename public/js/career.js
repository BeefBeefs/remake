/** Professions (manual job.html): Mercenary is the primary one and cannot be returned to; the others are chosen on the Status screen. */
export const CAREERS = ['Mercenary', 'Warrior', 'Wizard', 'Hunter'];
/** Growth table family per profession (Table.Tbd 902/904/906). GUESS: warrior = fighter table (also the mercenary start), wizard = mage, hunter = hybrid. */
export const CLASS_OF = ['fighter', 'fighter', 'mage', 'hybrid'];
/**
 * Table.Tbd 100-103 (4 x 1 each) are per-profession weights of the three skill kinds: Warrior (melee 10, magic 2, ranged 4), Wizard (2, 10, 4), Hunter (5, 2, 10), i.e. what each
 * profession is good at. The real requirement (tables 104-107, 22 categories of arms/magic, 99999 = n/a) is not decoded, so the rule here is a GUESS: level >= 5 and enough use of the matching skill.
 */
export const REQUIRE = { level: 5, uses: [0, 60, 30, 60] };
const KEY = [null, 'melee', 'magic', 'ranged'];
/** Professions the hero may change to now (never Mercenary, never the current one). */
export function careerOptions(current, level, u) {
    const out = [];
    for (let c = 1; c < 4; c++)
        if (c !== current && level >= REQUIRE.level && u[KEY[c]] >= REQUIRE.uses[c])
            out.push(c);
    return out;
}
/**
 * Spell learning, decoded from the exe's level-up routine (0x412fb0): every level-up appends the hero's current class id to a history (one byte per level). Class ids: 16 Mercenary, 6 Warrior, 9 Wizard, 5 Hunter.
 * Score of the current profession p = sum over the history of Table.Tbd (100 + p)[row of the class id] (rows: 0 = Mercenary, 1 = Warrior, 2 = Wizard, 3 = Hunter; Warrior levels count 10 for a Warrior, 2 for a Wizard, 4 for a Hunter ...).
 * Spell n (id 600 + n, 22 entries incl. Transport) is learned as soon as Table.Tbd (104 + p)[n] <= score (99999 = never). Tables 104-107 are the thresholds of Mercenary / Warrior / Wizard / Hunter.
 */
export const CLASS_ID = [16, 6, 9, 5];
const ROW = { 16: 0, 6: 1, 9: 2, 5: 3 };
export function spellScore(tables, career, hist) { const w = tables[String(100 + career)]?.v ?? []; return hist.reduce((a, c) => a + (w[ROW[c] ?? -1] ?? 0), 0); }
/** Spell ids (600 = Transport .. 621) a hero of this profession and level history may know. */
export function spellsFrom(tables, career, hist) {
    const th = tables[String(104 + career)]?.v ?? [], sc = spellScore(tables, career, hist);
    return th.map((t, i) => (t <= sc ? 600 + i : 0)).filter(id => id > 0);
}
//# sourceMappingURL=career.js.map