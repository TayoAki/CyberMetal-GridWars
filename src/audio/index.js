// PLACEHOLDER (no-op) audio module so the game runs before the real synth lands. API per docs/CONTRACT.md §4.
export const audio = {
  unlock() {},
  play() {},
  music() {},
  setVolume() {},
  setMuted() {},
  get muted() {
    return false;
  },
  renderOffline() {
    return Promise.resolve(null);
  },
};
