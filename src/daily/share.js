import { clock } from './hud.js';

// GridWars Daily's share loop: a Wordle-style text (the boss, your time and Busting Level, and a strip of
// emoji that tells how the fight went without spoiling it), a 1200x630 result card with the boss on it
// (the size link previews use), and the links: a challenge (?vs=run: your friend races your time, your pace
// shown as they fight) and a replay (?r=run: they watch your run as it was played).

export const EL_EMOJI = { elec: '⚡', fire: '🔥', aqua: '💧', wood: '🌿', null: '⚫' };

// The fight in eight beats: how much HP each eighth of it cost you.
export function timeline(hpTrace, maxHp) {
  if (!hpTrace.length) return '';
  const n = 8;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = hpTrace[Math.floor((i * (hpTrace.length - 1)) / n)];
    const b = hpTrace[Math.floor(((i + 1) * (hpTrace.length - 1)) / n)];
    const lost = (a - b) / maxHp;
    out.push(lost <= 0 ? '🟩' : lost < 0.08 ? '🟨' : lost < 0.2 ? '🟧' : '🟥');
  }
  return out.join('');
}

export function shareText({ recipe, outcome, strip, streak, link, rival }) {
  const head = `GridWars Daily #${recipe.day} ${EL_EMOJI[recipe.element] ?? ''} ${recipe.name} ${recipe.tierName}`;
  if (!outcome.won) {
    const left = Math.round((100 * outcome.bossHp) / Math.max(1, outcome.bossMaxHp));
    return [head, `${strip}`, `💀 Deleted with ${recipe.name} at ${left}% HP`, 'Can you finish it?', link].filter(Boolean).join('\n');
  }
  const lines = [
    head,
    `${strip} ${clock(outcome.fightFrames)} · Busting ${outcome.busting}`,
    `❤️ ${Math.round((100 * outcome.hp) / outcome.maxHp)}% HP${outcome.counters ? ` · ⭐ ${outcome.counters} counter${outcome.counters > 1 ? 's' : ''}` : ''}${streak > 1 ? ` · 🔥 ${streak}-day streak` : ''}`,
  ];
  if (rival) lines.push(rival.seconds > outcome.seconds ? `⚔️ Beat ${rival.name} by ${(rival.seconds - outcome.seconds).toFixed(2)} s` : `⚔️ ${rival.name} still leads by ${(outcome.seconds - rival.seconds).toFixed(2)} s`);
  lines.push(link);
  return lines.filter(Boolean).join('\n');
}

export function links(id) {
  const base = `${location.origin}/daily`;
  return { challenge: id ? `${base}?vs=${id}` : base, replay: id ? `${base}?r=${id}` : base, home: base };
}

// The result card: the arena snapshot with the result over it.
export async function resultCard({ snapshot, recipe, outcome, name, rank }) {
  const W = 1200;
  const H = 630;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#070a1a';
  g.fillRect(0, 0, W, H);
  if (snapshot) {
    // Cover-fit the snapshot.
    const k = Math.max(W / snapshot.width, H / snapshot.height);
    g.drawImage(snapshot, (W - snapshot.width * k) / 2, (H - snapshot.height * k) / 2, snapshot.width * k, snapshot.height * k);
  }
  const shade = g.createLinearGradient(0, 0, W, 0);
  shade.addColorStop(0, 'rgba(7,10,26,0.94)');
  shade.addColorStop(0.55, 'rgba(7,10,26,0.55)');
  shade.addColorStop(1, 'rgba(7,10,26,0.1)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  await document.fonts?.ready;
  const head = "'Russo One', 'Arial Black', sans-serif";
  const body = "'Chakra Petch', system-ui, sans-serif";
  g.fillStyle = '#ff3d63';
  g.font = `52px ${head}`;
  g.fillText('GRID', 60, 100);
  const w = g.measureText('GRID').width;
  g.fillStyle = '#ffffff';
  g.fillText('WARS', 60 + w, 100);
  g.fillStyle = '#6ae8ff';
  g.fillText(' DAILY', 60 + w + g.measureText('WARS').width, 100);
  g.fillStyle = '#8fa0cc';
  g.font = `600 30px ${body}`;
  g.fillText(`#${recipe.day} · ${recipe.date}`, 60, 146);
  g.fillStyle = '#ffffff';
  g.font = `70px ${head}`;
  g.fillText(`${recipe.name.toUpperCase()} ${recipe.tierName}`, 60, 250, W - 120);
  g.fillStyle = '#c8d4ff';
  g.font = `600 30px ${body}`;
  g.fillText(recipe.title, 60, 294);
  if (outcome.won) {
    g.fillStyle = '#ffd84a';
    g.font = `120px ${head}`;
    g.fillText(clock(outcome.fightFrames), 60, 450);
    g.font = `600 34px ${body}`;
    g.fillStyle = '#ffffff';
    g.fillText(`${name} · Busting ${outcome.busting} · ${Math.round((100 * outcome.hp) / outcome.maxHp)}% HP${rank ? ` · #${rank}` : ''}`, 60, 510);
  } else {
    g.fillStyle = '#ff6a7a';
    g.font = `92px ${head}`;
    g.fillText('DELETED…', 60, 440);
    g.font = `600 34px ${body}`;
    g.fillStyle = '#ffffff';
    g.fillText(`${recipe.name} had ${Math.round((100 * outcome.bossHp) / Math.max(1, outcome.bossMaxHp))}% HP left. Your turn?`, 60, 500);
  }
  g.fillStyle = '#8fa0cc';
  g.font = `600 28px ${body}`;
  g.fillText('A new boss every day · play in your browser', 60, 580);
  return new Promise((resolve) => c.toBlob((blob) => resolve(blob), 'image/png'));
}

// Share text (and a card, where the device can) with the system sheet, else copy the text.
export async function share({ text, url, file }) {
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return 'shared';
    }
    if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
      await navigator.share({ text, url });
      return 'shared';
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancelled';
  }
  return (await copy(text)) ? 'copied' : 'failed';
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    document.body.append(t);
    t.select();
    const ok = document.execCommand?.('copy');
    t.remove();
    return !!ok;
  }
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
