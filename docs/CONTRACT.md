# CyberMetal GridWars — engine and content contract

This is the contract between the battle engine (`src/engine/`), the renderer (`src/render/`), audio
(`src/audio/`) and content packs (enemies, bosses, sprites). Read it before adding content. It is pinned
to this repository revision; if you change a rule, change it here too.

## 0. Originality rules (hard)

This game recreates *how Mega Man Battle Network 3 battles work*, not its content.

- **No Capcom material:** no sprites, music, sound, text or names from Mega Man / Battle Network. That
  covers MegaMan, Lan, NetNavi, Mettaur, FlashMan, Bass, "Battle Chip", "Program Advance" as a product
  name and so on.
- Every character is an **original design** under an original name. A family can *mirror* a BN3 virus's
  behaviour pattern and its HP (the numbers came from the ROM's stat table), but its look, name and
  details are ours.
- Music must be original composition. Don't transcribe or "approximate" any existing melody.
- Never commit ROM data or anything extracted from it.

## 1. The sim (`src/engine/`)

- **Determinism.** The battle is a pure 60 steps/s simulation. Never call `Math.random()`; use `b.rng`
  (`next() int(n) range(lo,hi) chance(p) pick(arr) shuffle(arr)`). Never read wall-clock time. Timers
  are counted in frames.
- **Grid.** 6 columns x 3 rows: `col` 0-5 left→right, `row` 0-2 top→bottom. Red (player) owns
  columns 0-2 at the start, blue (enemies) 3-5. Ownership changes (AreaGrab), see `b.field.ownerAt(c, r)`.
- **Facing.** Red bodies face +1 (right), blue bodies face -1 (left): `e.facing`.
- **Phases.** `intro → custom → banner → fight ⇄ custom … → win → results | lose → over`. AIs and
  spells only run during `fight`.

### Entities (`Entity`, `entity.js`)
Bodies standing on panels. All are in `b.entities`; `b.player` is the player.

| field | meaning |
|---|---|
| `id type name kind team` | `kind`: `player` `virus` `navi` `object` |
| `col row` | panel it stands on (occupancy: one body per panel) |
| `hp maxHp element level` | `element`: `null fire aqua elec wood` |
| `facing` | +1 or -1 |
| `alive removed deleteTimer` | dead bodies play their delete animation, then `removed` |
| `flinchTimer stunTimer iframes invisTimer` | status timers |
| `barrierHp auraPower guardTimer guard` | defences |
| `superArmor floatShoes airShoes flying underShirt` | flags |
| `counterWindow` | >0 while winding up; a chip/charge hit now is a **Counter** |
| `hidden` | untargetable *and* not drawn (burrowed, mid-teleport, dashing) |
| `hittable blocks immovable` | `blocks`: stops shots and projectiles |
| `anim animT` | **view hint**: current animation name and frames since it started (`e.setAnim(name)`) |
| `offsetX offsetY z` | **view hints**: panel-unit offset from `col,row` (dashes); pixels above the floor |
| `data` | per-type scratch (e.g. `e.data.summon` = navi type shown during a Navi chip) |
| `stats` (enemies) | resolved per-level stats: `{ name, hp, element, level, ...levels[i] }` |

### Spells (`Spell`, `spell.js`)
Attacks without HP (shots, waves, bombs, meteors, reticles), in `b.spells`.
Fields: `type team owner col row x y z dir t hit hitIds data element`.
- `x, y` are continuous panel coordinates for drawing.
- `z` is the height in pixels.
- `t` is the frame count.
- `data.progress` is 0..1 for telegraphs.
- Engine-owned `data` keys (don't reuse them for something else):
  - `target {col,row}` (lob),
  - `delay`, `landed`, `landing [[c,r]]` (drop),
  - `cells [[c,r]]` (zone),
  - `hidden` (mine).
- Content callbacks (`cells`, `onPanel`, `onHit`, ...) may draw from `b.rng`. The engine calls each one
  exactly when the effect happens, never speculatively, because an extra call shifts the seeded
  sequence.

### Events (`b.emit(type, data)`, drained by the view each frame)
| type | payload | meaning |
|---|---|---|
| `fx` | `{ fx, col, row, dir?, toCol?, shape?, element?, navi? ... }` | a one-shot visual effect |
| `sfx` | `{ name }` | a sound effect |
| `hurt` / `heal` | `{ id, amount, col, row }` | damage / healing numbers |
| `delete` | `{ id, col, row, kind, type }` | a body was deleted |
| `counter` | `{ id, col, row }` | counter hit |
| `chipuse` | `{ name, key }` | player used a chip |
| `custom` | `{ open }` | custom screen opened/closed |

### Hits (`b.applyHit(target, hit, src)`)
`hit = { damage, element, flinch, stun, push, pierceInvis, breaksGuard, ignoreIframes, ignoreHoly, isChip, isCharge }`.
- Element weakness, grass+fire and ice+elec each **double** damage (once).
- A holy panel halves damage.
- Barrier, aura and guard are applied in the pipeline.
- `b.hitPanel(src, c, r)` hits whatever stands on `(c, r)` once per `src` (spell or `source(...)`).

## 2. Enemies (`src/engine/enemies/`)

A family is one object:

```js
export const RIVET = {
  type: 'rivet',                 // unique key, also the sprite key
  kind: 'virus',                 // or 'navi' (bosses: battle uses the boss busting table)
  mirrors: 'Mettaur',            // the BN3 family whose behaviour/HP it is calibrated from (docs only)
  names: ['Rivet', 'Rivet2', 'Rivet3', 'RivetΩ'],
  hp: [40, 60, 120, 160],        // from BN3's stat table (MODLOG.md)
  element: 'null',               // or an array per level
  flying: false, superArmor: false,
  levels: [{ attack: 10, ... }, { ... }, { ... }, { ... }], // your tuning per level, read as e.stats.*
  *ai(b, e) { ... },            // generator, advanced once per fight frame while the body can act
  onSpawn(b, e) {}, onHit(b, e, hit, res) {}, onFlinch(b, e) {}, onDelete(b, e) {},
};
```

**AI rules:**
- The generator restarts from scratch after the body is flinched (`e.script = null`).
- A stun pauses it.
- Write it as a `for (;;)` loop with `yield* wait(n)` pauses.
- Use `e.setAnim(name)` for every pose change, so sprites can follow.
- Set `e.counterWindow = n` during wind-ups.
- Viruses stay in their own area. Use `b.tryStep(e, dc, dr)`, `b.canEnter(e, c, r)` or
  `teleport(b, e, c, r)`.
- Use `b.claimToken(key, e)` and `b.releaseToken(key, e)` for families that take turns.
- Read the player with `b.player` (`col row`).

### Combat helpers (`combat.js`)
| helper | does |
|---|---|
| `wait(n)` | `yield* wait(n)` |
| `hitscan(b, user, hit, {row, col, dir})` | instant shot down a row, returns the body hit |
| `strike(b, user, cells, hit, {fx, crack, breakPanel, panel})` | hit listed panels now |
| `shockwave(b, user, hit, {speed, row, col, dir, crack, type, onPanel})` | ground wave, passes through, stops at holes |
| `projectile(b, user, hit, {speed, row, col, dir, type, pierce, onHit})` | moving shot, stops at first body |
| `lob(b, user, hit, tc, tr, {frames, height, cells, crack, breakPanel, panel, type, landFx})` | arcing throw |
| `drop(b, user, hit, c, r, {delay, type, crack, breakPanel, panel, landFx})` | telegraphed strike on a panel |
| `zone(b, user, hit, cells, frames, {rehit, type})` | lingering hitbox |
| `marker(b, user, type, c, r, frames)` | a no-hit view marker (reticles) |
| `teleport(b, e, c, r, opts)` | move with warp fx |
| `freePanels(b, e)` | free panels in `e`'s area |
| `source(user, hit)` | a src for `b.hitPanel` / `b.applyHit` |

`speed` is frames per panel. Spell `type` strings are sprite keys.

Enemy attacks need **no** `isChip`. Player-side attacks set `isChip: true` so counters work.

## 3. Sprites (`src/render/sprites/`)

The screen is 240x160. Panels are 40x24 with their tops at `FIELD_Y = 74`. A body's feet are at
`floorPoint(col, row)` (`render/layout.js`), roughly the lower-middle of its panel.

Each pack file exports three registries:

```js
export const ENTITY_SPRITES = { rivet: { draw(ctx, e, x, y, t) {} } };   // (x, y) = feet point
export const SPELL_SPRITES  = { shockwave: { draw(ctx, s, x, y, t) {} } }; // (x, y) = floor point of s.x, s.y
export const FX_SPRITES     = { explosion: { duration: 18, draw(ctx, fx, x, y, age) {} } }; // (x, y) = floor point
```

- `t` is a global frame counter for idle loops; `e.animT` counts frames inside an animation; `age` counts
  frames since the effect started.
- **Draw facing right** and mirror when `e.facing < 0`. `sprite(...{ flip: e.facing < 0 })` does it.
- Bodies should fit in about 40 px wide and 48 px tall; bosses can be up to about 56 px tall.
- Use `render/pixel.js`:
  - `sprite(ctx, rows, palette, x, y, { flip, outline, anchor: 'feet', alpha })` draws pixel-string art,
    cached;
  - `rect`, `px`, `line`, `ellipse`, `disc`, `ring`, `poly` are pixel-exact primitives;
  - `shade(hex, amt)`, `mix(a, b, t)` and `recolor(palette, overrides)` give per-level palettes.
- **Pixel-string sprites are the house style for bodies:** a dark 1px outline (`outline: '#0c0f1c'`),
  3-4 shades per material, a light source from the top-left. Effects can use primitives.
- The renderer already does these, so don't:
  - the floor shadow;
  - the hit flash (white tint);
  - i-frame flicker;
  - hiding `hidden` bodies;
  - HP numbers;
  - deletion explosions — draw nothing extra for `anim === 'delete'`.
- **Levels:** viruses read `e.level` (1-3, 4 = Ω) to pick a palette.
  - Level 1 is the family's base colours, 2 and 3 are clear recolours, Ω is dark/purple with a glow.
  - Elemental variants should read as their element (fire red/orange, aqua blue, elec yellow, wood green).

### Viewing your work
```
node tools/serve.mjs <port> &        # pick your own port
node tools/shot.mjs "http://127.0.0.1:<port>/tools/sheet.html?entities=rivet&levels=1,2,3,4&anims=idle,move,windup,swing,hurt&scale=3" out.png 1400 900
```
Then **open the PNG and look at it**. `spells=`, `fx=`, `chips=1` work too.

## 4. Audio (`src/audio/`)

```js
import { audio } from './audio/index.js';
audio.unlock();          // on the first user gesture (creates/resumes the AudioContext)
audio.play('cannon');    // SFX by name; unknown names are ignored
audio.music('battle');   // 'title' | 'menu' | 'battle' | 'boss' | 'final' | 'victory' | 'gameover' | null
audio.setVolume({ master, sfx, music }); audio.setMuted(bool);
```
All sound is synthesized with WebAudio at runtime (no audio files).

## 5. File ownership

Content is built by parallel contributors. **Only edit files you own**; to need a change elsewhere, write
it in your final report.

| area | owner files |
|---|---|
| engine core | `src/engine/*.js`, `src/engine/chips/*`, `rivet.js plinker.js dartfin.js`, `enemies/index.js` |
| virus pack A | `src/engine/enemies/pack_a.js` + its family files `src/engine/enemies/a_*.js`, `src/render/sprites/viruses_a.js`, `tests/pack_a.test.js` |
| virus pack B | `src/engine/enemies/pack_b.js` + `src/engine/enemies/b_*.js`, `src/render/sprites/viruses_b.js`, `tests/pack_b.test.js` |
| boss pack A | `src/engine/enemies/bosses/bosses_a.js` + `bosses/a_*.js`, `src/render/sprites/bosses_a.js`, `tests/bosses_a.test.js` |
| boss pack B | `src/engine/enemies/bosses/bosses_b.js` + `bosses/b_*.js`, `src/render/sprites/bosses_b.js`, `tests/bosses_b.test.js` |
| core art | `src/render/sprites/core.js` (+ `core_*.js`), `src/render/chipart.js` |
| audio | `src/audio/*` |
| renderer, UI, game shell | everything else under `src/render/`, `src/game/`, `src/input/`, `src/main.js`, `index.html` |
