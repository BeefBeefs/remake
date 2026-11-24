# Playtest scripts (Playwright)
Serve `public/` (`cd public && python3 -m http.server 8123`) then run with node (playwright is imported from /opt/node22/lib/node_modules; adjust the import for other machines).
- `smoke.mjs` loads every scenario and counts console errors / 404s.
- `kill.mjs` fights goblins in scenario 0 and checks exp, gold and drops.
- `connectivity.mjs` flood-fills each Episode 1 scenario from every entry point (`edges.json` = inbound entry ids from the scripts) and writes `/tmp/reach.json` with the exits, NPCs and bosses reachable on foot.
- `route.mjs` drives the real game through the Episode 1 exit chain (start -> Garam Goblin room) via `scene.exit()` and kills the boss.
- `menus.mjs` seeds two saves, loads one through Title -> LOAD DATA -> mode window, checks slot handling and DELETE. `newgame.mjs` checks legacy-save migration and New Game slot assignment.
- `gamemenu.mjs` opens the Game Menu with Esc in a dungeon, toggles settings, checks darkness and closing.
