// Interpreter for Scenario.Scs sentence blocks. Semantics taken from the executor in ShadowFlare.exe (0x430ab0/0x430f80):
//  sentence type 0 = `if (a OP b) call block N` (OP 0 ==, 1 !=, 2 >, 3 <), 1 = assign, 2 = queue a message window (script keeps running),
//  18/21 = talk begin/face, 19 = end talk. Operand kinds: 0-2 constant, 3/4/5 flag tables, 8 = game mode (always 0 offline; quest states set by sentence 62 are kept separately: 1 accepted, 2 completed), 9 = pointer state of an object (reads 0), 10/11/12 global arrays; others read as 0.
// Sentence types that are not implemented yet are logged once and skipped.
export interface ScriptData { flags: [number, number][]; messages: Record<string, string>; status: number[][]; blocks: [number, [number, number][]][][]; }
/** Game-side callbacks used by script sentences. Positions are world units (see docs/FORMATS.md, Maps). */
export interface ScriptHooks {
  /** Operand kind 3: state of a spawn-numbered monster record (1 alive, 0 dead); undefined when the scenario has no such record. */
  entity?(spawn: number): number | undefined;
  charPos(char: number): [number, number] | null;
  /** Sentence 10: create an item (cat 0 weapon, 1 armor, 2 accessory, 3 consumable, 4 misc; cat 4 id 0 = gold with amount) on the ground. */
  drop(cat: number, id: number, a: number, b: number, min: number, max: number): void;
  /** Sentences 22 (show) / 23 (hide): object/zone `id` (10000000 + Mct object id). */
  show(id: number, visible: boolean): void;
  /** Sentence 44: index of the current partner (0 Kerberos, 1 Gravity, 2 Dune, 3 Fang ...), -1 = none. */
  partner(): number;
  /** Sentence 45: take dog `index` as the companion (the previous one goes back to its keeper). */
  swapPartner?(index: number): void;
  /** Sentence 3: show the status of dog `index`. */
  partnerStatus?(index: number): void;
  /** Sentence 24: random item drop of tier `tier` at world position (a, b). */
  randomDrop(tier: number, a: number, b: number): void;
  /** Sentence 62: quest `q` (Table.Tbd table 41 row) changed to `state` (1 accepted, 2 completed). */
  quest(q: number, state: number): void;
  /** Sentences 53/54: read the player's gold / add (negative = pay) gold. */
  gold(): number;
  addGold(delta: number): void;
  /** Sentences 58/59: does the player carry item (category, id) / remove one copy of it. */
  hasItem(cat: number, id: number): boolean;
  takeItem(cat: number, id: number): void;
  /** Sentence 16: play sound effect `id` (index into Voice00.Voc) at world position (a, b). */
  sound(id: number, a: number, b: number): void;
  /** Sentence 17: go to scenario index `scenario`, arriving in its exit zone `entry`. */
  exit(scenario: number, entry: number): void;
  /** Sentences 37 (use the warp gate: destination menu) and 38 (switch this gate on). */
  warp(cmd: 37 | 38): void;
  /** Sentences 31/32: first monster slot (script char number) in [a, b] that is alive / free (dead or not yet summoned), -1 if none. */
  findSlot(a: number, b: number, alive: boolean): number;
  /** Sentence 25: summon the monster of slot `slot` at world position (a, b). */
  spawnSlot(slot: number, a: number, b: number): void;
  /** Sentence 49: show a short notice (area name at map start, hints) for a message id. */
  notice(text: string): void;
  /** Sentence 5: open the trade window of shop `index`. */
  openShop(index: number): void;
  /** Sentence 61: the player's current level. */
  level(): number;
}
export interface Pending { msg: number; text: string; resultVar: [number, number] | null; }
const warned = new Set<number>();

export class ScriptVM {
  vars = new Map<string, number>();
  /** Kinds 10-12 (quest switches / counters) are global across scenarios. */
  globals = new Map<string, number>();
  queue: Pending[] = [];
  /** Values for the %d placeholders of the next message (set by sentence 51). */
  private fmt: number[] = [];
  get pending(): Pending | null { return this.queue[0] ?? null; }
  talking = false; private ended = false;
  hooks: ScriptHooks | null = null;
  constructor(public data: ScriptData) { for (const [id, v] of data.flags) this.vars.set(`4:${id}`, v); }
  static async load(scenario: string) { return new ScriptVM(await (await fetch(`data/ep1/scenario/${scenario}.script.json`)).json()); }

