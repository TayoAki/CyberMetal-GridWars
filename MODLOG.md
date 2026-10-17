# MODLOG — CyberMetal GridWars

Journal kept per the universal-modder `mod-any-game` loop. Anything not written here is lost at the next
context compaction, so every confirmed fact, dead end and next step goes in.

## 0. Intake

- **Guest game:** Mega Man Battle Network 3 Blue Version (USA), GBA. The user supplied their own dump.
  - Header title `MEGA_EXE3_BL`, game code `A3XE`, maker `08` (Capcom), revision 0, header checksum valid.
  - SHA-1 `3d21905b6e860d39a00ba643779776de4c73c411`.
- **Idea:** recreate BN3's battle system as a standalone game that is *only fights*: no overworld and no
  story, just the real-time grid battles, the Custom Screen, chips, viruses and boss duels.
- **Online vs offline:** single-player and offline. No anti-cheat, no online client; nothing gets hooked.
- **Done means:**
  - a playable browser game with the battle system working end to end;
  - a headless rules bench (tests) passing;
  - a scripted browser run whose screenshots were actually looked at;
  - no game files in the repo.

## 1. Recon

- `um kb search` for "battle network", "gba", "mega man" and "emulator" found no prior field note for this
  game or for GBA titles. We may be the first, so a field note is due at the end.
- **No BN3 disassembly or decomp exists.** Community disassemblies cover BN6 Falzar and Rockman EXE 4,
  not BN3.
- **Archipelago's MMBN3 world** (ArchipelagoMW/Archipelago, `worlds/mmbn3`) gave three things:
  - the BN3 text charset (space=0x00, '0'-'9'=0x01-0x0A, 'A'-'Z'=0x0B-0x24, 'a'-'z'=0x25-0x3E,
    0xE6 terminates a string, 0xE8 is a newline);
  - the internal chip ID order (Cannon=1, AirShot3=6, Barrier=173, ...);
  - the codes encoding (A=0 ... Z=25, `*`=26).
- A forum "MMBN3 Custom Battle Guide" documents the battle-settings structure but returns HTTP 403 to
  fetches. Not used.

## 2. Route

**Engine recreation, guest rules headless + our own view** (mashup-mods Pattern 5 /
`engine-recreation-measures-and-fidelity.md`).

- BN3's battle rules are reimplemented as a pure, deterministic simulation at the guest's own step rate:
  60 steps/s, frame-based timers, panel units. It imports nothing from any view.
- A browser view draws it on a 240x160 canvas, scaled up nearest-neighbour, like the GBA.

Why this route:
- The idea needs none of BN3's code running, only its rules.
- A ROM hack would be locked to the GBA, and patching it is a far larger RE job, since no disassembly
  exists.
- A clean reimplementation can ship publicly as long as it carries no Capcom material.

**What ships:** our code, our own pixel art drawn in code, our own synthesized audio, original character
names, and numbers calibrated from the ROM. Numbers like damage, HP and codes are game facts.
**What never ships:** the ROM, extracted graphics, audio, text, or decompiled code.

## 3. Lab

- The ROM lives only in the session scratchpad, unzipped into its own directory. It is never copied into
  the repo; `.gitignore` blocks `*.gba`, `*.sav`, `*.ss*` and `private/`.
- The recon scripts (Python, run with `-I`) and their outputs (`chips.json`, `enemies.json`, chip
  descriptions) stay in the scratchpad as well. They are reference material, not repo content.

## 4. Source of truth: what the ROM says

All offsets are file offsets into the A3XE ROM (add 0x08000000 for the GBA bus address).

### Chip data table (found: confirmed)
- 0x20-byte records starting at **0x11510**, indexed by chip ID (0 = MegaBuster, 1 = Cannon, ...). The
  table runs past 351, which covers the Program Advance entries at 320+.
- Found by scanning for Cannon/HiCannon/M-Cannon damage 40/60/80 at a fixed stride. AirShot1-3 = 20/30/40
  and LavaCan1-3 = 90/120/150 followed, which confirmed it.
- Record layout, worked out from chips whose properties are well known:

  | offset | size | meaning |
  |---|---|---|
  | 0x00 | 6 | codes, one byte each: A=0 ... Z=25, `*`=26, 0xFF = unused |
  | 0x06 | 1 | element: 0 Null, 1 Elec, 2 Fire, 3 Aqua, 4 Wood |
  | 0x07 | 1 | attack family: all swords 0x08, cannons 0x04, guns 0x06, bombs 0x07, shockwaves 0x0A, recovers 0x0B, barriers/auras 0x03, Navi chips 0x14, +damage chips 0x15, Z-PAs 0x17 |
  | 0x08 | 1 | per-chip parameter within the family. For Recov chips it is heal/2, e.g. Recov10 → 5 |
  | 0x09 | 1 | rarity - 1 (0 = 1 star ... 4 = 5 stars) |
  | 0x0A | 1 | MB (memory size) |
  | 0x0B | 1 | class flags: 1 attack, 2 support, 0x41 places an object, 0x42 field effect, 0x44 Navi, 8 +damage |
  | 0x0C | 2 | damage. 10000 marks variable damage (CustSwrd, Muramasa); 9999 marks +damage chips |
  | 0x0E | 2 | library number |
  | 0x10 | 2 | alphabetical sort rank |
  | 0x12 | 1 | effect flags (e.g. 0x05 on panel-changing chips, 0x07 on swords) |
  | 0x13 | 1 | flags; bit 0x80 = Mega class, 0xC0 on the Z-PAs |
  | 0x14 | 12 | three pointers (chip art, palette, ...) — not used |

### Chip names and descriptions (found: confirmed)
- Names for IDs 0-255 are in a text archive at **0x7043EC**. Names for IDs 256+ are at **0x704E14**;
  index 64 there is chip 320, Z-Canon1.
