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
