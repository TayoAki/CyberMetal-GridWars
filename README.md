# CyberMetal GridWars

A fights-only, real-time grid battler for the browser: a clean-room recreation of the **battle system of
Mega Man Battle Network 3**, with no overworld and no story. You get straight into battles: 6x3 grid
duels against viruses and boss navis, a chip folder, the Custom Screen, and Program Advance–style fusions.

![The Custom Screen, a lava field, the Tidecaller boss and the final boss ZeroDay](docs/screenshot.png)

Every character, sprite, sound and tune is original. The *rules* are rebuilt from the game itself: chip
damage, codes, MB, elements and rarity, virus/boss HP and elements, and the starter-folder shape were read
from the owner's own BN3 ROM. None of the ROM's bytes ship in this repo.

## New: GridWars Daily, a new boss every day

![GridWars Daily: today's boss in the lobby, a fight, the results with the share buttons, and the phone lobby](docs/screenshot-daily.png)

**Play it at `/daily`.** There's one boss a day, the same for everyone. Delete it as fast as you can, post your time
and race your friends' runs. The grid game above is still there as Classic, at `/grid`.

- **A new boss every day, made from the day's number.** Each one has a name, a look and an element, and an arena
  with its own colours, props and floor (grass, ice, lava, metal...). Its moves come from the eight Gauntlet
  bosses: an elec trickster that blinks like Voltframe might throw Ironclad's saw and call Tidecaller's fish.
  Every move plays exactly as its own boss plays it.
- **The week builds up**: V1 on Monday and Tuesday, V2 midweek, V3 on Friday and Saturday, **Ω on Sunday**.
  Higher tiers keep their bosses' speed and tells and hit softer than the Gauntlet's versions. Your navi's HP
  grows with the tier.
- **Your navi**: the built-in mech, or your own **.glb** (a Tripo model works; LOAD .GLB or drop the file on
  the page). Everything is cel-shaded with ink outlines and bloom, the bosses, the arena and your model alike,
  so an uploaded character fits the scene. The navis face each other in profile, as in Battle Network.
- **A leaderboard that can't be faked by typing in a time.** A won run is sent as what you pressed, frame by
  frame. The server replays it with the game's own engine and ranks what the replay shows: fight time, then
  Busting Level, then HP left. Each player holds one place a day (their best).
- **Made to be shared:**
  - **SHARE** posts a Wordle-style result: the boss, your time and Busting Level, and eight squares that tell
    how the fight went (🟩 no damage ... 🟥 a heavy hit) without spoiling it.
  - **RESULT CARD** is a 1200x630 image of the arena with your time on it.
  - **CHALLENGE LINK** (`/daily?vs=<run>`) lets a friend race your run. Your pace shows under the boss's HP
    bar, and the results say who won and by how much.
  - **REPLAY LINK** (`/daily?r=<run>`) plays your run back exactly as you played it.
  - Links show today's boss (or the challenger's time) when pasted into chats and social posts.
- **Streaks and the week**: the lobby counts the days in a row you've cleared and shows this week's tiers.
  Tap a past day to practise its boss; the board takes today's runs.
- **Controls**: as in Classic (arrows/WASD to move, Z buster, X chip, Q/E Custom Screen), touch buttons on
  phones, and the Custom Screen takes taps. Enter or Esc pauses.

## New: 3D graphics, and your own 3D characters

![3D battles: voxel AXIOM as a battle opens, a Tripo model swinging a Sword chip, CUSTOMIZE with a .glb, the built-in MECH](docs/screenshot-3d.png)

Battles now render in 3D. Switch back to classic 2D in OPTIONS > GRAPHICS, or press **G** at any time.

- **Everything on the field is 3D.** Every character and projectile is built from its own pixel art as a
  voxel model. They stand on lit panel blocks, cast real shadows, and effects light up the field.
- **The camera** swoops in as a battle opens and closes in on the winner. During play it holds the classic
  framing, so the HUD, damage numbers and effects line up exactly. *Reduce flash/shake* keeps it still.
