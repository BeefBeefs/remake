/** Player stat builder (exe 0x44e34c): level-1 values from Table.Tbd 900/901 (male/female), then one row of the class table per level-up
 *  (902/903 = fighter type, 904/905 = mage type, 906/907 = hybrid). Row meaning is inferred from the status window labels and the class
 *  tables (fighters gain HP, mages gain MP and magic hit/evasion):
 *  0 walking speed %, 1 attack speed % (both flat), 2 HP, 3 MP, 4 strength, 5 hit rate, 6 evasion rate, 7 magic hit rate, 8 magic evasion,
 *  9-12 not identified. Which class table the hero uses is also a guess (fighter: the status window says "Fighter"). */
export interface TableDb { [no: string]: { rows: number; cols: number; v: number[] } }
export interface PlayerStats { hp: number; mp: number; strength: number; hit: number; eva: number; mhit: number; meva: number; walk: number; aspd: number }
export type ClassKind = 'fighter' | 'mage' | 'hybrid';
const CLASS_TABLE: Record<ClassKind, number> = { fighter: 902, mage: 904, hybrid: 906 };

export function playerStats(tables: TableDb, gender: 'male' | 'female', level: number, kind: ClassKind = 'fighter'): PlayerStats {
  const g = gender === 'male' ? 0 : 1, base = tables[900 + g], cls = tables[CLASS_TABLE[kind] + g];
  const row = (r: number) => {
    let s = base?.v[r * base.cols] ?? 0;
    if (cls) for (let i = 0; i < level - 1 && i < cls.cols; i++) s += cls.v[r * cls.cols + i];
    return s;
  };
  return { walk: row(0), aspd: row(1), hp: row(2), mp: row(3), strength: row(4), hit: row(5), eva: row(6), mhit: row(7), meva: row(8) };
}
