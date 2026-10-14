// End-to-end smoke run through the real UI with headless Chromium:
//   node tools/smoke.mjs <url> <outDir>
// Title -> menu -> Gauntlet -> battle (driven by the autopilot) -> results -> back on the map.
// Fails on any page error. Screenshots every step so they can be looked at.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const [url, outDir] = process.argv.slice(2);
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = async (name) => { await page.locator('#screen').screenshot({ path: `${outDir}/${name}.png` }); console.log('shot', name); };
const key = async (k, ms = 80) => { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); await page.waitForTimeout(120); };
const sceneName = () => page.evaluate(() => window.__game.scene?.constructor?.name);

await page.goto(url);
await page.waitForFunction(() => window.__ready === true);
await page.evaluate(() => localStorage.clear());
await page.waitForTimeout(1200);
await shot('01-title');
await key('Enter');
await page.waitForTimeout(300);
await shot('02-menu');
await key('KeyX'); // START GAUNTLET
await page.waitForTimeout(700);
console.log('scene:', await sceneName());
await shot('03-gauntlet');
await key('KeyX'); // NEXT BATTLE
await page.waitForTimeout(1400);
console.log('scene:', await sceneName());
await shot('04-custom');
await page.evaluate(() => { window.__game.scene.autopilot = window.__autopilot(); });
await page.waitForTimeout(2500);
await shot('05-fight');
await page.waitForFunction(() => window.__game.scene?.battle?.done === true, null, { timeout: 120000 });
await page.waitForTimeout(1500);
await shot('06-results');
const result = await page.evaluate(() => window.__game.scene.battle.result);
console.log('result:', JSON.stringify(result));
await page.waitForTimeout(1500);
await page.waitForFunction(() => window.__game.scene?.constructor?.name === 'GauntletScene', null, { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(800);
await shot('07-after');
console.log('scene:', await sceneName(), 'progress:', JSON.stringify(await page.evaluate(() => window.__game.save.data.progress)));
await browser.close();
if (errors.length) { console.error('PAGE ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('smoke OK');
