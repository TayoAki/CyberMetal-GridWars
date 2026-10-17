import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dailyApi, cleanName, serverDay } from '../tools/daily-api.mjs';
import { LAUNCH } from '../src/daily/recipe.js';
import { suggestedFolder } from '../src/daily/fight.js';
import { recordFight } from './daily_helpers.js';

// GridWars Daily's leaderboard (tools/daily-api.mjs): it replays every run it is sent and keeps only what
// the replay shows.

const DAY = 86400000;
const at = (day, h = 12) => LAUNCH + (day - 1) * DAY + h * 3600000; // a moment on that UTC day

async function withApi(day, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'gw-daily-'));
  try {
    let t = at(day);
    const api = await dailyApi({ dir, now: () => t });
    await fn(api, dir, (ms) => (t += ms));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const win = (d, late = 0) => {
  const { r, run, live } = recordFight(d, { folder: undefined, late });
  run.folder = suggestedFolder(r);
  return { r, run, live };
};

test('a winning run is replayed, ranked and kept; the times are the replay\'s, not the client\'s', async () => {
  const d = 3;
  const a = win(d);
  const b = win(d, 6);
  assert.ok(a.live.won && b.live.won, 'both runs win');
  await withApi(d, async (api) => {
    const r1 = await api.submit(d, { pid: 'player-one-0001', name: 'axiom', folder: a.run.folder, run: { ...a.run, claimed: 1 } });
    assert.equal(r1[0], 200);
    assert.ok(r1[1].ok, JSON.stringify(r1[1]));
    assert.equal(r1[1].entry.name, 'AXIOM');
    assert.equal(r1[1].entry.seconds, Math.round(a.live.seconds * 100) / 100);
    assert.equal(r1[1].entry.busting, a.live.busting);
    assert.equal(r1[1].rank, 1);
    const r2 = await api.submit(d, { pid: 'player-two-0002', name: 'Lan', folder: b.run.folder, run: b.run });
    assert.ok(r2[1].ok);
    const board = api.standings(d, 'player-two-0002');
    assert.equal(board.count, 2);
    const order = [a, b].sort((x, y) => x.live.fightFrames - y.live.fightFrames).map((x) => (x === a ? 'AXIOM' : 'LAN'));
    assert.deepEqual(board.top.map((e) => e.name), order);
    assert.equal(board.you.name, 'LAN');
    assert.equal(board.top[0].rank, 1);
    assert.ok(!('pid' in board.top[0]), 'player ids stay private');
    // The run can be fetched to watch or to race.
    const got = await api.runById(r1[1].id);
    assert.equal(got.entry.name, 'AXIOM');
    assert.equal(got.run.pads, a.run.pads);
  });
});

test('one place a day per player: a slower run doesn\'t replace a faster one', async () => {
  const d = 4;
  const fast = win(d);
  const slow = win(d, 8);
  const [first, second] = fast.live.fightFrames <= slow.live.fightFrames ? [fast, slow] : [slow, fast];
  await withApi(d, async (api) => {
    const pid = 'same-player-1234';
    const r1 = await api.submit(d, { pid, name: 'AXIOM', folder: first.run.folder, run: first.run });
    const r2 = await api.submit(d, { pid, name: 'AXIOM', folder: second.run.folder, run: second.run });
    assert.ok(r1[1].best);
    assert.equal(r2[1].best, false);
    const board = api.standings(d, pid);
    assert.equal(board.count, 1);
    assert.equal(board.you.seconds, r1[1].entry.seconds);
  });
});

test('a loss, a doctored run, a closed day, a bad name and an old version are all refused', async () => {
  const d = 9; // Ω: a late autopilot loses it
  const lost = recordFight(d, { late: 15 });
  await withApi(d, async (api) => {
    const folder = suggestedFolder(lost.r);
    if (!lost.live.won) {
      const r = await api.submit(d, { pid: 'loser-12345678', name: 'AXIOM', folder, run: lost.run });
      assert.equal(r[1].ok, false);
      assert.match(r[1].error, /does not win/);
    }
    const good = win(3).run;
    // A winning run sent for another day replays against that day's boss and fails there.
    const wrong = await api.submit(d, { pid: 'cheater-1234567', name: 'AXIOM', folder: good.folder, run: good });
    assert.equal(wrong[1].ok, false);
    const closed = await api.submit(d - 3, { pid: 'late-player-123', name: 'AXIOM', folder: good.folder, run: good });
    assert.equal(closed[0], 400);
    for (const name of ['x', '', 'FUCKER', 'shit head', 'r4pe']) {
      const r = await api.submit(d, { pid: 'name-test-12345', name, folder, run: good });
      assert.equal(r[0], 400, `name ${name}`);
    }
    const old = await api.submit(d, { pid: 'old-version-123', name: 'AXIOM', folder, run: { ...good, v: 0 } });
    assert.equal(old[0], 409);
    assert.match(old[1].error, /reload/);
    const junk = await api.submit(d, { pid: 'junk-run-123456', name: 'AXIOM', folder, run: { ...good, pads: '!!!' } });
    assert.equal(junk[0], 400);
    assert.equal(api.standings(d).count, 0);
  });
});

test('a run from a page built from other engine code is sent back to reload, not misjudged', async () => {
  const d = 3;
  const { run } = win(d);
  const dir = await mkdtemp(join(tmpdir(), 'gw-daily-'));
  try {
    const strict = await dailyApi({ dir, now: () => at(d), engine: 'abc123' });
    const stale = await strict.submit(d, { pid: 'stale-page-1234', name: 'AXIOM', folder: run.folder, run });
    assert.equal(stale[0], 409);
    assert.match(stale[1].error, /updated/);
    const fresh = await strict.submit(d, { pid: 'fresh-page-1234', name: 'AXIOM', folder: run.folder, run: { ...run, engine: 'abc123' } });
    assert.ok(fresh[1].ok);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the board survives a restart: every accepted run is re-read from disk', async () => {
  const d = 3;
  const a = win(d);
  const dir = await mkdtemp(join(tmpdir(), 'gw-daily-'));
  try {
    const api = await dailyApi({ dir, now: () => at(d) });
    const r = await api.submit(d, { pid: 'restart-test-01', name: 'MEGA', folder: a.run.folder, run: a.run });
    assert.ok(r[1].ok);
    const again = await dailyApi({ dir, now: () => at(d) });
    assert.equal(again.standings(d).count, 1);
    assert.equal(again.standings(d).top[0].name, 'MEGA');
    assert.equal((await again.runById(r[1].id)).run.pads, a.run.pads);
    const lines = (await readFile(join(dir, 'daily', `${d}.jsonl`), 'utf8')).trim().split('\n');
    assert.equal(lines.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('names: shown upper-case, 2-12 characters; innocent words that contain short bad ones are fine', () => {
  assert.equal(cleanName('  lan   hikari '), 'LAN HIKARI');
  assert.equal(cleanName('Mega_Man.EXE!!'), 'MEGA_MAN.EXE');
  assert.equal(cleanName('a'), null);
  for (const ok of ['GRAPEJUICE', 'COCKPIT', 'ESSEX', 'SPICY', 'DICKENS', 'TITAN']) assert.equal(cleanName(ok), ok);
  for (const bad of ['FUCKY', 'NAZI99', 'SH1T', 'RAPE', 'TITS']) assert.equal(cleanName(bad), null, bad);
  assert.equal(serverDay(LAUNCH), 1);
  assert.equal(serverDay(LAUNCH + DAY - 1), 1);
  assert.equal(serverDay(LAUNCH + DAY), 2);
});
