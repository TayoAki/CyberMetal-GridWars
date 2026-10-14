// Screenshot a page with headless Chromium: node tools/shot.mjs <url> <out.png> [width] [height] [waitMs]
// The page may set window.__ready = true when it has finished drawing.
import { chromium } from 'playwright';

const [url, out, w = '960', h = '640', waitMs = '400'] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node tools/shot.mjs <url> <out.png> [width] [height] [waitMs]');
  process.exit(2);
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(Number(waitMs));
await page.screenshot({ path: out, fullPage: true });
await browser.close();
if (errors.length) {
  console.error('page errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`wrote ${out}`);
