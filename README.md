# ShadowFlare web remake

Goal: a playable browser version of ShadowFlare (Denyusha / Emurasoft), starting with **Episode 1**.

The engine is a from-scratch reimplementation (TypeScript + three.js). It reads the original game data, converted locally by the scripts in `tools/`.
Episode 1 game data (extracted, minus Windows binaries and the manual) is bundled in `public/assets/ep1`. It is the property of Denyusha/Emurasoft; keep this repo private.

## Extracting the game data
1. `gcc -O2 -o tools/lhx tools/lhx.c && tools/lhx sf1.exe out/`   (the installer is an LHA SFX; yields `Data.sma`)
2. `python3 tools/sma.py out/Data.sma game-data/`                  (1,511 files for Episode 1)

## Status
See `docs/FORMATS.md` for what is understood so far and the roadmap.

## Viewer
`python3 tools/build_assets.py && npm install && npm run build && npm run serve` then open `index.html`: plays the player's animations (toggle equipment layers).

## Play (work in progress)

`npm run build && npm run serve`, then open `http://localhost:8000/play.html`: title screen -> new character (male/female, name) -> the first map of Episode 1. WASD/arrows or hold the left mouse button to walk, Shift or `R` to run, `C` status window, `I` item window, `G` shows the walkability grid, Esc pauses. Dev keys: `X` +30 EXP, `F2` adds an item from Item.Ibn to the inventory. (`?skip=male` jumps straight into the map.) Convert other maps with `python3 -I tools/convert_map.py <name>`.

## Saving
The game autosaves to your browser (localStorage) every 10 seconds, when changing maps and when you exit to the title; use *Load game* on the title screen to continue.
