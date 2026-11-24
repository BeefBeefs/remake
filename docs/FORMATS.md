# ShadowFlare (Episode 1, v2.001) file formats — working notes

Engine: "RKC" libraries by Denyusha (RKC_*.dll). Everything below was derived by inspecting the data and disassembling `RK_FUNCTION.dll`.

## Installer
`sf1.exe` is an LHA (lh5, level-2 headers) self-extractor holding `SFSetup.exe`, `Data.sma`, `Setup.sma`, `ReadMe.txt`. `tools/lhx.c` extracts it.

## .sma container (`Data.sma`)
```
"SMAFile\0"  u32 version(1)  u32 unknown  u32 fileCount
repeat fileCount: u32 nameLen, name (cp932, backslash paths), u32 size, data
```
Parsed by `tools/sma.py`.

## RCLIB-L compression (`RK_LzDecodeMemoryToMemory`)
16-byte header: `"RCLIB-L\x1a"`, u32 originalSize, u32 compressedSize. Then LZSS: 4096-byte zeroed window, write position starts at 0xFEE,
flag byte read MSB-first; bit 1 = match (2 bytes: pos = b0 | (b1&0xF0)<<4, len = (b1&0x0F)+3), bit 0 = literal. Implemented in `tools/rclib.py` (verified: output size matches exactly on Gnd/Njp files).
`RCLIB-H` (Huffman) also exists; not yet needed.

## .njp sprite sheets (`UnitePatData` / `NJudgeUniPat` / `ShadowLowPat`, v002/v003)
Parsed by `tools/njp.py` (derived from `RKC_UPDIB.dll`; all 484 .njp/.sdw files parse to exactly EOF).
```
magic[16]  u32 imageCount  [v3: u32 totalBytes]
imageCount x { u32 bpp, u32 w, u32 h, u32 compressed } + RCLIB-L block (or raw)   // DIB: bottom-up, stride padded to 4 bytes
u32 patternCount  [v3: u32 totalParts]
patternCount x { u32 partCount, i32 rect[4], [UnitePatData only: 168-byte judgement block], u32 defaultPalette,
                 partCount x { u32 flag, i32 imageIndex, i32 x, i32 y, u32 b, u32 scaleX(1000=1.0), u32 scaleY } }
u32 paletteCount, paletteCount x 256 x (R,G,B,0)
[v>=2: u32 hasNames, then per pattern: u32 len + cp932 name]
```
bpp is 8 or 4 (4-bit: high nibble is the left pixel); `ShadowLowPat` (.sdw) images are 1-bit masks. Palette index 0 is the transparent key.
Patterns usually hold one part; `imageIndex == imageCount` means empty. Character .njp files have one palette per colour variant.

## .caf character animation (`CHRAnimation000-002`)
Parsed by `tools/caf.py` (derived from `RKC_RPGSCRN.dll`):
```
magic[16]  u32 animCount
animCount x { u16 attr, 9 x { u32 layerCount, u16 frameCount, layerCount x { u32 n, n x { u16 a, u16 duration(1000), u32 patternIndex, u16 flags } } } }
u32, u32 trailer
```
The 9 groups are directions (8 + 1 spare); the player has 23 layers per direction (body, equipment variants, weapon...) whose
pattern indices point into the matching `Animation00.Njp`. Equipment-to-layer mapping is still TODO.

## Maps

A map `NAME` consists of three files: `Ground/NAME.Gnd`, `Object/NAME.Obl`, `Pattern/NAME.Lst`.

**Lst** – 64 text lines (cp932); line index = *slot*. `?` = unused slot. Each used line names an `.njp` sprite set (or `.sdw` shadow set) in `Pattern/`. The leading slots whose first image is a full 64x48 chip are *ground sets* (6 for 3rd_2-1). A `.sdw` entry directly after an object set (slot+1) holds that set's shadow masks (same pattern indices).

