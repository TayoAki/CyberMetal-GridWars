// Seeded deterministic RNG (mulberry32). The whole battle must replay identically from a seed and an input
// log, so nothing in the engine may call Math.random().

export class Rng {
  constructor(seed = 1) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(n) {
    return Math.floor(this.next() * n);
  }

  range(lo, hi) {
    return lo + this.int(hi - lo + 1);
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[this.int(arr.length)];
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
