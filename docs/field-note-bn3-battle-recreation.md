---
kind: game
title: "A fights-only browser game recreating Mega Man Battle Network 3's battle system"
game: "Mega Man Battle Network 3"
games_also: []
game_version: "Blue Version (USA), game code A3XE, revision 0, SHA-1 3d21905b6e860d39a00ba643779776de4c73c411"
platform: emulator
engine: unknown
route: reimplementation
tools: ["Python 3.13 (ROM table readers)", "Node 22", "esbuild 0.25", "Playwright 1.56 + Chromium", "Archipelago worlds/mmbn3 (charset, chip IDs)"]
anti_cheat: "none (offline GBA cartridge dump supplied by its owner; nothing was hooked or patched)"
status: working
agents: ["Claude Code (Opus 5.5)"]
humans: []
date: 2026-10-14
links: ["https://github.com/TayoAki/CyberMetal-GridWars"]
tags: [gba, battle-network, reimplementation, rom-tables, headless-sim, html5-canvas, webaudio]
---

# A fights-only browser game recreating Mega Man Battle Network 3's battle system

> BN3's real-time grid battles, rebuilt as a deterministic 60 Hz JavaScript simulation with an HTML5
> canvas view. There is no overworld: just viruses, boss navis, the Custom Screen and chip folders.
> - Chip numbers, enemy HP/elements and the starter folder were read straight from the owner's ROM
>   tables.
> - Art, audio and characters are original.
> - It runs in a browser. A rules bench, per-content tests, sprite sheets that were looked at, and a
>   Playwright run through the real UI verify it.

## Setup
- ROM: BN3 Blue (USA), header `MEGA_EXE3_BL` / `A3XE` / maker `08`, from the owner's upload. It is never
  copied into the repo.
- Node 22, Playwright 1.56.1 using the preinstalled Chromium, esbuild 0.25.10 for the single-file build.
- Python 3 scripts read the ROM. They were run with `-I`, from a separate tools folder, and their output
  stayed in a private scratch folder.

## Route and why
- **Engine recreation** (headless guest rules plus our own view), not a ROM hack.
  - There is no BN3 disassembly (only BN6/BN4 ones), so patching code is a big RE job.
  - The goal was "just the fights" as a game of its own.
- The rules are a pure sim:
  - frame timers;
  - a 6x3 panel grid;
  - seeded RNG, so a seed plus an input log replays exactly.
- The view only reads state and drains events.
- Content was built in parallel against a pinned contract (`docs/CONTRACT.md`), with one file per
  contributor.

## How the game works (what we had to learn)
All offsets are ROM file offsets; add 0x08000000 for the bus address.
- **Text encoding.**
  - Space = 0x00, '0'-'9' = 0x01-0x0A, 'A'-'Z' = 0x0B-0x24, 'a'-'z' = 0x25-0x3E.
  - 0xE6 ends a string, 0xE8 is a newline.
  - Archives are a u16 offset table relative to the archive start; first offset / 2 = entry count.
- **Chip names:** 0x7043EC (IDs 0-255) and 0x704E14 (IDs 256+; index 64 = chip 320, the first Program
  Advance). Descriptions are at 0x7052F4.
- **Chip data:** 0x20-byte records at **0x11510**, indexed by chip ID.
  - +0x00: six code bytes (A=0 … Z=25, `*`=26, 0xFF unused).
  - +0x06: element (0 Null, 1 Elec, 2 Fire, 3 Aqua, 4 Wood — note the order).
  - +0x07: attack family (swords 0x08, cannons 0x04, guns 0x06, bombs 0x07, waves 0x0A, recovery 0x0B,
    barriers 0x03, Navi chips 0x14, +damage chips 0x15, Z-PAs 0x17).
  - +0x08: per-chip parameter (Recov: heal/2).
  - +0x09: rarity - 1.
  - +0x0A: MB.
  - +0x0B: class flags.
  - +0x0C: u16 damage (10000 = variable, 9999 = +damage chips).
  - +0x0E: library number.
  - +0x10: alphabetical rank.
  - +0x13: bit 0x80 = Mega class.
  - Found by scanning for Cannon/HiCannon/M-Cannon = 40/60/80 at a fixed stride.