- **Bring your own navi.** Make a character in Tripo (or any tool that exports **.glb**), then pick it in
  CUSTOMIZE > LOAD .GLB, or just drop the file onto the game. It takes AXIOM's place in 3D battles:
  - it's sized to fit, and a broken auto-rig (Tripo's comes out with every bone at the origin) is rebuilt
    from its skin weights; a model with no usable rig moves as one piece;
  - with Mixamo-style bones its arms come down from the T-pose and aim the buster, swing and guard;
  - Sword and Cannon chips give it a glowing arm blade or an arm cannon;
  - TURN fixes a model made facing another way, and there's a built-in MECH (the open world's mech) to try.
  - The same character is your body in the open world (garage > BODY): load it in either game.
- **Privacy:** the file stays in your browser (IndexedDB); nothing is uploaded. Looks never change a battle.
- Classic 2D is pixel-for-pixel the old game, and browsers without WebGL stay in 2D.

## New: open-world prototype

The next direction for the project: the same kind of fights, taken off the grid into a 3D world (think
Palworld's open landscapes), fought like Kingdom Hearts 2 with Mega Man X's buster on top. Viruses are
leaking out of the net into the real world; find the six rifts, fight what comes out and seal them. Every
virus family you delete teaches you its signature attack as a chip, so Battle Network's chips live on,
your mech's parts decide your moves, Medabots and Custom Robo style, and in the forge you design weapons of
your own.

- **Run it:** `npm install`, `npm run serve`, then open http://127.0.0.1:8123/world/. Or `npm run build` and
  open `dist/world.html` (one file, works offline). Add `?auto=1` to watch the demo pilot play.
- **Controls:**

  | | Keyboard and mouse | Gamepad | Touch |
  |---|---|---|---|
  | Move / look | WASD / mouse (click captures it) | Sticks | Stick / drag |
  | Attack (mash for a combo) | Left click or J | X | ATTACK |
  | Buster (hold to charge) | Right click or K | RT | SHOOT |
  | Lock on / switch target | R or middle click / Q, E or wheel | RB / flick the right stick or D-pad | LOCK / ⇄ |
  | Reaction command | F (when a gold prompt shows) | Y | The gold button |
  | Chips | 1, 2, 3 | Hold LB + X, Y, B | Chip buttons |
  | Jump / dodge | Space / Shift | A / B | JUMP / DODGE |
  | Garage, forge and body (out of combat) | G | Back | GARAGE |

  Without mouse capture (some embedded pages), drag with the right button or use Q/E to turn and K to
  shoot. **F3** shows the frame rate.
- **What's in it:**
  - **Your mech:** the rigged model you made, animated in code (idle, run, jump, dash, aim, recoil, hurt).
  - **Or your own character:** the garage's BODY tab picks the mech or your own .glb (LOAD .GLB, or drop
    the file on the game), with TURN for a model made facing another way. It's the same character as your
    grid navi: load it in either game and the other has it too (same browser, same site).
    - A rigged model runs, swings and aims like the mech. Tripo's broken auto-rig is rebuilt on load, so
      rig it in Tripo (Animate > Rig) before exporting.
    - A model without a usable rig moves as one piece: it leans into runs and dashes and rocks as it
      steps, and your parts hang on stand-in joints at its hands, chest and feet.
    - Your body is only a look: parts, weapons and stats stay the same.
  - **The world:** a seeded landscape with lakes, a forest, wind-blown grass and a mountain rim.
  - **Enemies:** three viruses from the grid game, each with a telegraphed attack you can counter by
    hitting it during the wind-up:
    - Rivet slams the ground and sends out a shockwave you jump over;
    - Plinker aims a laser, then fires a cannonball;
    - Dartfin marks a line on the ground and dives along it.
  - **Kingdom Hearts 2-style combat** (from a research pass on KH2, Birth by Sleep and Re:Chain of
    Memories):
    - **Lock-on:** a soft marker shows what your next strike will home in on. Lock on to make the camera
      frame the target, and switch left or right. When the target is deleted, the lock moves to the
      nearest virus on screen.
    - **Combos:**
      - Three slashes and a finisher that depends on the fight: a spin when you're crowded, otherwise a
        launcher you can follow into a 3-hit air combo that slams the virus down.
      - Strikes lunge at viruses up to 9 m away, and the world freezes for a few frames on solid hits.
      - A swing that hits nothing ends the combo.
      - Dodge or jump to cancel a strike once it has landed.
      - Viruses get "revenge armor" if you hit them non-stop.
    - **Reaction commands:** a gold prompt when an attack can be turned around. BREAK smashes a Rivet's
      slam, REVERSAL warps behind a diving Dartfin, DEFLECT bats a cannonball back.
  - **Chips from enemies:**
    - The first Rivet, Plinker and Dartfin you delete teach you ShockWave, Cannon and FinDash, which go
      on 6-8 s cooldowns.
    - Deleting more of the same family levels a chip up, at 5 and 15 deletes.
    - Using a chip right after the third hit of a combo is a finisher for double damage. Using one
      earlier keeps the combo going.
  - **Parts decide your moves** (Medabots / Custom Robo): four slots, four parts each, swapped in the
    garage out of combat. Progress is saved in your browser.
    - **Arm (attack):**
      - Saber: 3 slashes and a spin or a launcher.
      - Breaker: 2 heavy smashes and a ground quake that shatter revenge armor.
      - Lance: thrusts that lunge from 13 m and a charge that pierces a line.
      - Claws: 4 fast rakes, an uppercut and a 4-hit air combo.
    - **Gun (shoot):** Buster (rapid shots and charge shots), Spreader (a fan of pellets), Railgun (a charged
      beam through everything in a line), Bomber (bombs lobbed onto your target; three at full charge).
    - **Legs:** Striders (balanced), Hover (glide and two air dodges), Sprinters (fastest), Treads (light hits
      don't stagger you).
    - **Core:** Standard, Fortress (more HP), Link (faster, stronger chips), Overclock (×3 counters, stronger
      reactions).
    - **Getting parts:** sealing a rift turns up a part you don't have; DATA from viruses buys the rest.
  - **The forge (design your own weapons):** the garage's FORGE tab. Modelled on Warframe's modular weapons
    (a base part plus mods in a capacity budget), inside Battle Network's NaviCust memory and element wheel,
    with Zelda: Tears of the Kingdom's Fuse in mind: viruses teach the effects (see the research notes).
    - **Base:** an arm or gun part you own; it keeps its moves (combo or fire mode).
    - **Look:** four shapes per base (sabers come Straight, Curved, Serrated or Twin; breakers as a drum,
      sledge, mace or axe; lances as a spear, trident, drill or glaive; guns standard, long, twin or heavy),
      size S/M/L (on arm weapons a little reach against speed), and body and glow colours from 12.
    - **Element:** Battle Network's Fire > Wood > Elec > Aqua > Fire. Double damage on the virus it beats
      (Fire on Rivets, Aqua on Plinkers, Elec on Dartfins), plus an effect: Fire burns, Aqua soaks (slower
      viruses and attacks), Elec stuns after a few hits (then the virus resists for a while), Wood heals you.
      Null leaves 2 MB more for mods. Each element has a glyph as well as a colour.
    - **Mods:** up to three that fit the weapon's memory (10 MB): Heavy, Swift, Reach, Split, Burst,
      Critical, Chain, Wave, Pierce, Homing, Quick Charge. Five are there from the start; the others are
      learned by deleting their virus family (the Rivet's slam teaches Wave, the Dartfin's dive Homing...),
      then unlocked with DATA. Bonuses add up rather than multiply.
    - **Editor:** live preview on your mech, exact numbers against what you have equipped, a summary of
      every effect, a RANDOM button, and TEST to try it on training dummies (one of each virus; they never
      break or fight back). Six weapons at most, saved with your progress.
    - **Share codes:** SHARE gives a code like `CMW-0410-62B2-…` (Crockford base32 with a version and a 16-bit
      checksum, so typos are caught); IMPORT loads one. Forging it needs the base part and the mods.
  - **Rewards:** data drops that heal you and pay for parts.
  - **Progression:** six rifts; sealing all six starts a tougher wave.
  - **HUD:** the lock-on target's health, a command panel with the reaction prompt and chip deck, a
    rotating minimap, damage numbers, and the grid game's synth sounds and music.
- **How it's built:** like the grid game, a deterministic 60 Hz simulation (`src/world/sim.js`, no
  rendering; combat data in `src/world/combat.js`, parts in `src/world/parts.js`, the forge in
  `src/world/forge.js`) is drawn by a separate view (`src/world/view.js`, three.js r186 on WebGL2; part and
  forged-weapon meshes in `src/world/gear.js`; the garage and forge menu in `src/world/garage.js`). Garage commands
  reach the simulation through its input, so a session replays exactly. The simulation has its own tests (`tests/world*.test.js`), and a headless bot
  that locks on, combos, reacts and uses chips plays it for balance checks.
