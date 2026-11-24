export const SPELL_FX = {
    601: { elem: 0, mult: 1 }, 602: { elem: 1, mult: 1, stun: 600 }, 603: { elem: 3, mult: 1.1 },
    604: { elem: 0, mult: 1.6, radius: 170 }, // Hell Fire: fire explosion around you
    605: { elem: 1, mult: 1.3, radius: 230, stun: 1800 }, // Ice Blast: ice pillars around you
    608: { elem: -1, mult: 0, dur: 30000, buff: 'berserk' }, // Berserker: attack x1.4, attack speed x1.2
    609: { elem: -1, mult: 0, dur: 30000, buff: 'eshield' }, // Energy Shield: damage is taken from MP first
    610: { elem: 2, mult: 1.5 }, // Earth Spears: pierces a line
    611: { elem: 0, mult: 0.8, count: 5, spread: 0.9 }, // Flame Strike: a fan of fire bullets
    612: { elem: 1, mult: 2.2 }, // Dread Deathscythe: big piercing ice spear
    613: { elem: 3, mult: 1.1, count: 7, radius: 420 }, // Lightning Storm: strikes around the player
    614: { elem: 2, mult: 0.8, stun: 3500 }, // Medusa: curse bullet that petrifies
    615: { elem: -1, mult: 1.5 }, // Sonic Blade: physical shock wave from the weapon
    616: { elem: 2, mult: 1.3 }, // Mud Javelin
    618: { elem: -1, mult: 0, dur: 30000, buff: 'mshield' }, // Magic Shield: magic damage x0.4
    619: { elem: -1, mult: 0, dur: 30000, buff: 'counter' }, // Counter Burst: melee hits are reflected for half their damage
    620: { elem: -1, mult: 2.2, radius: 200 }, // Explosion: the companion jumps and kicks
    621: { elem: 4, mult: 1.5, radius: 150, boom: 1.5 }, // Elemental Strike: spirit bullet that explodes with every element
};
//# sourceMappingURL=spellfx.js.map