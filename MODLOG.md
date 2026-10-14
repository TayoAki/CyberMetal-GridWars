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