**Gnd** – 16-byte magic header, then `w,h,chipW,chipH` (u32 x4, 200x200 cells of 64x48), a flag byte and an RCLIB-L block holding `w*h` cells of 3 x i16 `(base, slot, pattern)`:
- `base`: index into the *concatenated* patterns of the ground sets (slot 0 first). 0 with slot 0/pattern 0 = empty.
- `slot, pattern`: overlay. Slots < groundSlots are ground overlays drawn on the cell; higher slots are decor objects anchored at cell centre x, cell top + 40.
A second RCLIB-L block follows: the **judge grid**, 568 x 569 u16 cells (row-major), each a 160 x 160 square in *world* (a,b) space (header words at +32/+36 = 160). Cell index: `gx = floor(a/160) + 1`, `gy = floor(b/160) + 268` (fitted: 2575 of 2577 tree objects sit on blocked cells). Values: 0 = free, 1 = blocked (outside the map and under trees/rocks/water), 3 = free special zone (paths / event areas, meaning unknown), plus a single 0x8000 flag cell (probably a start/marker point). The world->real transform means the grid is a 45-degree diamond in screen space. Grid size depends on the map: with R = (w*chipW, h*chipH) in real pixels, `amax = (Rh*10 + Rw*100/15)/2`, `jw = floor(amax/160)+2`, `ob = ceil((Rw*100/15/2)/160)+1`, `jh = ob + ceil((Rh*10/2)/160) + 1`, origin = (160, ob*160) (3rd_2-1: 568x569, f00_01: 852x852). Verified on Remote Town (f00_01), where blocked cells trace the palisade, barrels and tree trunks exactly. The 0x8000-flagged cells are a *zone* (13x4 cells on f00_01, in the wall ring: probably the town exit), not a spawn point; `convert_map.py` therefore computes `spawn` itself (marker if walkable, else the walkable cell nearest the object centroid).

**Obl** – header (16 bytes), u32 count, then 42-byte records: `i32 x, i32 y` (world coords), 9 x i16 (slot, pattern, -1, 1000, flags, 0, 1000, 1000, 1000), 4 x i32 judgement rect.

**World -> real pixels** (RKC_RPGSCRN::CalcRealPos, default params 15/10, confirmed visually against the ground):
`rx = (wx - wy) * 15 / 100`, `ry = (wx + wy) * 10 / 100`. Objects are depth sorted by `ry`; `ry` is also the sprite's foot position.

`tools/convert_map.py NAME` exports `public/data/ep1/maps/NAME.json` plus the used sprite sets; `src/map.ts` renders it and `public/play.html` (`src/game.ts`) lets the player walk (WASD/arrows, Shift = run). Player layers 1,0,3 are drawn (shadow, body, one equipment variant) -- the layer-to-equipment mapping and the direction order are still guesses.

## Other formats (headers seen, not yet decoded)
| ext | magic | role (guess) |
|---|---|---|

| .gnd | `RPGSCRN_GNDv000` | ground tile layer (RCLIB blocks) |
| .obl | `RPGSCRN_OBJv001` | map object layer |
| .map / .lst | text list of .njp names | map pattern lists |
| .sdw | `ShadowLowPat003` | shadow sprites |
| .scs | `ScenaScriptV000` | scenario script bytecode |
| .mct | `MCED DATA v0000` | map/scenario parameters |
| .tbd / .ibn / .aid | `TABLE DATA V000` / `SFItemDataV0000` / `RKC_AIDATA v001` | tables, items, AI |
| .voc | `VoiceData  V003` | audio (BGM + voice) |
| `Item.Ibn` | | RCLIB block header does not decode to its stated size — likely extra transform, TODO |

## Roadmap
1. Njp/Caf -> PNG atlas + JSON converter  2. Gnd/Obl/Map renderer (isometric/oblique tiles)  3. Player movement + animation
4. Scs script VM + scenario flow  5. Items/Tbd/Aid: combat, enemies, skills  6. Audio (.voc)  7. UI, save/load  8. Episode 1 playthrough

## GUI / HUD (System/**.njp)

All UI sprite sets are ordinary `.njp` files whose pattern rects hold **absolute positions in the 640x480 screen**, so a screen is just "draw pattern N (palette P) at its own position". `tools/build_gui.py` converts them to `public/data/ep1/gui/<Dir>_<Name>`, `tools/sheet.py in.njp out.png [first count cols]` makes contact sheets.

- **Game/Bar** (HUD): 8 = bottom panel (0,412, 640x68), 7 = edge strip above it (0,400), HP bar 2 (backing) + 0 (fill, 206x12 at 81,426), MP bar 5 + 3 (106,453), EXP frame 15 + fill 14, RUN/WALK highlights 11/10, 19..28 = 6x9 digits (level at ~52,465). 17/16/18 are white hit masks for MENU / ITEM / STATUS.
- **Game/Status**: 5 = STATUS/MAGIC window left half (0,0 320x416, value fields at fixed spots, see `src/windows.ts`), 7+8 = item grid window (320x200 + 320x216; drawn at x=320 in-game), 2/3 = magic window (x=320), 10/58/59 = shop/trade frames, 60+ small icons and bars.
- **Common/Font00**: pattern 0 = 6x12 half-width bitmap font, 16x16 cells indexed by byte value (index 1 = white). Patterns 2.. = 12x12 full-width glyph sheets (16x16 cells each, JIS-ordered, not mapped yet). Font01 = second style.
- **Title/Title**: 0 = backdrop, 1/2/3 = NEW GAME / LOAD GAME / EXIT (palette 1 normal, 3 bright), 4 = copyright, 5 = ornate frame used by the select screens.
- **Select/Select**: 36 = CREATE NEW CHARACTER header, 7/8 male portrait (dark/lit), 9/10 female, 4/5 OK, 2/3 BACK, 34 NAME label, 38/39 dialog frames.
- **System** (Common/Game): 0/1 = mouse cursor (normal/pressed).
- Other sets seen: Game/Card (69 cards), Game/Item00xx (inventory icons), MagicIcon/MagicBarIcon/JobIcon/StatusIcon/MapIcon, Hukidasi (+ .sdw) speech balloons, Dark (darkness overlay), Common/Visual0x (full-screen cut-ins), Waiting.

