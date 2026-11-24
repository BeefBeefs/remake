# ShadowFlare web remake

Goal: a playable browser version of ShadowFlare (Denyusha / Emurasoft), starting with **Episode 1**.

The engine is a from-scratch reimplementation (TypeScript + three.js). It reads the original game data, converted locally by the scripts in `tools/`.
Episode 1 game data (extracted, minus Windows binaries and the manual) is bundled in `public/assets/ep1`. It is the property of Denyusha/Emurasoft; keep this repo private.

## Extracting the game data
1. `gcc -O2 -o tools/lhx tools/lhx.c && tools/lhx sf1.exe out/`   (the installer is an LHA SFX; yields `Data.sma`)
2. `python3 tools/sma.py out/Data.sma game-data/`                  (1,511 files for Episode 1)

## Status
See `docs/FORMATS.md` for what is understood so far and the roadmap.