  get(kind: number, val: number): number {
    if (kind <= 2) return val;
    if (kind === 8) return 0;   // operand 8 = game mode of the exe (0x482db0): 0 offline; scripts only compare it with 0/2 (always [8,0])
    if (kind >= 10 && kind <= 12) return this.globals.get(`${kind}:${val}`) ?? 0;
    if (kind === 3) { const e = this.hooks?.entity?.(val); if (e !== undefined) return e; }
    if (kind >= 3 && kind <= 5) return this.vars.get(this.key(kind, val)) ?? 0;
    if (kind === 6 || kind === 7) return Math.round(this.hooks?.charPos(val)?.[kind - 6] ?? 0);
    return 0;
  }
  set(kind: number, val: number, v: number) { if (kind >= 10 && kind <= 12) this.globals.set(`${kind}:${val}`, v); else if (kind >= 3 && kind <= 5) this.vars.set(this.key(kind, val), v); }
  /** Kind 5 = per-object locals: a value 1000000+n is local n of the current object; n*100000000 + id is local n-1 of object `id` (1e8 -> local 0, 2e8 -> local 1 ...). */
  private key(kind: number, val: number) { if (kind !== 5) return `${kind}:${val}`; if (val < 100000000) return `5:${this.char}:${val}`; const n = Math.floor(val / 100000000); return `5:${val - n * 100000000}:${1000000 + n - 1}`; }

