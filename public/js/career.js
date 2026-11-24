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
//# sourceMappingURL=career.js.map