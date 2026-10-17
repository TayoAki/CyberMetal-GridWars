// GridWars Daily's leaderboard client (the API is tools/daily-api.mjs). Every call resolves, never throws:
// offline (a file:// page, an Artifact, no network) it resolves to null and the game plays on locally.

const ONLINE = typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && !/claude\.ai|claudeusercontent/.test(location.host);

async function call(path, opts = {}) {
  if (!ONLINE) return null;
  try {
    const res = await fetch(new URL(path, location.origin), { headers: { 'content-type': 'application/json' }, ...opts });
    const body = await res.json().catch(() => null);
    return body ? { status: res.status, ...body } : null;
  } catch {
    return null;
  }
}

export const net = {
  online: ONLINE,
  board: (day, pid) => call(`/api/daily/${day}/board?pid=${encodeURIComponent(pid)}`),
  submit: (day, payload) => call(`/api/daily/${day}/runs`, { method: 'POST', body: JSON.stringify(payload) }),
  run: (id) => call(`/api/runs/${encodeURIComponent(id)}`),
};