- **The model:** `assets/mecha.glb` was generated by the project owner with Tripo AI. Tripo's export had
  a broken skeleton (every bone at the origin, garbage bind matrices); `tools/repair_glb.py` rebuilds
  the joints from the skin weights and slims the texture. Players' own models get the same repair in the
  browser (`src/render3d/glb.js`, shared with the grid game). Tripo's terms decide commercial use: free-plan
  models may not be usable commercially.

## Hosting the games

**Live:** https://games-production-eed4.up.railway.app (menu), `/daily`, `/grid` and `/world`. Railway
project `cybermetal-gridwars`, service `games`, deployed from this branch: every push redeploys it.

`npm run build`, then `npm start`, serves a menu at `/`, GridWars Daily at `/daily`, the grid battler at
`/grid` and the open world at `/world` on `$PORT` (default 8080). It also serves `/health`,
`/assets/mecha.glb` (the built-in MECH), `/og/*.png` (the Daily's link-preview images) and the Daily's
leaderboard API. `tools/serve-dist.mjs` reads and gzips the built pages once at startup. Any Node 20+ host
works; on Railway the default Node build (`npm install`, `npm run build`, `npm start`) needs no extra
settings.

The Classic and open-world games keep progress in each player's browser (`localStorage`). The only thing the
server stores is the Daily's board, under **`$DATA_DIR`** (on Railway, the service's volume, found through
`RAILWAY_VOLUME_MOUNT_PATH`; locally `.data/`):
- `daily/<day>.jsonl` holds one line per accepted run;
- `runs/<id>.json` holds its inputs, for replays and challenges.