- Descriptions are at **0x7052F4**.
- Archive format: a u16 table of offsets relative to the archive start, then strings. The first offset
  divided by 2 gives the entry count.
- Descriptions were read privately to understand behaviours (e.g. ShotGun "explodes 1 square behind").
  Every description in our game is our own wording.

### Enemy stat table (found: confirmed)
- 8-byte records at **0x19618**, indexed by enemy ID. Entry 0 is MegaMan with 100 HP, which matches BN3's
  starting HP.
- `u16 = HP | element << 12`, using the same element numbering as the chips. Byte 4 is the class (0x04
  virus, 0x08 Navi), byte 5 is the family index and byte 7 is the level.
- Names (archive at **0x7112E4**) run in families of four, level 1/2/3/Ω. For example: Mettaur 40/60/120/160,
  Canodumb 60/90/130/180, Fishy 90/150(Fire)/240/300, Swordy 90/140(Fire)/220(Aqua)/320, Bunny
  40/100/160/220 (Elec), FlashMan 300/500/700/1500 (Elec), Bass 1000/2000/3000.

### Preset folders (found: confirmed)
- Pairs of `(u16 chip ID, u16 code)`, 30 per folder, starting at **0xCBDC**.
- Folder 0 is BN3's starter folder: Cannon A×2, Cannon B×2, ShotGun J×3, V-Gun D×3, SideGun S,
  AirShot1 *×3, MiniBomb B×2, MiniBomb S, Sword L×3, WideSwrd L, PanlOut1 B×2, AreaGrab L, Recov10 A×2,
  Recov10 L×2, Atk+10 *×2.
- Our starter deck mirrors its shape: a few code-matched pairs plus `*` utility.

### Dead ends (don't repeat)
1. **Symptom:** no table with Mettaur HP 40/80/120. **Cause:** I assumed BN1's progression; BN3's
   Mettaur2 has 60 HP, and some HP words carry element bits in their top nibble. **Fix:** search for a
   loose pattern (Mettaur=40 and Canodumb/Canodumb2=60/90 at the same stride), then mask with `& 0xFFF`.
2. **Program Advance recipes not located.**
   - Searched for Cannon A/B/C, LifeSwrd (30/31/32 with one code) and BigHeart (178/128/219) packed as
     u16 `id|code<<9`, as u16 pairs and as u8 pairs. No table found.
   - The recipes are probably checked in code, not stored as data. Our PA recipes are community-documented
     BN3 combinations, flagged *not ROM-verified*. The PA damage values *are* from the chip table (IDs
     320-351).

### Not measured (believed, not proven)
These come from community documentation and play knowledge, not from the ROM or an emulator run:
- **Timing:** Custom Gauge fill time (512 frames ≈ 8.5 s), buster cooldown, charge time, i-frames,
  movement frames, broken-panel recovery.
- **Virus attack damage per level.** The stat table holds HP and element only.

The next agent could measure all of these with mGBA's Lua scripting and a save state at a battle.

## 5. Build log

(see below, newest last)

- **Engine core** (`src/engine/`): a deterministic 60 Hz sim. A 20-test rules bench caught all three
  one-defect mutants it was checked against.
- **Contract** (`docs/CONTRACT.md`): pinned so content could be built in parallel, one file per
  contributor (virus packs A/B, boss packs A/B, core art, audio).
- **Renderer, Custom Screen UI, input, game shell:**
  - title with an attract demo, Gauntlet (8 areas), Free Battle (boss V2/V3/Ω), Folder, Programs;
  - Style Change (element plus type, unlocked by bosses);
  - Chip Shop, How to Play, Options, Credits.
- **Oracles:**
  - `npm test` (136 tests);
  - `tools/smoke.mjs`, a Playwright run through the real UI;
  - `tools/balance.mjs`, an autopilot sweep of every encounter with damage attributed by enemy type.

### Gotchas found while building
1. **Symptom:** repeated taps of the same key were lost in headless Chromium runs. **Cause:** animation
   frames arrived in bursts, so a release and the next press landed between two samples and merged
   into one held press. **Fix:** `Input` queues held-state transitions per button and replays at most
   one per frame, so every press and release is seen.
2. **Symptom:** after a "harmless" telemetry change, two of a content pack's exact-count tests failed.
   **Cause:** `lob()` called the content's `cells` callback an extra time to record the landing cells.
   Some callbacks use `b.rng`, so the extra call shifted the seeded RNG sequence. **Fix:** never call
   content callbacks speculatively; record only static data.
3. **Symptom:** the autopilot died to late areas. **Cause:** the player's HP grew +20 per boss while
   late-game damage is 60-150 per hit. **Fix:** a first boss clear adds 80 HP, about 660 by area 8,
   which matches BN3's late-game scale.
4. **Symptom:** a data field set by the engine was silently replaced. **Cause:** a pack wrote its own
   value (`'plus'`, a string) to `data.blast` on the same spell. **Fix:** engine-owned spell data uses
   names packs don't (`data.landing`); `docs/CONTRACT.md` lists the engine's keys.
5. **Symptom:** one Lv3 Cinderkite (void2) beat the autopilot every time. **Cause:** every meteor
   cracked its panel and stepping off a cracked panel breaks it, so within a minute the player's area
   was holes and the bot had nowhere to go. **Fix:** only the Ω kite's aimed meteors crack the floor.
   Lesson: a hazard that removes panels needs a budget (lava already had one: at most 2).
6. **Symptom:** after teaching the bot exact blast shapes, Cold Shells (cool2) went from 100% to 25%.
   **Cause:** the bot planned one-panel steps, but on ice a step slides to the next non-ice panel, so
   "step off the target" carried it back into the mortar's landing cell. **Fix:** plan in real steps:
   a step's landing cell follows the slide. Fixing one blind spot exposed another, so rerun the whole
   sweep after every bot change, not just the encounter you were fixing.
