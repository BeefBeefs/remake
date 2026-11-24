# Progress notes

Goal: playable web version of ShadowFlare (Win EN, Episode 1 first) in zero-dependency TypeScript + Canvas2D.
Newest entries at the bottom. Run `npm run assets && npm run build && npm run serve`, open `public/play.html` (`?skip=male`, `?map=`, `?x=&y=`).

## Done
- Containers/compression (LHA SFX, RCLIB-LZSS), Njp sprites, Caf animations, player rendering (layers guessed 1,0,3).
- Maps: ground/decor/objects with shadows, depth sort; judge-grid collision (generic grid size), spawn point; Remote Town (f00_01) is the start map.
- GUI: title, character select, HUD, Status and Item windows, bitmap font, cursor.
- Data: Item.Ibn (all items, names, icons, sizes, prices), Table.Tbd (EXP table), inventory grid.
- Actors: Scenario.Mct character records -> NPCs/partners rendered, hover names, collision.
- Scripts: Scenario.Scs fully parsed; interpreter decoded from ShadowFlare.exe (conditions, assignments, messages with options, item drops, talk start/end). Ostare's intro plays and hands out starting gear; items can be picked up from the ground.

## Known gaps / guesses
- Equipment layers, facing order and anim indices for the player are guesses; equipment is not drawn yet.
- Ground transitions between tile types are blocky; Status window values are placeholders.
- Many script sentence types are logged and skipped (see `console.warn("script: unimplemented ...")`).
- Enemies are placed but inert; no combat, shops, map exits, audio or saving yet.

## Log
- Remote Town + NPCs + dialogue + item drops (commits 4206818 .. 951561b).
- Scenario 00000001 ("Near the Remote Town", map f00_02): Mct enemy records decoded (Goblins = ENEMY/1 and /2, Red Goblin = ENEMY/5 is a guess), scenario now chooses its map; try `?scenario=00000001`. Mct record layout: `[head 8 x i32][len name][4 colour][radius, worldA, worldB, rect(-80,-80,79,79), facing, 3 ...]`; head[0] in {0,4} and head[5] in {0,127} = enemy, colour 80c0e000 = named/boss/partner. Shops are deferred (need stock source + buy/sell UI).
