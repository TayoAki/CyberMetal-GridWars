// Drive the game with a scripted key sequence and take screenshots: node tools/shoot_seq.mjs <url> <outPrefix> <steps-json>
// steps: [["wait", ms] | ["key", "KeyX", holdMs] | ["shot", "name"] | ["eval", "js"]]
import { chromium } from 'playwright';
const [url, prefix, stepsJson] = process.argv.slice(2);
const steps = JSON.parse(stepsJson);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
for (const [op, a, b] of steps) {
  if (op === 'wait') await page.waitForTimeout(a);
  else if (op === 'key') { await page.keyboard.down(a); await page.waitForTimeout(b ?? 60); await page.keyboard.up(a); }
  else if (op === 'shot') { await page.locator('#screen').screenshot({ path: `${prefix}-${a}.png` }); console.log(`shot ${prefix}-${a}.png`); }
  else if (op === 'eval') console.log(JSON.stringify(await page.evaluate(a)));
}
await browser.close();
if (errors.length) { console.error('page errors:\n' + errors.join('\n')); process.exit(1); }
