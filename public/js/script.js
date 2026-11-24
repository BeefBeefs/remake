const warned = new Set();
export class ScriptVM {
    get pending() { return this.queue[0] ?? null; }
    constructor(data) {
        this.data = data;
        this.vars = new Map();
        /** Kinds 10-12 (quest switches / counters) are global across scenarios. */
        this.globals = new Map();
        this.queue = [];
        this.talking = false;
        this.ended = false;
        this.hooks = null;
        this.char = 0;
        for (const [id, v] of data.flags)
            this.vars.set(`4:${id}`, v);
    }
    static async load(scenario) { return new ScriptVM(await (await fetch(`data/ep1/scenario/${scenario}.script.json`)).json()); }
    get(kind, val) {
        if (kind <= 2)
            return val;
        if (kind === 8 || (kind >= 10 && kind <= 12))
            return this.globals.get(`${kind}:${val}`) ?? 0;
        if (kind >= 3 && kind <= 5)
            return this.vars.get(`${kind}:${val}`) ?? 0;
        if (kind === 6 || kind === 7)
            return Math.round(this.hooks?.charPos(val)?.[kind - 6] ?? 0);
        return 0;
    }
    set(kind, val, v) { if (kind === 8 || (kind >= 10 && kind <= 12))
        this.globals.set(`${kind}:${val}`, v);
    else if (kind >= 3 && kind <= 5)
        this.vars.set(`${kind}:${val}`, v); }
    /** Run block n; returns false if a sentence aborted the run. */
    runBlock(n, depth = 0) {
        const b = this.data.blocks[n];
        if (!b || depth > 32)
            return true;
        for (const [type, ops] of b)
            if (!this.exec(type, ops, depth))
                return false;
        return true;
    }
    exec(type, o, depth) {
        const ev = (i) => o[i] ? this.get(o[i][0], o[i][1]) : 0;
        switch (type) {
            case 0: {
                const a = ev(0), b = ev(2);
                let ok = false;
                switch (o[1][1]) {
                    case 0:
                        ok = a === b;
                        break;
                    case 1:
                        ok = a !== b;
                        break;
                    case 2:
                        ok = a > b;
                        break;
                    case 3:
                        ok = a < b;
                        break;
                }
                return ok ? this.runBlock(o[3][1], depth + 1) : true;
            }
            case 1:
                this.set(o[0][0], o[0][1], ev(1));
                return true;
            case 2: {
                const msg = ev(0);
                const text = this.data.messages[String(msg)];
                if (text === undefined)
                    return true;
                this.queue.push({ msg, text, resultVar: o[1] && o[1][1] !== -1 ? [o[1][0], o[1][1]] : null });
                return true;
            }
            case 10:
                this.hooks?.drop(ev(0), ev(1), ev(2), ev(3), ev(4));
                return true;
            case 11:
                this.set(o[0][0], o[0][1], ev(0) + ev(1));
                return true;
            case 12:
                this.set(o[0][0], o[0][1], ev(0) - ev(1));
                return true;
            case 62: {
                const q = ev(0), st = ev(1);
                this.globals.set(`8:${q}`, st);
                this.hooks?.quest(q, st);
                return true;
            }
            case 48: return true; // quest notice popup: shown by the quest hook
            case 18:
                this.talking = true;
                return true;
            case 19:
                this.ended = true;
                return true;
            case 21: return true;
            default:
                if (!warned.has(type)) {
                    warned.add(type);
                    console.warn('script: unimplemented sentence type', type, JSON.stringify(o));
                }
                return true;
        }
    }
    runStatus(status, char) {
        for (const [, s, c, blk] of this.data.status)
            if (s === status && c === char) {
                this.runBlock(blk);
                return true;
            }
        return false;
    }
    /** Fire a scenario event: status 4 = character `char` (14000000 + Mct id) was killed. Returns true when a handler existed. */
    event(status, char) { this.ended = false; const r = this.runStatus(status, char); return r; }
    /** Player clicked character `char` (Scenario char number, e.g. 12000000 + Mct id). */
    talk(char) { this.char = char; this.talking = true; this.ended = false; this.queue = []; this.runStatus(0, char); this.finish(); }
    /** The message window was closed; `choice` is the picked option index (when the message had options). */
    advance(choice) {
        const p = this.queue.shift();
        if (p?.resultVar)
            this.set(p.resultVar[0], p.resultVar[1], choice);
        if (!this.queue.length && !this.ended)
            this.runStatus(1, this.char);
        this.finish();
    }
    finish() { if (!this.queue.length)
        this.talking = false; }
}
//# sourceMappingURL=script.js.map