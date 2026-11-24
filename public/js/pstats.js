const CLASS_TABLE = { fighter: 902, mage: 904, hybrid: 906 };
export function playerStats(tables, gender, level, kind = 'fighter') {
    const g = gender === 'male' ? 0 : 1, base = tables[900 + g], cls = tables[CLASS_TABLE[kind] + g];
    const row = (r) => {
        let s = base?.v[r * base.cols] ?? 0;
        if (cls)
            for (let i = 0; i < level - 1 && i < cls.cols; i++)
                s += cls.v[r * cls.cols + i];
        return s;
    };
    return { walk: row(0), aspd: row(1), hp: row(2), mp: row(3), strength: row(4), hit: row(5), eva: row(6), mhit: row(7), meva: row(8) };
}
//# sourceMappingURL=pstats.js.map