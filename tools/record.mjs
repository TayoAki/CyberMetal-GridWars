// Record a showcase clip of real gameplay (autopilot) with headless Chromium, then cut it with ffmpeg.
//   node tools/record.mjs <baseUrl> <outDir>
// Produces <outDir>/showcase.mp4 (H.264) and <outDir>/showcase.gif (smaller, for READMEs).
import { chromium } from 'playwright';
import { mkdir, readdir, rename } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const [base, outDir] = process.argv.slice(2);
await mkdir(outDir, { recursive: true });
const W = 720;
const H = 480;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: outDir, size: { width: W, height: H } } });
const page = await context.newPage();
const clips = [
  // [query, seconds]
  ['?battle=boot2&auto=1&seed=4', 9],
  ['?battle=therm1&auto=1&seed=8', 8],
  ['?battle=boss_volt&auto=1&seed=21', 9],
  ['?battle=boss_zero&auto=1&seed=22', 9],
];
// Fit the canvas to the recording frame.
const css = '#hint{display:none!important} body{padding:0!important} #screen{width:720px!important;height:480px!important;box-shadow:none!important}';
for (const [q, secs] of clips) {
  await page.goto(base + q);
  await page.addStyleTag({ content: css });
  await page.waitForFunction(() => window.__ready === true);
  await page.waitForTimeout(secs * 1000);
}
await page.close();
await context.close();
await browser.close();
const files = (await readdir(outDir)).filter((f) => f.endsWith('.webm'));
const raw = join(outDir, 'raw.webm');
await rename(join(outDir, files[0]), raw);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', 'scale=720:480:flags=neighbor', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', join(outDir, 'showcase.mp4')]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', 'fps=20,scale=480:320:flags=neighbor,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=none', join(outDir, 'showcase.gif')]);
console.log('wrote', join(outDir, 'showcase.mp4'), 'and showcase.gif');