## Parameter files (System/Game/Parameter)

**Table.Tbd** ("TABLE DATA V000"): 16-byte magic, u32 1, RCLIB-L block (at 0x14). Decoded: u32 tableCount (138), then per table `u32 tableNo, rows, cols; rows*cols x i32; rows*cols x (u32 length + cp932 string)`. Parses to exactly the end of the data (`tools/tbd.py`, exported to `data/ep1/tables.json`). Known: **table 13** = cumulative EXP needed to leave level n (25, 80, 150, 200, 300, ... 100 rows). The 22-row tables (16-21, 27, 35, 70-78, 104-107) are probably per-class/character parameters; not mapped yet.

**Item.Ibn** ("SFItemDataV0000"): 16-byte magic, u32 key (ignored), u32 1, then an RCLIB-L block at 0x18 whose bytes **from file offset 0x28 on are passed through a 256-byte substitution table** (permutation of 0..255 built on the stack in ShadowFlare.exe at 0x46302d, copied to `tools/ibn.py`) before LZ decoding. Decoded layout is five sections, each `u32 count` + records of `u32 len + bit-inverted cp932 name, u32 len + bit-inverted type name, N bytes of i32 fields`:

| section | meaning | count | field bytes |
|---|---|---|---|
| 0 | weapons | 1264 | 804 |
| 1 | armor / shields / hats / boots | 1281 | 764 |
| 2 | accessories | 239 | 672 |
| 3 | consumables | 31 | 140 |
| 4 | quest / misc items | 45 | 100 |

Fields known so far (index): 1 = item id (category*1e6 + n), 5 = price, 7/8 = footprint in inventory cells (w x h), 11 = icon pattern in `System/Game/Pattern/Item0000.njp`, 15-21 = 1000-based multipliers; weapon stat blocks start around 25 (probably attack min/max/speed) and (min, max, 100) triples at 60+, 84+ (element/status boosts). `tools/build_data.py` writes `data/ep1/items.json` (zero fields omitted).

## Scenario/<id>/ (Scenario.Scs, .Mct, .Njp)

Folders: 00000000 (Remote Town, map f00_01), 00000001.., 000100xx, 01000000.., 99000000.. (36 total).

**Scenario.Scs** ("ScenaScriptV000\0"), layout from RKC_RPG_SCRIPT::ReadBinary (parses exactly to EOF, `tools/scs.py`):
`u32 n; n x (u32 id, i32 value)` flag list A (ids 1000000+, initial values), `u32 n; ...` flag list B (empty in scenario 0), `u32 n; n x (u32 id, u32 len, bytes)` **messages** (bit-inverted cp932, real English dialogue, ids 1000000+), `u32 n; n x 4 x u32` status table, `u32 n` sentence blocks, each `u32 m; m x { u32 id; u32 k; k x (u32 opcode, i32 operand) }`. Execution (decoded from the executor in ShadowFlare.exe: block runner 0x430ab0, sentence switch 0x430f80, operand evaluator 0x4346b0, assignment 0x434920; reimplemented in `src/script.ts`):

