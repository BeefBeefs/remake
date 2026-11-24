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

## .njp sprite sheets ("NJudgeUniPat003")
`magic[16]`, u32 imageCount, u32 totalSize, then per image: `u32 bpp, u32 width, u32 height, u32 compressedFlag(1)` + RCLIB-L block.
Pixels: bpp 8 or 4, indexed, DIB-style (bottom-up rows, stride padded to 4 bytes). After the images: a metadata tail (per-image records with
hotspot offsets and 1000 = 1.0 scale fields, animation-ish tables) and a 256-entry palette (4 bytes/entry, index 0 = colour key).
In `3rd_terr03.njp` the palette starts at tailOffset 12 + 36*52 (=1884). Exact tail layout and channel order (likely RGB, not BGR) still TODO.

## Other formats (headers seen, not yet decoded)
| ext | magic | role (guess) |
|---|---|---|
| .caf | `CHRAnimation002` | character animation |
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