  /** Run block n; returns false if a sentence aborted the run. */
  runBlock(n: number, depth = 0): boolean {
    const b = this.data.blocks[n]; if (!b || depth > 32) return true;
    for (const [type, ops] of b) if (!this.exec(type, ops, depth)) return false;
    return true;
  }
  private exec(type: number, o: [number, number][], depth: number): boolean {
    const ev = (i: number) => o[i] ? this.get(o[i][0], o[i][1]) : 0;
    switch (type) {
      case 0: {
        const a = ev(0), b = ev(2); let ok = false;
        switch (o[1][1]) { case 0: ok = a === b; break; case 1: ok = a !== b; break; case 2: ok = a > b; break; case 3: ok = a < b; break; }
        return ok ? this.runBlock(o[3][1], depth + 1) : true;
      }
      case 1: this.set(o[0][0], o[0][1], ev(1)); return true;
      case 2: {
        const msg = ev(0); let text = this.data.messages[String(msg)];
        if (text === undefined) return true;
        text = text.replace(/%(\d*)d/g, (_, w) => String(this.fmt.shift() ?? 0).padStart(Number(w) || 0));
        this.queue.push({ msg, text, resultVar: o[1] && o[1][1] !== -1 ? [o[1][0], o[1][1]] : null });
        return true;
      }
      case 10: this.hooks?.drop(ev(0), ev(1), ev(2), ev(3), ev(4), o[5] ? ev(5) : ev(4)); return true;
      // 22/23 also set local 0 of the object ("currently shown"), which the partner polls read back through operand kind 5.
      case 22: this.vars.set(`5:${ev(0)}:1000000`, 1); this.hooks?.show(ev(0), true); return true;
      case 23: this.vars.set(`5:${ev(0)}:1000000`, 0); this.hooks?.show(ev(0), false); return true;
      case 14: { const d = ev(1); this.set(o[0][0], o[0][1], d ? Math.trunc(ev(0) / d) : 0); return true; }
      case 15: { const d = ev(1); this.set(o[0][0], o[0][1], d ? ev(0) % d : 0); return true; }
      case 39: { const lo = ev(0), hi = ev(1); this.set(o[2][0], o[2][1], lo + Math.floor(Math.random() * Math.max(1, hi - lo + 1))); return true; }   // random in [lo, hi]
      case 3: this.hooks?.partnerStatus?.(ev(0)); return true;
      case 45: this.hooks?.swapPartner?.(ev(0)); return true;
      case 44: this.set(o[0][0], o[0][1], this.hooks?.partner() ?? -1); return true;
      case 34: this.set(o[1][0], o[1][1], -1); return true;   // zone/player interaction state: -1 = not applicable (the town gate is hard-wired in game.ts)
      // Decoded but not simulated yet: 27 named warp zone, 46/56 object state fields, 36/30/33 spawn hazard/effect objects, 65 ambient colour.
      case 35: this.set(o[2][0], o[2][1], 0); return true;   // (x, y, var): terrain/judge value at a position, not modelled
      case 28: case 29: case 27: case 46: case 56: case 36: case 30: case 33: case 65: return true;
      case 31: this.set(o[2][0], o[2][1], this.hooks?.findSlot(ev(0), ev(1), true) ?? -1); return true;
      case 32: this.set(o[2][0], o[2][1], this.hooks?.findSlot(ev(0), ev(1), false) ?? -1); return true;
      case 25: this.hooks?.spawnSlot(ev(0), ev(1), ev(2)); return true;   // (slot, x, y, effect type)
      case 5: this.hooks?.openShop(ev(0)); return true;
      case 51: { this.fmt = []; for (const [k, v] of o) { if (k === 0 && v === -1) break; this.fmt.push(this.get(k, v)); } return true; }   // arguments of the next message's %d
      case 52: this.set(o[1][0], o[1][1], 0); return true;   // repair cost of the item in an equipment slot: items have no durability yet -> 0
      case 55: this.set(o[0][0], o[0][1], 0); return true;   // 1 when the player carries unidentified items (not modelled) -> 0
      case 53: this.set(o[0][0], o[0][1], this.hooks?.gold() ?? 0); return true;
      case 54: this.hooks?.addGold(-ev(0)); return true;
      case 58: this.set(o[2][0], o[2][1], this.hooks?.hasItem(ev(0), ev(1)) ? 1 : 0); return true;   // quest hand-in check (no selection UI: any matching item counts)
      case 59: this.hooks?.takeItem(ev(0), ev(1)); return true;
      case 49: { const t = this.data.messages[String(ev(0))]; if (t) this.hooks?.notice(t.replace(/\s+$/, '')); return true; }
      case 50: case 57: case 66: this.set(o[0][0], o[0][1], 0); return true;   // read player/exe state (arrival id, player+0x28, ...): not modelled, 0
      case 6: return true;
      case 9: case 4: return true;   // repair an item / coin sound (no durability yet)
      case 17: this.hooks?.exit(ev(0), ev(1)); return true;
      case 16: this.hooks?.sound(ev(0), ev(2), ev(3)); return true;   // (sound id, 0, x, y)
      case 24: this.hooks?.randomDrop(ev(0), ev(1), ev(2)); return true;
      case 11: this.set(o[0][0], o[0][1], ev(0) + ev(1)); return true;
      case 13: this.set(o[0][0], o[0][1], ev(0) * ev(1)); return true;   // multiply: used with 14 to scale a door/lift animation to 0-1000
      case 37: case 38: this.hooks?.warp(type as 37 | 38); return true;
      // 42/43/63 (a, b): per-player checks run before NPC quest talk (party / network conditions); the script then tests a != b. Offline they always pass.
      case 42: case 43: case 63: this.set(o[0][0], o[0][1], 0); this.set(o[1][0], o[1][1], 0); return true;
      // No offline effect / visual only: 7 8 (talk begin/end markers), 20 (partner hire dialog), 26 (loot burst effect), 40 (object move effect), 41 (unused town object), 45 (partner candidate), 60 (effect), 64, 72.
      case 7: case 8: case 20: case 26: case 40: case 41: case 60: case 64: case 72: return true;
      case 12: this.set(o[0][0], o[0][1], ev(0) - ev(1)); return true;
      case 62: { const q = ev(0), st = ev(1); if (st === 2) { if (this.globals.get(`q:${q}`) === 2) return true; }   // a quest completes only once (exe keeps a done flag per quest)
        this.globals.set(`q:${q}`, st); this.hooks?.quest(q, st); return true; }
      case 61: this.set(o[0][0], o[0][1], this.hooks?.level() ?? 1); return true;   // handler at 0x433f16 reads the player's level (player+0x34)
      case 48: return true;   // quest notice popup: shown by the quest hook
      case 18: this.talking = true; return true;
      case 19: this.ended = true; return true;
      case 21: return true;
      default:
        if (!warned.has(type)) { warned.add(type); console.warn('script: unimplemented sentence type', type, JSON.stringify(o)); }
        return true;
    }
  }
  private runStatus(status: number, char: number) {
    for (const [, s, c, blk] of this.data.status) if (s === status && c === char) { this.runBlock(blk); return true; }
    return false;
  }
  /** Fire a scenario event: status 4 = character `char` (14000000 + Mct id) was killed. Returns true when a handler existed. */
  event(status: number, char: number) { this.char = char; this.ended = false; const r = this.runStatus(status, char); return r; }
  /** Run every status-5 block (condition polls such as quest progress checks). */
  poll() { this.char = 0; this.ended = false; for (const [, st, c, blk] of this.data.status) if (st === 5 && c === 4294967295) this.runBlock(blk); }
  /** Player clicked character `char` (Scenario char number, e.g. 12000000 + Mct id). */
  talk(char: number) { this.char = char; this.talking = true; this.ended = false; this.queue = []; this.runStatus(0, char); this.finish(); }
  /** The message window was closed; `choice` is the picked option index (when the message had options). */
  advance(choice: number) {
    const p = this.queue.shift();
    if (p?.resultVar) this.set(p.resultVar[0], p.resultVar[1], choice);
    if (!this.queue.length && !this.ended) this.runStatus(1, this.char);
    this.finish();
  }
  private char = 0;
  private finish() { if (!this.queue.length) this.talking = false; }
}