* A *block* is a list of sentences run in order; a sentence returning 0 aborts the run. The *status table* `(net, status, character, block)` gives entry points: status 7 = map start, 0 = player talks to character `12000000 + Mct id`, 1 = the message window was closed (re-run after every message until the script executes sentence 19), 5/3 = other events.
* Operands are `(kind, value)`. Kinds 0-2 constants; 3/4/5 flag tables (4 = ids 1000000+ initialised from the file's flag list A); 6/7 = X/Y world position of a character; 8 global; 10/11/12 global int arrays (11/12 hold quest switches); 13 player stat.
* Sentence types implemented: **0** `if (op0 CMP op2) call block op3` with CMP in op1 (0 `==`, 1 `!=`, 2 `>`, 3 `<`); **1** `var = value`; **2** queue message `(msg, resultVar, mode, n)` — the script keeps running and the window appears when the run finishes (messages mark clickable options as `~text~`; the picked index goes to resultVar); **10** create item `(category, id, x, y, minAmount, maxAmount)` on the ground (category = Item.Ibn section, id = item field 1, category 4 id 0 = gold); **11/12** add/subtract; **18/21** talk begin/face; **19** end talk. Others (shops 5, 52-55, quest state 62/48, warps, ...) are still to do.

**Scenario.Mct** ("MCED DATA v0000"): editor dump containing uninitialised memory (stack pointers) after the three path strings, then the map path ("Map\f00_01.map"), a zero-padded 256-byte scenario name ("Remote Town") and per-character records (see tools/mct.py and docs/PROGRESS.md for the record layout; names: Ostare, Malse, Syria, Kerberos, Gravity, Dune, Harley...). Not decoded yet.


## Voc audio (`VoiceData  V003`)
`magic[16]`, u32 entry count, u32 type, then entries; each entry = 512-byte header (name at +0, zero padded; entry 0 starts at offset 28) + 16-byte PCM WAVEFORMAT + 2 ASCII bytes (`da`, `fa` in the boss track: probably a loop flag) + u32 data size + raw PCM. `System/Game/Music/BGM00-06.Voc` (city, field, villedge, boss, dungeon, cave, ending) are single 8-bit unsigned stereo 22050 Hz loops (~55-72 s); `System/Title/Music/BGM00.Voc` is 8-bit mono 12 kHz; `System/Game/Voice/Voice00.Voc` holds 160 mono 8/16-bit sound effects (named 0000-0159, 10-18 kHz). Script sentence 16 plays effect N (chest 77/78, Black Hammer's taunts 40-43). `tools/voc.py` converts everything to OGG (4 MB in total).


## Monster parameter block (Scenario.Mct)
Every monster record (name, 9-int placement block, then 719 ints) carries its own parameters; `tools/mct.py` exports `st`:
`[654]` hit points (40 / 55 / 100-220 / 400-600 / 1000 for the Room of Judgment boss: tracks the monster names Goblin < Soldier < Hammer < Guard < Spike Head), `[655]` attack power (10 early, 20, 25-30, 40 for the final boss),
`[675]` speed in percent (170 plain goblin, 200 soldier, 250 hammer/spike), `[659]` drop chance in percent and `[660]` drop level (the trap-room Hole Goblins have 0 / -1 = drop nothing).
Not decoded: `[657]` (0-100, grows with monster strength), `[669]` (30-195), `[695..697]` (10/20/40-style triple, 0 for Hole Goblins) - exp and gold are probably among them. The 16.16 pairs `65537000` (= 1000 << 16 | 1000) filling the middle of the block are per-element/per-skill percent multipliers (resistances).
Control.aid is NOT stats: it is the AI behaviour script library (names like "Goblin HITandAWAY", "Dragon magic attack").

## Shop stock (Table.Tbd 32 / 33)
Table 32 row n = shop n: up to 20 row numbers of table 33 (-1 = end). A table-33 row is `(category, -1, -1, item id, count, ...)` with category = Item.Ibn section (0 weapon, 1 armor, 3 consumable, 4 misc) and id = item field 1; rows with category -1 are services (shops 1, 3, 4). Shop 0 = Remote Town: Tablet, Capsule, Mine, Meat, Short Sword, Dagger, Leather Cloth, Round Shield, Wood Bowgun, Magic Staff, Leather Hat, Boots. Table 31 (524 x 5) is a master `(category, id)` list of the same kind; table 40 is the warp-gate list (name + 3 ints).

## Player stat tables (Table.Tbd 900-907) - NOT drop tables
The exe function at 0x44e34c builds the player's stats from these: tables come in pairs selected by the character's gender (`[esi+0x28]`: 900/901 base values 13 rows x 5, 902/903 150 columns, 904/905 and 906/907 100 columns), then loops over the level (`[esi+0x34]`) adding per-level values. Earlier notes calling them drop tables were wrong.
Drop level: the 4 / 15 / 20 / 22 that scripts store in the tier variables of sentence 24 and the monster field `[660]` (0-23) are on the same scale; the item generator that consumes them is not found yet (item price/attack grow roughly 1.2x per level).
Kill exp (exe 0x4134a0): `monster[+0x17c] * share% / 100`, share from Table.Tbd 14 indexed by damage fraction (0-10). Monster HP is `+0xd4`, which is index 654 of the record block, so record index 696 (+0x17c) is the exp value (10 / 20, 98 for Garam Goblin, 0 for Hole Goblins).
