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
A second RCLIB-L block follows: the **judge grid**, 568 x 569 u16 cells (row-major), each a 160 x 160 square in *world* (a,b) space (header words at +32/+36 = 160). Cell index: `gx = floor(a/160) + 1`, `gy = floor(b/160) + 268` (fitted: 2575 of 2577 tree objects sit on blocked cells). Values: 0 = free, 1 = blocked (outside the map and under trees/rocks/water), 3 = free special zone (paths / event areas, meaning unknown), plus a single 0x8000 flag cell (probably a start/marker point). The world->real transform means the grid is a 45-degree diamond in screen space.

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
