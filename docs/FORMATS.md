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

## Maps (work in progress)
- `Map/Ground/<n>.Gnd` (`RPGSCRN_GNDv000`): `u32 W, H, chipW(64), chipH(48), 160, 160`, then `u8 compressed` + RCLIB-L block of `W*H` cells x 6 bytes
  (three i16 per cell, values 0..31, all three fields share the same value set), then a second `u8 + RCLIB-L` block (646384 bytes in 3rd_2-1: mostly 0/1/3 as u16 pairs; probably the walkability/"area judge" grid).
- `Map/Pattern/<n>.Lst`: 64 lines, one `.njp`/`.sdw` filename per upd slot (unused slots are `?`). Ground tile sets are `3rdmap_*.njp` (64x48 tiles; 00 = base types in groups of 4 variants: grass, dirt, sand, grass2, dark, water; 01/03 = transitions; 04/05 = dirt/sand variants).
- `Map/<n>.Map` (`MAPED_FILE v000`): 36 bytes: four u32 (1,1,1,1) + a short name.
- `Map/Object/<n>.Obl` (`RPGSCRN_OBJv001`): not decoded yet.
- **Open question:** how a cell's three values map to (upd slot, pattern). The renderer (`GROUNDBLOCK::SetPacket`) passes cell fields 2 and 3 to the UPDIB packet call, but treating them as (Lst slot, pattern) does not yield sensible slots (values exceed the 18 filled slots).
  Rendering the first field as an index into the concatenation of the first ground sets gives a plausible terrain, but transitions don't line up, so that is not confirmed.

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