The API (`tools/daily-api.mjs`):

| Call | What it does |
|---|---|
| `GET /api/daily/today` | the server's day number, and when the next one starts |
| `GET /api/daily/:day/board?pid=` | the top 25, how many cleared, and your place |
| `POST /api/daily/:day/runs` | `{ pid, name, folder, run }`; the server replays the run, then ranks it if it won |
| `GET /api/runs/:id` | a run's result and inputs, for `?r=` and `?vs=` links |

Runs are accepted for the server's day ±1, so every time zone's "today" counts. They carry the engine's
fingerprint (`tools/engine-hash.mjs`), so a page left open across a deploy is asked to reload instead of
having its run misjudged. Names are 2-12 characters with a word filter. Each address gets 40 submissions per
10 minutes. `npm run serve` runs the same API against `.data-dev/` for development.

## Play (grid battler)

- **No install:** run `npm run build`, then open `dist/cybermetal-gridwars.html` in any modern browser.
  It's one self-contained file and works offline from `file://`. (The built-in MECH model is fetched from
  `assets/` and so needs the dev server or the hosted page; your own .glb works anywhere.)
- **Dev server:** `npm run serve`, then open http://127.0.0.1:8123/. It serves plain ES modules, so there
  is no build step.

### Controls
| | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | Arrows / WASD | D-pad / stick | D-pad |
| Buster (hold to charge) | Z or J | B / X | B |
| Use chip / confirm | X or K | A / Y | A |
| Open Custom Screen (gauge full) | Q / E / Shift | LB / RB / triggers | L / R |
| Pause (SELECT in pause = retreat) | Enter | Start | START |
| Shield (Shield style) | Back + Z | Back + B | Back + B |
| 3D / classic graphics | G | | OPTIONS |

## What's in it

**Modes**
- **Gauntlet:** eight areas. Each has three designed virus battles, then a boss duel.
  - HP carries between an area's three virus battles, and losing one resets the area.
  - Each boss is fought at full HP. A boss is a checkpoint: losing to it sends you back to the boss, not
    to the start of the area.
  - Each boss's first defeat gives its Navi chip, a stat or program (Ironclad gives SuperArmor and
    AirShoes), and +80 max HP.
- **Free Battle:** replay any battle you've reached, rematch bosses at V2, V3 and Ω, or roll a random
  mixed battle.
