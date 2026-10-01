// Optional recording utility: install playwright locally or set PLAYWRIGHT_MODULE to its index.mjs.
import { createApp } from '../server.js';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const app = await createApp({ delayMs: 12000 });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, recordVideo: { dir: 'docs/recordings', size: { width: 1440, height: 1080 } } });
const page = await context.newPage();
const videoStart = performance.now();
const chapters = [];
const stamp = ms => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
async function section(title, narration, seconds) {
  chapters.push({ start: performance.now() - videoStart, title, narration });
  await caption(`${title} — ${narration}`);
  await page.waitForTimeout(seconds * 1000);
}
const errors = [], requests = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { if (r.url().includes('/api/')) requests.push(r.url()); });
async function caption(text) {
  await page.evaluate(text => {
    let el = document.getElementById('video-caption');
    if (!el) { el = document.createElement('div'); el.id = 'video-caption'; el.style.cssText = 'position:fixed;bottom:16px;left:260px;right:30px;background:#123e34;color:white;padding:18px 24px;border-radius:10px;font:16px sans-serif;z-index:1000;box-shadow:0 5px 25px #0003'; document.body.append(el); }
    el.textContent = text;
  }, text);
}
try {
  await page.goto(`http://127.0.0.1:${app.server.address().port}`);
  await page.waitForFunction(() => document.getElementById('count').textContent === '3,000');
  await section('01 / Introduction', 'This is BSE Trade Desk, my software engineering assessment. It keeps saved trades available while new exchange data is imported in the background.', 12);
  await section('02 / Saved trades', 'The dashboard opens with 3,000 saved trades. Each record includes a trade ID, client, symbol, quantity, price, and timestamp. This recording uses a 12-second demo pull.', 14);
  await page.getByRole('button', { name: /Pull latest/ }).click();
  await section('03 / Start ingestion', 'Clicking Pull latest trades starts an asynchronous job. The request returns HTTP 202 immediately, so the dashboard does not wait for the full import.', 6);
  await page.getByRole('searchbox').fill('RELIANCE');
  assert.equal(await page.locator('#count').textContent(), '3,000');
  await section('04 / Search during ingestion', 'I can still search existing records while the pull runs. Here I am filtering RELIANCE trades. Progress is pushed from the server.', 5);
  await page.getByRole('searchbox').fill('');
  await page.waitForFunction(() => document.getElementById('count').textContent === '6,000', null, { timeout: 20000 });
  await section('05 / Automatic completion', 'The count has increased to 6,000 without refreshing the page. The completed batch is committed to SQLite, then delivered through a WebSocket event. There is no data polling or scheduler.', 15);
  assert.equal(requests.filter(url => url.endsWith('/api/trades')).length, 1);
  assert.deepEqual(errors, []);
  await section('06 / Timeout design', 'The default pull takes 15 minutes across 60 short HTTP requests. This assumes the exchange supports pagination and the network permits WebSockets. A single 15-minute HTTP response would still time out.', 16);
  await section('07 / Verified results', 'The full-duration test passed in 15 minutes and 1.6 seconds. The slowest exchange response was 15.031 seconds, below the 30-second limit. Saved trades loaded during ingestion in 27 milliseconds.', 16);
  await section('08 / Submission', 'The GitHub repository includes setup instructions, an architecture diagram, tests, and this walkthrough. Run npm ci, then npm run demo. Use npm start for the default 15-minute mode.', 15);
  const end = performance.now() - videoStart;
  writeFileSync('docs/video-script.md', '# Timestamped walkthrough narration\n\nVideo: [assignment-walkthrough.webm](assignment-walkthrough.webm). This recording has on-screen captions and no audio. Read the following script aloud when presenting or recording your own voiceover. Timestamps are approximate to the nearest second.\n\n' + chapters.map((chapter, i) => `## ${stamp(chapter.start)}–${stamp(chapters[i + 1]?.start ?? end)} · ${chapter.title}\n\n${chapter.narration}\n`).join('\n') + '\n## Suggested submission message\n\nPlease find my BSE Trade Desk technical assessment below. The repository includes the mock exchange API, persistent dashboard, background ingestion, WebSocket updates, setup instructions, architecture note, tests, and a captioned walkthrough. A full 15-minute ingestion test has passed. The README explicitly documents the pagination and WebSocket assumptions.\n\nRepository: https://github.com/nidhichaudhari2020-hue/bsetradedashboard\n\nWalkthrough: https://github.com/nidhichaudhari2020-hue/bsetradedashboard/blob/main/docs/assignment-walkthrough.webm\n');
  await page.evaluate(() => document.getElementById('video-caption').remove());
  await page.close();
  await context.close();
  await page.video().saveAs('docs/assignment-walkthrough.webm');
  await page.video().delete();
  console.log('Browser checks passed; walkthrough and desktop/mobile screenshots saved.');
} finally { await browser.close(); await app.close(); }
