import { dayDate, dailyRecipe } from './recipe.js';

// What GridWars Daily keeps in the browser: a random player id (the leaderboard's way of holding one place
// a day per player, never shown), the name, navi and folder picked, each day's best result, and settings.
// Everything works without it (private windows): it then lasts for the visit.

const KEY = 'gridwars-daily-v1';

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (d && typeof d === 'object') return d;
  } catch {
    /* blocked or broken: start over */
  }
  return {};
}

function randomId() {
  const a = new Uint8Array(12);
  (globalThis.crypto ?? { getRandomValues: (x) => x.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(a);
  return Array.from(a, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 20);
}

export const store = {
  data: load(),
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* full or blocked: keep it in memory */
    }
  },
  get pid() {
    if (!this.data.pid) {
      this.data.pid = randomId();
      this.save();
    }
    return this.data.pid;
  },
  get name() {
    return this.data.name ?? '';
  },
  set name(v) {
    this.data.name = v;
    this.save();
  },
  setting(k, v) {
    if (v === undefined) return this.data[k];
    this.data[k] = v;
    this.save();
    return v;
  },
  result(day) {
    return this.data.results?.[day] ?? null;
  },
  // Keep a day's result: a win replaces a loss, a faster win a slower one. Returns whether it is a new best.
  record(day, r) {
    const all = (this.data.results ??= {});
    const old = all[day];
    const better = !old || (r.won && (!old.won || r.seconds < old.seconds));
    all[day] = better ? { ...r, tries: (old?.tries ?? 0) + 1 } : { ...old, tries: (old.tries ?? 0) + 1 };
    if (better && r.won && r.id) all[day].id = r.id;
    this.save();
    return better;
  },
  setRunId(day, id) {
    const r = this.data.results?.[day];
    if (r) {
      r.id = id;
      this.save();
    }
  },
  // Days in a row cleared, counting back from today (or from yesterday while today is still open).
  streak(today) {
    let d = this.result(today)?.won ? today : today - 1;
    let n = 0;
    while (d >= 1 && this.result(d)?.won) {
      n++;
      d--;
    }
    return n;
  },
  // The week around `today`, Monday first: [{ day, tier, done, today }].
  week(today) {
    const wd = new Date(dayDate(today)).getUTCDay(); // 0 Sunday
    const monday = today - ((wd + 6) % 7);
    const out = [];
    for (let d = monday; d < monday + 7; d++) {
      out.push({ day: d, tier: d >= 1 ? dailyRecipe(d).tierName : '-', done: !!this.result(d)?.won, today: d === today, future: d > today });
    }
    return out;
  },
};