- **Folder:** edit your 30-chip folder from everything you've won. BN-style limits apply.
- **Pre-built folders** (like BN3's XtraFolder): seven ready-made folders to equip instead of your own:
  Starter, Cannon Crew, Swordplay, Elemental, Blade Master, Demolition and Prism Edge. Each is built
  on one to three codes plus `*` chips, so you can take several chips a turn, and most carry a fusion
  (Cannonade, LifeSaber, MegaRat, PrismSabr...). They're loaned: you don't need the chips, and they can't be
  edited. Three are open from the start; the rest unlock as you reach later Gauntlet areas.
- **Chip Shop:** spend the Bits that battles drop on chips from the areas you've reached, or on HP Memory.
- **Customize:** AXIOM's look, with a live preview that runs through battle poses.
  - Parts: a head, body, arms, legs and back piece, 25 options in all (heads Axiom, Vanguard, Oni, Nova,
    Ronin and Specter; back pieces include wings, a thruster and a scarf).
  - Colours: armour, suit and lights, 27 presets, each shaded into a full pixel-art ramp.
  - 3D model (3D graphics): the built-in MECH or your own .glb in AXIOM's place, with TURN to face it
    the right way (see *3D graphics* above).
  - Cosmetic only. The look shows in every battle and in the title demo.
- **Programs:** equip passive parts (SuperArmor, UnderShirt, FloatShoes, AirShoes, Custom+1/+2) within a
  memory budget, a light take on BN3's Navi Customizer. AirShoes let you stand on holes; FloatShoes stop
  cracked panels breaking under you.
- **Style Change:** beating bosses unlocks styles, and you can wear one type and one element at a time.
  - Types: Guts (double buster, no flinch), Custom (+1 chip on the Custom Screen), Shield (Back+B
    reflects) and Team (+2 Mega chips).
  - Elements: Heat, Aqua, Elec and Wood. Each changes your body's element and your charge shot.
- **How to Play:** nine short pages in the title menu covering the rules, including a list of every
  fusion's chips and the Gauntlet area where they all drop.

**The battle system**, recreated:
- **Field:** a 6x3 grid. Red area vs blue area, with ownership that moves: AreaGrab/PanlGrab steal panels,
  which return after a while (never while you need them to get back to your side).
- **Panels:** normal, cracked (breaks when you step off), broken (recovers later), grass (Fire ×2 and
  burns away; Wood bodies regenerate on it), ice (you slide; Elec ×2), lava (50 Fire damage to non-Fire
  bodies), poison (drains HP), holy (halves damage), sand and metal.
- **Navi:** single-step movement with hold-repeat and input buffering. The buster does Attack-level
  damage and doesn't flinch. Hold B to charge; the charge shot does 10× Attack and flinches. Rapid and
  Charge levels change the timings.
- **Custom Gauge:** fills over about 8.5 s; L/R opens the Custom Screen.
- **Custom Screen:**
  - you draw from a shuffled 30-chip folder;
  - the BN selection rule applies: all selected chips must be the same chip or share one code, with
    `*` matching any code;
  - up to 5 chips;
  - unpicked chips stay in your hand;
  - ADD skips a turn for +5 chips (10 max).
- **Fusions (Program Advance–style):** consecutive codes (Cannon A-B-C → Cannonade) or chip sets (Sword +
  WideSwrd + LongSwrd → LifeSaber), picked back to back in recipe order. Atk+10, Fire+30 and the other
  boost chips fold into the chip before them.
  - The Custom Screen lights up the chips in your hand that fuse and numbers them in pick order; the
    next one to pick blinks. If you picked out of order it says to undo, and if two pieces are in your
    hand and the third is still in the folder it says to hold them.
  - The starter folder can make Cannonade, and every fusion's chips drop in the Gauntlet with codes that
    fuse (the shop sells them once you reach the area). The FOLDER menu lists what each folder can make.
- **Hits:**
  - the element wheel (Fire > Wood > Elec > Aqua > Fire) doubles damage;
  - flinch, followed by player invincibility frames;
  - paralysis (stun);
  - knockback;
  - Barrier (absorbs damage), Aura (blocks hits below its power), Guard (reflects), Invis;
  - **Counter hits:** a chip landing during an enemy's wind-up.
- **Rank:** time, hits taken, steps moved, and double/triple deletes, the way BN3 scores its Busting
  Level.
- **157 chips plus 15 fusions** across 65 behaviours covering every BN3 attack family:
  - cannons, guns with splash, bombs, swords, shockwaves, punches, waves, rats;
  - yo-yos, boomerangs, meteors, traps;
  - recovery, barriers, area theft, stage changers, gauge chips;
  - boosts and Navi chips that summon the game's own characters.
- **Enemies:** 13 virus families with 4 levels each (L1-L3 and Ω), plus 8 boss navis with V1/V2/V3/Ω.

**Sound:** 62 sound effects and 7 original tracks (title, menu, battle, boss, final boss, victory, game
over), all synthesized at runtime with WebAudio. `tools/audio_check.html` renders every sound offline
and checks lengths, peaks, loop seams and dropouts.

## How it was built

This project followed the [universal-modder](https://github.com/rehan-remade/universal-modder) skill's
loop. The whole journal is in [`MODLOG.md`](MODLOG.md).

1. **Recon.**
   - The knowledge base had no prior notes on Battle Network or the GBA.
   - No BN3 disassembly exists.
   - Archipelago's MMBN3 randomizer supplied the text charset and the chip ID order.
2. **Route: engine recreation.** BN3's battle rules are a pure, deterministic 60 Hz simulation
   (`src/engine/`), and a canvas view draws it (`src/render/`). Nothing runs the original code.
3. **Source of truth.** Small scripts, kept *outside* the repo, read these tables from the ROM:
   - the chip data table: 0x20-byte records with codes, element, family, MB, rarity and damage;
   - the chip-name and description text archives;
   - the enemy stat table, packed as `HP | element << 12`;
   - the preset folders.

   The Program Advance recipe table was never found, so the recipes come from community documentation.
   Timings (gauge fill, charge, i-frames) are tuned to how BN3 feels; they weren't measured from the ROM.
4. **Oracles.**
   - A headless rules bench (`npm test`), checked against deliberately broken builds.
   - Per-pack tests for every enemy.
   - Sprite contact sheets that were actually looked at.
   - An end-to-end Playwright run through the real UI (`node tools/smoke.mjs`).
5. **Content in parallel.** The engine contract is pinned in [`docs/CONTRACT.md`](docs/CONTRACT.md). It
   let the virus packs, boss packs, core art and audio be built as separate files.

### Fidelity: what each number is

| Thing | Source |
|---|---|
| Chip damage, codes, MB, element, rarity (all standard and Navi chips) | BN3 ROM chip table |
| Virus/boss HP and element per level | BN3 ROM enemy stat table |
| Starter folder composition | BN3 ROM preset folder 0, with a Cannon C in place of its SideGun S |
| Fusion (PA) damage | BN3 ROM chip table rows 320+ |
| Fusion recipes | community-documented BN3 combos (recipe table not located) |
| Gauge time, charge time, buster rate, i-frames, enemy attack damage and timings | tuned |

## Project layout

```
src/engine/   deterministic battle sim (no DOM): battle, field, player, custom screen, chips, enemies
src/render/   240x160 canvas renderer, pixel API, fonts, sprites, chip art, Custom Screen UI
src/render3d/ 3D battles (three.js): camera space, voxel models, the battle stage, players' .glb models
src/audio/    WebAudio synth: sound effects and original music, all generated at runtime
src/game/     scenes (title, Gauntlet, Free Battle, folder, programs, options), save, rewards, data
src/world/    open-world prototype: simulation, terrain, enemies, three.js view, avatar, HUD, input
src/daily/    GridWars Daily: the day's recipe, the duel, run recording and replay, the page (lobby, HUD,
              Custom Screen, results, sharing) and view/ (cel-shaded stage, arena, boss bodies, navi, effects)
src/engine/enemies/bosses/composite.js  mixed bosses built from the eight bosses' KIT exports
daily/        the Daily page; gallery.html and og.html are development pages (all bosses, preview images)
world/        the open-world page; assets/ holds the player model
tests/        node:test benches (rules, data, enemy packs)
tools/        dev server, single-file build, production server, the Daily's leaderboard API and engine
              fingerprint, screenshot/smoke scripts, sprite sheet and navi parts pages
docs/         CONTRACT.md (engine/content contract), field note
```

`npm test` runs every bench. `npm run build` makes the single-file game.

## Legal

This is a fan-made, non-commercial project. It isn't affiliated with or endorsed by Capcom.

- *Mega Man Battle Network* is a trademark of Capcom; it's named here only to describe what this game's
  battle rules recreate.
- No Capcom code, graphics, audio or text is included.
- The game's characters, names, art and music are original.
- The ROM was used only as a private reference to read game data, and it isn't distributed.

Code and original assets: MIT (see `LICENSE`).