7. **Symptom:** Scurrier bombs hit the bot about every 5 seconds. **Cause:** the bomb runs along its row
   and turns once, toward anyone in the column it is crossing; the bot watched only the row ahead.
   **Fix:** the bomb's current column counts as unsafe until it has passed. The dodge is a sidestep.

### Balance sweep (autopilot, 6 seeds per encounter)
Every Gauntlet encounter now wins 83-100%; before these fixes Dead Signal (void2) and Hunt Pack (riv3)
were at 0%. The bot reads every telegraph perfectly but never heals or plans chip combos, so this
measures fairness ("can it be dodged at all?") more than difficulty. The Gauntlet bosses (V1) win
83-100%; the boss packs report that their V3 and Ω versions beat the bot, as intended.

### Pre-built folders
The owner asked for "pre-organized folders". Following BN3's XtraFolder, these are loaned folders: equip one
instead of your own from the FOLDER menu (which now opens on a folder list: equip, edit your own, or view a
pre-built one's chips). The chips don't have to be owned and never enter the pack, and the folder can't be
edited. Seven folders live in `src/game/data/folders.js`:

| Folder | Unlocks at | Codes | Fusion |
|---|---|---|---|
| Starter (the folder every save begins with) | start | mixed | Cannonade |
| Cannon Crew | start | A B C | Cannonade |
| Swordplay | start | E L | none |
| Elemental | area 4 | E J | TidlSprd, InfrnSprd (one copy of each part) |
| Blade Master | area 5 | L | LifeSaber |
| Demolition | area 6 | F | MegaRat |
| Prism Edge | area 7 | P | PrismSabr (Megas: HeroSwrd, Pyreclaw) |

They also put four chips in play that no area drops and no shop sells: Plasma1, Wind, Mine and StepCros.
The equipped folder is saved (`activeFolder`). Saves without the field, or naming a folder that's locked or
doesn't exist, fall back to your own.

#### Gotchas
1. **Balance:** an all-`*` "Rainbow Star" folder let any five chips go together. In the autopilot sweep it
   cleared areas 4-5 in 19 s against 35-59 s for the other folders, faster even than the late-game Prism
   Edge. **Fix:** it became Elemental, on codes E and J, with one copy of each fusion part. It is still the
   bot's fastest folder (25 s), because its element-matched spread shots suit how the bot plays. The bot
   ignores fusions and is poor with swords, so Blade Master reads slow (59 s) while LifeSaber is likely the
   strongest in human hands. Watch these two in real play.

#### Oracles
- `tests/folders.test.js` (6 tests): every folder is a legal 30-chip folder; non-starter folders use at
  most three codes; each listed fusion is made by the engine's own PA finder from the folder's chips;
  unlocks, equip refusals and loaning (pack and own folder untouched); the saved choice and fallbacks; and a
  battle deals from the equipped folder, with every folder.
- **Autopilot sweep** (areas 4-5 and 7-8, 5 seeds per battle): every folder wins at least 87% of fights.
- **Browser run** on the built file with real keys: open FOLDER, equip, try a locked folder, view a folder's
  chips, open the editor, go back. No page errors.

### Fusions you can actually make
The owner: "i haven't been able to do a program advance, why". The engine was right (Cannon A, B, C fused in
its tests). The game around it made fusions close to impossible:
1. **The starter folder could make none.** It was BN3's own: Cannon A and B but no Cannon C, and Sword and
   WideSwrd but no LongSwrd. A Cannon C sat in the pack, and nothing said so.
2. **The drops could build 2 of the 15.** Pieces dropped with codes that don't fuse (Bubbler A, Bub-V D,
   BublSide B; HeatShot B, Heat-V F, HeatSide C), and TimeBomb, Spreader, GutStrgt, Yo-Yo1 and Ratton3
   never dropped. Only Cannonade (with the pack's Cannon C) and Aegis500 (from area 7) could be built.
3. **Nothing pointed at them.** The Custom Screen named a fusion only with the cursor on OK, after the
   chips were picked in the right order, and the help gave two examples.
4. **A fusion folder deals one rarely.** Over 20,000 dealt battles, Cannon Crew has Cannon A, B and C in
   one hand in 3.6% of 4-turn battles if you use every chip each turn. Holding the pieces (unpicked chips
   stay in the hand) raises that to about 16-33%.

**Fixes:**
- **Starter folder:** a Cannon C in place of the SideGun S, which goes to the pack instead. A save still
  on the old starter, never edited, moves to the new one on load (`SaveData.upgradeStarter`).
- **Drops:** every fusion's chips now drop with codes that fuse, most within one area, and the shop sells
  them after. That added 23 chips to drop lists (now 4-5 per battle) and changed 10 codes.
- **Custom Screen hints** (`fusionHint` in `src/engine/custom.js`, drawn by `src/render/customView.js`):
  - the chips that fuse are lit and numbered in pick order, and the next one blinks;
  - "Ready! Press OK" once the picks make one;
  - "Undo (B) and pick the lit chips in order" when the picks so far block it;
  - "Needs Cannon C: hold the lit chips" when two pieces are in the hand and the third is still in the
    folder.
- **Help:** a FUSIONS page (the rules, BN's name for them, hold the pieces) and two FUSION LIST pages
  built from the data (`src/game/data/fusions.js`): every recipe and the area where its chips all drop.
- **FOLDER menu:** each folder's fusions, your own included ("No fusion yet" when it has none).

| Area | Fusions whose chips have all dropped by then |
|---|---|
| 1 Boot Sector | Cannonade (Cannon A B C, already in the starter folder) |
| 3 Coolant Bay | TidlSprd (code E), YoYoStorm (Yo-Yo1 C D E) |
| 4 Thermal Core | InfrnSprd (J), Supernova (Spreader M N O) |
| 5 Foundry | Cannonade2 (HiCannon I J K), RushPunch (GutPunch B C D) |
| 6 Overgrowth | DoomBomb (TimeBomb J K L), MegaRat (A) |
| 7 Rival Gate | LifeSaber (L), StepCombo (StepSwrd L M N), PrismSabr (N), Aegis500 (E) |
| 8 Null Zone | Cannonade3 (M-Cannon P Q R), RushStrgt (GutStrgt O P Q) |

#### Gotchas
1. **Symptom:** a lit set (Sword, WideSwrd, LongSwrd) didn't show which chip comes first. **Fix:** lit
   chips carry their place in the pick order.
2. **Symptom:** set recipes are too wide for one help line with an area tag. **Fix:** the sets page uses
   two-line rows (name and area, then the chips).
3. **Symptom:** the random-hand check of the hint found 1 hand in 1,500 that could fuse. **Cause:** hands
   were drawn uniformly from ~100 chips. **Fix:** each hand is seeded with a fusion's pieces, now and then
   with a wrong code, so the check covers both hits and near-misses.

#### Oracles
- `tests/fusions.test.js` (8 tests):
  - the hint's states;
  - a brute-force check over 1,500 hands: the hint finds a fusion exactly when some legal ordered pick
    makes one, and following it pick by pick makes that fusion;
  - every fusion can be built from the drops;
  - the old-starter migration;
  - the folder menu's fusion list.
- **Browser run** on the built file with real keys: a hand with Cannon A, B and C picked in order (lit
  chips, blinking next pick, Ready), the "Cannonade" banner and `cannonade1` queued; then the hold, undo
  and set states, the help pages and the folder menu. No page errors.

### The final boss, and AirShoes
The owner: "the area 8 boss seems impossible to beat", then "is there an AirShoes program so we can walk on
empty tiles". Measured with the autopilot as an area-8 player (660 HP, the balance sweep's stats), ZeroDay
V1 cost a perfect dodger 68% of its HP. Every other boss cost 0-39%. Starting at half HP, the bot won 20%.
Five causes:
1. **The Earth Splitter dug its own trap.** Its waves cracked every panel they crossed, and cracking an
   already-cracked panel breaks it. The dodge is a step into a row the first pulse has crossed, so once
   the floor was cracked, the first pulse turned those panels into holes and the second pulse could not
   be dodged.
2. **The floor wore away.** Each Earth Splitter cracked all 9 of the player's panels, so every later step
   left a hole. The bot had no legal step 22-28% of the time, and the Null Barrage hit it there.
3. **No time to react.** When ZeroDay landed at the front of its area, the first wave reached the player
   8 frames after it appeared.
4. **HP:** the boss was fought on whatever HP the three virus battles left, and a loss reset the area.
5. **AirShoes could not be had.** The program existed ("stand on holes"), but no boss or shop gave it;
   the AirShoes chip was only an S-rank rare in area 7.

**Fixes:**
- **Earth Splitter** follows Ironclad's Quake Stomp rule: its waves crack normal panels but leave cracked
  ones alone, so they never dig holes. At V1 the waves don't crack at all; V2 and up crack the floor.
- **A row tell:** the rows the first pulse takes light up (ZeroDay's warning, drawn bold) for 20 frames at
  V1, then 16, 14 and 12 at V2, V3 and Ω.
- **Gauntlet:** each boss is fought at full HP, and losing to a boss (or retreating) sends you back to the
  boss, not the start of the area. A virus battle lost still resets the area.
- **AirShoes:** Ironclad now gives SuperArmor and AirShoes. A boss reward can list several programs, and a
  save that already beat a boss gets any program it gives on load. The results screen fits a three-line
  reward.

| ZeroDay V1, perfect-dodging bot, 660 max HP | Before | After |
|---|---|---|
| Damage taken from full HP | 449 | 239 |
| Wins from half HP | 20% | 83% |
| Balance sweep (6 seeds): win, time, damage | 92%, 112 s, 472 | 100%, 81 s, 285 |

#### Gotchas
1. **Symptom:** after the hole fix, FloatShoes looked worse (half HP: 90% wins, then 60%). **Cause:**
   shockwaves stop at holes, so the holes had been shielding the bot from waves. Not a bug, and BN works
   the same way. FloatShoes still cut barrage damage from 109 to 14.
2. **Symptom:** the perfect bot still takes about 4 wave hits a fight. **Cause:** its own pathing. When it
   escapes, it steps onto the panel the first wave is still crossing, where a person would wait a beat.
   The bot is the measuring tool, so it was left as is; read its ZeroDay numbers as an overstatement.
3. **Symptom:** a reaction-delay bot (actions 250 ms late) as a stand-in for a person scored Tidecaller and
   Pyreclaw at 0%, bosses the owner had beaten. **Fix:** it is not a usable human proxy; compare before and
   after on the perfect bot instead.
4. **Symptom:** the first row tell was nearly invisible. **Cause:** it reused the Void Collapse warning,
   which blinks slowly over 80 frames. **Fix:** a bold variant (`quick`) that never blinks off.

#### Oracles
- `tests/bosses_b.test.js`:
  - V1's Earth Splitter marks its rows first, runs along every row and leaves the floor whole;
  - V2's never digs holes, even on cracked floor. With the old crack restored, this test fails.
- `tests/gauntlet.test.js` (4 tests):
  - full HP at the boss and the checkpoint, while a lost virus battle still resets the area;
  - every program can be earned;
  - old saves get AirShoes;
  - AirShoes let the player stand on holes.
- **Browser run** on the built file with a save parked at ZeroDay on 57 HP and no AirShoes:
  - AirShoes appeared on load, and the fight started at 660/660;
  - the row tell showed on screen;
  - a loss returned to the boss with "Deleted! Try the boss again.";
  - PROGRAMS listed AirShoes.

### Customize: AXIOM's look
The owner wanted the grid game "more modular so users can customize the parts to their character: arms,
legs, torso", plus a simple colour system, and asked whether to use Tripo models. **Route:** no Tripo here.
The grid game is 240x160 pixel art, where the navi is about 30x46 px. A 3D model would clash with the style,
and Tripo exports one fused mesh, not swappable parts (its rig also needed repair for the open world). AXIOM
was already composed from layered pixel parts (back arm, shoulders, torso, legs, head, front arm), so the
parts became swappable.

- **Parts** (`src/render/sprites/core_player_looks.js`):
  - Heads, torsos, shoulder pairs and back pieces are new pixel art in the same body coordinates, so all
    25 poses still fit.
  - Leg and arm styles re-plate the existing limb art, swapping which pixels are armour, suit or lights,
    so the sword, cannon, hammer and other arm poses keep working with every look.
  - The hurt face is derived: each head lists its visor rows, which go dark with a pale glint.
- **Colours:** three channels (armour, suit, lights) over the palette keys the art already uses. A preset
  is one base colour; the ramp copies AXIOM's own lightness steps, less saturated in the highlights and
  hue-shifted in the shadows. Style Change still tints the lights by element in battle.
- **CUSTOMIZE** (title menu): left/right changes each row, plus RANDOM, RESET and DONE. A 2x preview on a
  battle panel cycles idle, shoot, sword, cannon, guard and punch. Every change is saved at once
  (`look` in the save; bad or missing values fall back to AXIOM's).
- **Battles:** the look rides on the player as `data.look` for the renderer only. The title demo shows it
  too.

#### Gotchas
1. **Symptom:** the first thruster and scarf were nearly invisible, and the wings read as a blade.
   **Cause:** the back shoulder covers everything from X = -11 rightward. **Fix:** back pieces reach
   past it, and the wings root at the shoulder.
2. **Symptom:** Nova and Oni sat on a stalk. **Cause:** an extra neck row. **Fix:** every head ends at
   Y = -27 with one jaw row, like AXIOM's.
3. **Rule:** a look is replaced, never edited in place. The renderer keeps composed poses and palettes per
   look object (a WeakMap), so an edited object would keep showing the old look. The save and the screen
   freeze looks.

#### Oracles
- **Pixel check:** the default look composes all 25 poses pixel-identically to the previous AXIOM.
- `tests/looks.test.js` (6 tests):
  - every option has art and changes the idle pose; every pose stays inside the 64x56 sprite;
  - every colour preset ramps light to dark and changes the palette;
  - every head's hurt face darkens;
  - looks save, reload and repair;
  - a battle plays out identically with any look.
- `tools/navi.html` (served by `tools/serve.mjs`): every part and colour on AXIOM, plus a mixed look in
  ten poses. `?rows=` and `?scale=` zoom in.
- **Browser run** on the built file with real keys: change every row, the save persists, DONE returns to
  the title (whose demo shows the look), and a Free Battle draws it on the field. No page errors.

### 3D graphics, and your own 3D models
The owner asked "can we make everything 3D?", then "I want users to be able to bring in their own 3D
generated characters ... say I make a character in Tripo". That reverses the Customize entry's "no Tripo
here": the models now live in a 3D mode, not in the pixel art. **Route:** a 3D renderer under the 2D view,
not a rewrite. The sim and the 2D BattleView still run everything; battles are drawn by three.js on a canvas
under the now see-through 2D canvas.

- **Space** (`src/render3d/space.js`): an orthographic camera tilted 30 degrees, with world x = screen x and
  screen y = 80 - y cos + z sin. The floor projects exactly onto the 2D panel rows and feet, so everything
  still drawn in 2D (effects, numbers, HUD, Custom Screen) lines up with no changes.
- **Sprites become voxel models** (`voxels.js`):
  - `sprite()` in pixel.js gained a sink. While the stage captures a body, its multi-colour sprites go to
    3D. One-colour silhouettes are glows and flashes: drawn behind the body they become an emissive glow,
    drawn over it they stay 2D tints.
  - Each frame of art is built once (LRU of 360 models). Fronts bulge up to 4 units toward the camera,
    wide rows run deeper than thin ones, only fronts, tops and sides are built, and faces are merged.
- **Stage** (`battle3d.js`): one shared scene for every battle view.
  - Panel blocks wear the 2D panel art (an atlas redrawn by `drawField`), and the area background is the
    backdrop.
  - Lighting: a hemisphere fill, a key light with a 2048 shadow map, and a cyan rim. Effects add point
    lights by name or element, and the buster's charge glows.
  - Bodies get blob contact shadows, plus hit-flash, see-through and glow materials. The intro
    materialise is a clip plane with a scan ring.
- **The camera moves only while the overlays are put away.** It swoops in from low at the side over the
  first 96 frames (perspective blending into the exact 2D framing, with 1/distance interpolated) and pushes
  in on the winner. Meanwhile anchored 2D art is drawn to a scratch canvas. Reduce Flash/Shake keeps it
  still.
- **Graphics option** (`src/render/graphics.js`): OPTIONS > GRAPHICS 3D/CLASSIC, the G key, or
  `?gfx=2d|3d`. The default is 3D, falling back to classic without WebGL. The 3D code loads on first use
  (dev) or is inlined (build).
- **Your own model** (`models.js`): CUSTOMIZE > 3D MODEL (OFF / MECH / yours), TURN and LOAD .GLB, or drop
  a .glb on the page.
  - Prepared in the browser. Tripo's broken auto-rig (bones at the origin, garbage inverse binds) is rebuilt
    from the skin weights (tools/repair_glb.py's method, ported). A rig that still fails is shown static.
    Textures are cut to 1024 px, metal is toned down, and the model is scaled to 55 units.
  - Kept in IndexedDB (in memory where blocked); looks gain `model` and `turn`.
  - Animated from the battle state: whole-body recoil, lunges, hurt and delete; with Mixamo bones, arms
    lowered from the T-pose and aimed for buster, sword, throw and guard. Sword and Cannon chips show a
    glowing arm blade or arm cannon.
- **Builds:** /grid now bundles three.js (407 KiB gzipped). The MECH is fetched from `/assets/mecha.glb` (a
  serve-dist route); the Artifact inlines it (2.9 MB).

#### Gotchas
1. **Symptom:** shadows came out as dashed streaks. **Cause:** with `shadowSide` unset, three casts shadows
   from the back faces of FrontSide materials, and the voxel shells have none. **Fix:** `shadowSide:
   DoubleSide`.
2. **Symptom:** a warning, then no soft shadows. **Cause:** `PCFSoftShadowMap` is removed in r186. **Fix:**
   PCFShadowMap with `shadow.radius`.
3. **Symptom:** the built page said "Failed to construct 'URL'" and stayed 2D. **Cause:** DRACOLoader
   resolves its default decoder paths with `import.meta.url` at load, and a classic (iife) script has none.
   **Fix:** esbuild `define: { 'import.meta.url': 'document.baseURI' }` for the grid build (the game sets
   its own decoder path).
4. **Symptom:** in the exact 2D framing the scene read as "the 2D game, lit": you mostly see fronts.
   **Fix:** the opening swoop and the closing push-in, in perspective, while the overlays are away.
5. **Symptom:** scan rings floated above short enemies. **Cause:** the 2D reveal climbs 64 px whatever the
   body's height. **Fix:** rings stop at the top of the body.
6. **Symptom:** the sawblade built a new voxel model (and a new 2D bitmap) every frame. **Cause:**
   `flipRows` made new rows each call. **Fix:** cached per rows.
7. **Rule:** Lambert shading divides by pi. The fill and key are set so a front face shows its sprite
   colour, and panels are tinted back to their 2D colours.
8. **Not a bug:** the mech's long straight tail is in the model; the raw Tripo file has it too.

#### Oracles
- `tests/render3d.test.js` (5 tests):
  - panels and feet project to the 2D pixels;
  - voxel faces, depth, colour, mirroring and caching;
  - the sink's box under a translate and a mirror;
  - the mech prepared: rig ok, 55 tall, feet on the floor, centred;
  - a broken rig (bones at the origin, inverse binds of 1e37) rebuilt within 0.5 units of the offline
    repair.
- **Pixel check:** classic 2D is pixel-identical to the previous build (Tidewalker battle, frames 30, 150 and
  400: zero differing pixels).
- **Browser runs (SwiftShader), frame-exact:**
  - boot and boss battles, and the title demo, in 3D; the swoop frame by frame;
  - the MECH fetched (/grid) and inline (Artifact from file://);
  - the owner's raw Tripo .glb through the picker and by drop: rig rebuilt, survives a reload;
  - bad files (a .txt, random bytes) refused with a message;
  - phone portrait with touch; G mid-battle both ways; Reduce Flash keeps the camera still.
  - No page errors.

## 6. Open-world prototype

The owner moved the direction off the grid: "a fighting game that's open world like Palworld", using a
3D mech they generated with Tripo AI. Route: same architecture as the grid game (a deterministic headless
sim plus a separate view), with three.js r186 on WebGL2 for the view (picked from the research report:
smallest strict-CSP-safe option that reaches ~97% of browsers).

### Gotchas
1. **Symptom:** the rigged GLB rendered as nothing, and posing it sent vertices to ~1e37. **Cause:**
   Tripo's export left every bone at the origin (no translations) and wrote garbage inverse bind
   matrices; the skin weights themselves were fine. **Fix:** `tools/repair_glb.py` puts each joint at
   the centroid of the vertices weighted to both the bone and its parent (the blend zone), writes the
   rest pose as translations and rebuilds the bind matrices. Its first export was an OBJ, which can't
   hold a rig at all: ask for GLB.
2. **Symptom:** a "delete" event never arrived. **Cause:** the event payload had a `type` field (the
   enemy type) that overwrote the event's own `type`. **Fix:** payloads use `enemy`, never `type`.
3. **Symptom:** an aim-assist test failed only on some seeds. **Cause:** the target stood behind a
   ridge, so the shot hit the ground first. **Fix:** mechanics tests run on flat, empty ground; terrain
   gets its own tests.
4. **Design:** sealed rifts used to reopen after 75 s, which read as a bug. Rifts now stay sealed, and
   sealing all six starts a tougher wave (+40% HP, +25% damage).

### Oracles
- `tests/world.test.js` (14 tests): movement, jump/dash, buster/charge, aim assist, counters, every
  virus attack, data pickup, rift waves, respawn, determinism, a 6,000-frame fuzz.
- A headless bot sweep (4 seeds x 5 min): 46-56 deletes per run, no knockdowns, so a perfect dodger
  wins; humans will find it harder.
- `tools/world_shots.mjs`: Playwright screenshots of the real page with the demo pilot; fails on any
  page error. Checked on desktop and at phone size with touch controls.
- Not verified: real-GPU frame rate. Headless Chromium renders in software. F3 shows FPS, and slow
  frames lower the resolution automatically.

### 6b. Kingdom Hearts 2-style combat

The owner asked to make the gameplay "more like Kingdom Hearts 2", with a lock-on, and with attacks that
come from enemies' skills so the chip system stays. A research pass on KH2, Birth by Sleep and
Re:Chain of Memories drew on the PS2 manual, the KH wiki and OpenKH's attack-table docs. Its notes are
kept locally, not committed. Ideas taken from it:
- KH2's two-tier targeting: a soft target that attacks go to, plus a hard lock.
- 3 hits plus a finisher, chosen by the situation.
- A whiff ends the combo.
- Revenge value.
- Reaction prompts tied to enemy wind-ups.
- BBS-style command cooldowns and chips that keep a combo going.
- A spell finisher worth ×2.
- Re:CoM's enemy cards as the precedent for learning chips from deletes.

Route: the combat is data in `src/world/combat.js` and runs inside the same deterministic step. The view
only reads the state:
- the saber grows out of the buster hand;
- slash trails are Catmull-Rom ribbons;
- strike, chip and reaction poses are procedural bone targets;
- hit-stop freezes the pose with the world.

#### Gotchas
1. **Symptom:** the bot sweep crashed with `s.finisher` undefined. **Cause:** a chip that cut into the
   finisher stored "continue the combo at step 4", and there is no step 4. **Fix:** a chip only resumes
   the combo before the finisher; regression test added. The fuzz test missed it, so sweep after every
   rule change.
2. **Symptom:** locked on in melee, the player hid the target. **Cause:** the camera aimed along the
   player-to-target line, so the over-the-shoulder offset moved both by the same amount. **Fix:** aim
   from the shoulder pivot and look further down while locked.
3. **Symptom:** slash trails were invisible in headless screenshots. **Cause:** software rendering ran
   at a few frames per second, so each 0.1 s swing got one or two trail samples. **Fix (tooling):**
   `window.__world.hold()` and `advance(n)` step the game and render at an exact 60 fps for scripted
   captures.
4. **Symptom:** horizontal slashes barely showed from behind. **Cause:** the trail ribbon was edge-on to
   the camera. **Fix:** steeper diagonal swings.
5. **Symptom:** in the ShockWave test, the hit "never happened". **Cause:** it happened in the same step
   as the press, in the batch of events already read. **Fix:** collect every batch.
6. **Input:** a tap that starts and ends between two steps used to be lost (held-state sampling). Taps
   are now remembered until the next sample, as in the grid game. Ctrl/Cmd shortcuts are left to the
   browser.

#### Oracles
- `tests/world_combat.test.js` (29 tests):
  - lock-on pick, switch, wrap-around and on-screen retarget;
  - the soft target;
  - combos, the launcher and the spin;
  - whiffs, the grace window, hit-stop, cancels, the air combo and revenge armor;
  - BREAK, REVERSAL and DEFLECT;
  - chip learning, levels, the three chips, cooldowns, chip finishers and combo carry-over;
  - a 9,000-frame fuzz with every button, and determinism.
- `tests/world_input.test.js` (6 tests): taps between steps, mouse buttons, chips, Q/E in both modes,
  wheel pulses, and leaving Ctrl+R alone.
- **Bot sweep** (4 seeds × 5 min): 66-74 deletes, 22-37 reactions, 49-58 chips, no knockdowns, all chips
  at level 3. A bot that never misses a prompt wins easily. Humans will find it harder, but that is the
  next balance question.
- **Scripted captures** (SwiftShader) of every strike, chip and reaction, plus phone portrait and
  landscape layouts. No page errors.

### 6c. Parts decide the moves

The owner asked for "the parts system so parts decide my attacks", the Medabots / Custom Robo idea from the
design talks. Route:
- **Slots and parts:** four slots, each with four parts, all pure data in `src/world/parts.js`.
  - **Arm:** the combo, its reach, lunge and finishers.
  - **Gun:** tap and charged shots.
  - **Legs:** speed, jump, dodges, air dodges, weight, glide, steadiness.
  - **Core:** HP and a passive.
- **Kit:** `buildKit()` folds a loadout into one object, and the World reads it wherever it used to read
  constants.
- **Gun arm:** guns moved to the left arm, so the right hand holds the melee part, like Medabots' left and
  right arm parts.
- **Getting parts:** sealing a rift turns up a missing part (Medabots' "winner takes a part" spirit). DATA
  buys the rest.
- **Garage commands:** they travel in the step input (`input.garage`), so recordings and determinism tests
  cover them. The World refuses them with a virus within 30 m.

#### Gotchas
1. **Symptom:** one Spreader blast made a virus armored at once. **Cause:** revenge value counted every
   hit as 1, and a blast is 5-11 pellets. **Fix:** hits are weighted (pellet 0.15, buster 0.4, Breaker
   0.5, strikes 1).
2. **Symptom:** the Lance whiffed from 13 m. **Cause:** the lunge was capped at 0.2 s, too short for that
   distance. **Fix:** lunge time scales with the arm's lunge distance.
3. **Symptom:** shots leaked GPU memory, with every shot building its own sphere geometry. It got worse
   with up to 11 pellets a shot. **Fix:** shared geometry and materials per size and colour; railgun beams
   dispose theirs.
4. **Tooling:** a scripted capture showed the old garage panel after a purchase, because its stepping path
   skipped the menu refresh. **Fix:** one event handler for the game loop and scripted steps.
5. **Visual:** the Breaker's box head read as a slab; it became a drum with glowing faces.
6. **Visual (not a bug):** a dark rod behind the mech's left hip is part of the owner's model.

#### Oracles
- `tests/world_parts.test.js` (19 tests):
  - the catalog;
  - buying, equipping and combat refusals, and HP carry-over;
  - rift finds and the wallet;
  - every arm's combo, Breaker armor breaks, the Lance's 13 m lunge and pierce, Claws air hits;
  - the Spreader's fan, the Railgun's line hits, the Bomber's arc;
  - leg speeds, Hover glide and air dodges, Treads steadiness and knockback weight;
  - Link and Overclock;
  - saves (including junk saves);
  - a determinism and NaN fuzz with random loadouts.
- **Per-part bot sweep** (4 seeds × 3 min each, starter parts elsewhere): 164-199 deletes per part, no
  knockdowns, no part far ahead or behind. The bot plays one style, so this only shows each part works in
  real fights.
- **Scripted captures:** every arm mid-swing, the quake and pierce, all four guns, Hover glide,
  Sprinters, Treads, garage close-ups of four loadouts, and the garage on desktop and on phone portrait
  and landscape, bought by keyboard and by touch. No page errors.

### 6d. The forge: players design their own weapons

The owner asked for "a feature that lets users create and design their own weapons with effects", and for the
closest existing game to model it on. Two research passes (notes in `research_notes/Weapon creator
reference/`, kept local): the closest matches and the design practice.
- **Model:** Warframe's modular weapons and mods (a part decides the behaviour; effects are mods in a
  capacity budget; elements carry statuses), inside Battle Network's NaviCust memory and element wheel. From
  Zelda: Tears of the Kingdom's Fuse, enemies feed the effects: each virus family teaches mods. Elden Ring's
  Ashes of War (a learned skill bound to a weapon) is the obvious next step: one chip per design.
- **A design is a recipe, not code** (`src/world/forge.js`): an owned base part (keeps its moves), a form
  (4 shapes, S/M/L, 12-colour body and glow), one element, up to three mods within 10 MB (+2 for Null).
  Everything is an index into fixed tables, so every design is valid, balanced by the budget, deterministic
  and short enough for a share code.
- **The World applies it** to the kit (`applyDesign`): strike and gun numbers scaled, plus effects checked on
  hits (`armFx`, `gunFx`): weakness ×2, burn, soak, shock, leech, critical, chain, burst, wave, pierce,
  homing, split. Forge commands (`forge`, `equip-design`, `delete-design`, `unlock`, `dummy`) travel in the
  step input like the rest of the garage. Saves are v2 (designs, programs, equipped; v1 still loads).
- **Virus elements:** Rivet Wood, Plinker Fire, Dartfin Aqua; chips carry their virus's element. No virus is
  Elec yet, so Wood has no prey (its summary says so).
- **The editor** (garage FORGE tab, `src/world/garage.js`): live preview on the mech (the view draws the draft
  through `view.preview`), exact numbers against the equipped weapon, per-effect summary, MB cells like the
  NaviCust, learn progress on locked mods, RANDOM, SHARE/IMPORT, TEST (training dummies), UNDO, two-step
  DELETE. Keyboard (arrows move along and between rows), gamepad (LB/RB tabs, d-pad, A) and touch.
- **Looks** (`src/world/gear.js`): parametric meshes per base and shape (extruded blade outlines, a mace, an
  axe, a drill thread, guns long/twin/heavy), built on demand and disposed when replaced. The view adds
  element particles on the blade and gun, element-coloured trails, impacts and weakness bursts, chain
  lightning, burst blasts, the Wave's ground crescent, burn/soak/stun on viruses and rings under dummies.

#### Gotchas
1. **Symptom (found by the design-practice agent):** Elec locked a virus out of acting 99.7% of the time
   under ≥3 hits/s, and Elec + Chain froze whole packs (0 hits taken against 8 with Null). **Cause:** every
   third hit stunned for 1 s, through revenge armor. **Fix:** after a stun the virus resists for 3 s (BN6's
   paralysis window) and needs more hits next time, 3 then 5 then 7 (Monster Hunter's rising tolerance).
   Now 45-56% locked against 38-47% for Null; a test fails if it creeps back.
2. **Symptom (same agent):** 5 of 350k one-character insertions decoded to a different design. **Cause:**
   an insertion shifts the name-length byte, and CRC-8 then passed 1 in 256 times. **Fix:** CRC-16, an exact
   length and zero-padding check, and fixed append-only code tables (bases, elements, mods), so reordering
   the catalog can never change what an old code means. Tests try every insertion, deletion and
   substitution on several codes.
3. **Symptom:** a weak critical counter dealt ×8 (Overclock ×12). **Fix:** bonuses add up (+100% weak,
   +100% critical, +100% counter, +200% with Overclock), as Battle Network 4-6 did.
4. **Symptom:** Homing + Split on the Buster was the one combo far ahead in the bot sweep (+19% deletes),
   because all three shots homed. **Fix:** only the centre shot homes (+8% now).
5. **Symptom:** burn dealt three or four ticks depending on float sums. **Fix:** burn counts whole ticks.
   **Symptom:** Wood healed fractions of HP. **Fix:** a bank pays out whole HP.
6. **Symptom:** the first click after typing a name did nothing. **Cause:** the name box's blur redrew the
   buttons between press and release. **Fix:** controls are only redrawn when their markup changes.
7. **Symptom:** typing W, A, S, D or Space in the name box moved or jumped instead. **Fix:** the game's
   keys, the G shortcut and the garage's own keys ignore text boxes.
8. **Symptom:** the parts list showed under the forge. **Cause:** a class's `display: grid` beat the
   `hidden` attribute. **Fix:** `[hidden] { display: none }` for that panel.
9. **Layout:** the garage covered the mech, so the preview was hidden. It now docks right on wide screens
   and at the bottom on tall ones, and the camera frames the mech in the space left (pulled back for long
   weapons); the forge's actions stay pinned at the bottom of the card.

#### Oracles
- `tests/world_forge.test.js` (32 tests): validation, memory and the Null bonus, names; share-code round
  trips (400 random designs, sloppy retyping) and every one-character typo, insertion and deletion; forge,
  equip, edit, delete, unlock and learn commands and every refusal; applying designs (and that the catalog
  never changes); each element's weakness; chip elements; burn, soak, shock (with the resist window and
  rising tolerance), leech; a lock-share check; additive bonuses; every mod in a real fight; training
  dummies; saves (v2, junk, v1); a determinism and NaN fuzz forging random designs.
- **Bot sweep** (3 seeds × 3 min per weapon, 19 weapons): 130-150 deletes against 139 for the plain Saber,
  no knockdowns.
- **Browser runs:** the forge driven by mouse, keyboard (typing a name full of game keys, arrow navigation)
  and touch on desktop and phone portrait and landscape; forge + equip, unlock, share then import, a bad
  code, test on dummies; close-ups of all 32 shapes. No page errors.