- **Enemy stats:** 8-byte records at **0x19618**, indexed by enemy ID.
  - Entry 0 is MegaMan with 100 HP.
  - The first u16 is `HP | element << 12`. Byte 4 is the class (0x04 virus, 0x08 navi), byte 5 the
    family, byte 7 the level.
  - Names are at 0x7112E4, in families of four (L1, L2, L3, Ω).
- **Preset folders:** `(u16 chip ID, u16 code)` × 30 per folder at **0xCBDC**. Folder 0 is the starter
  folder.

## Build steps
1. Read the tables with small scripts (offsets above). Keep the outputs private.
2. Write the sim:
   - field (panel types, ownership, crack/break, recovery timers);
   - player controller (step plus hold-repeat plus buffer, buster/charge);
   - Custom Screen model (selection rule, ADD, PA fusion, boost merging);
   - hit pipeline (element wheel, panel multipliers, barrier/aura/guard, flinch plus i-frames, counters);
   - busting level.
3. Content: chips as data rows plus one generator per attack family; enemies as `{ hp[4], element,
   levels[4], ai: function* }`.
4. View: a 240x160 canvas scaled nearest-neighbour; pixel-string sprites cached to bitmaps; an original
   bitmap font.
5. `npm test`, `npm run build` (one self-contained HTML), `node tools/smoke.mjs <url> <dir>`.

## Verification
- **Rules bench:** `node:test`. It covers selection rule, PA fusion, boosts, buster/charge damage,
  elements, holes stopping waves, holy/grass, counters, gauge timing, area steal and return, busting,
  determinism.
  - Run against three one-defect mutants (no element doubling, a loosened code rule, waves ignoring
    holes); every mutant failed.
- **Content packs:** each family/boss is tested for HP/element per level, landing hits on a passive
  player, its special rules, fuzzing and determinism.
- **Data tests:** every drop is a real chip+code, formations are legal, every encounter's families
  exist. This caught an enemy placed on a hole.
- **Visual:** sprite contact sheets rendered by Playwright and actually looked at; Custom Screen and
  battle screenshots.
- **End to end:** Playwright drives title → Gauntlet → an autopilot battle → results → map, and fails on
  any page error.
- **Not verified:** timings against the real game. Gauge fill, charge time, i-frames and virus attack
  damage are believed, not measured. The next step is mGBA Lua with a save state at a battle.

## Gotchas
1. **Symptom:** no HP table holding Mettaur 40/80/120. **Cause:** BN3's Mettaur2 has 60 HP, and some HP
   words carry the element in their top nibble (ColdHead = 0x3078). **Fix:** search for a loose pattern
   (Mettaur = 40 and Canodumb = 60/90 at the same stride), then mask with `& 0xFFF`.
2. **Symptom:** the element order looked wrong (LavaCan reads 2). **Cause:** BN3 numbers elements Null,
   Elec, Fire, Aqua, Wood. **Fix:** calibrate on known chips (ElecSwrd, FireSwrd, AquaSwrd, BambSwrd).
3. **Symptom:** the Program Advance recipe table can't be found as data. **Cause (believed):** the
   recipes are checked in code. **Fix:** PA damage *is* in the chip table (IDs 320-351); take recipes
   from community documentation and say so.
4. **Symptom:** `node --test tests/` fails to find tests on Node 22. **Cause:** it treats the directory
   as a module. **Fix:** use the glob `tests/*.test.js`.
5. **Symptom:** an off-by-one in a gauge test. **Cause:** the gauge fills, and an L press on that same
   frame opens the Custom Screen, which is intended. **Fix:** test L one frame *before* full.

## Assets
- All original, drawn in code as pixel-string sprites and primitives, with an original bitmap font.
- Audio is synthesized at runtime with WebAudio; the music is original.
- No fal key was available, so nothing was generated.

## Open questions
- Measure gauge, charge and i-frame timings in an emulator.
- Locate the PA recipe check in code.
- Style Change and the full Navi Customizer puzzle are not recreated.
- Local versus netbattles.
