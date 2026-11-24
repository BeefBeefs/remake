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
- No shops, map exits, audio or saving yet.

## Log
- Remote Town + NPCs + dialogue + item drops (commits 4206818 .. 951561b).
- Scenario 00000001 ("Near the Remote Town", map f00_02): Mct enemy records decoded (Goblins = ENEMY/1 and /2, Red Goblin = ENEMY/5 is a guess), scenario now chooses its map; try `?scenario=00000001`. Mct record layout: `[head 8 x i32][len name][4 colour][radius, worldA, worldB, rect(-80,-80,79,79), facing, 3 ...]`; head[0] in {0,4} and head[5] in {0,127} = enemy, colour 80c0e000 = named/boss/partner. Shops are deferred (need stock source + buy/sell UI).
- Combat v1: goblins idle/chase/attack/die (ENEMY caf anims 0 idle, 1 walk, 2 attack, 3 death), player attack = player anim 3 (11-frame slash; hit at ~45%), click an enemy to walk up and fight, damage numbers, enemy HP bars, EXP + gold drop on kill, death screen with respawn at spawn. Other player anims seen on the contact sheet: 0 idle, 1 walk, 2 run, 4-21 one-shot skills/attacks (3,5,6,7,8,10,11,13,... unknown which weapon/skill), 23 fall (used as death), 24-28 looping poses for other weapon types.
  - PLACEHOLDERS: enemy HP/damage/EXP/gold/speed (`ENEMY_STATS` in `src/actors.ts`), player damage = 8 + 2*level, player max HP/MP per level. Real values should come from Control.aid / Table.Tbd.
