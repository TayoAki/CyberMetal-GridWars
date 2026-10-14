// Open-world browser check: load the page, let the demo pilot (or scripted keys) play, take screenshots and
// fail on any page error.   node tools/world_shots.mjs <url> <outDir> [seconds per shot...]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const [url, outDir, ...times] = process.argv.slice(2);
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
let i = 0;
for (const t of times.length ? times : ['3', '6', '6']) {
  await page.waitForTimeout(Number(t) * 1000);
  const s = await page.evaluate(() => {
    const w = window.__world.world;
    const p = w.player;
    return { t: w.t.toFixed(1), frame: w.frame, p: [p.x, p.y, p.z].map((v) => v.toFixed(1)), hp: p.hp, enemies: w.enemies.length, shots: w.stats.shots, kills: w.stats.kills, data: w.stats.data, zones: w.zones.map((z) => z.state[0]).join('') };
  });
  await page.screenshot({ path: join(outDir, `shot${++i}.png`) });
  console.log(`shot${i}`, JSON.stringify(s));
}
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
