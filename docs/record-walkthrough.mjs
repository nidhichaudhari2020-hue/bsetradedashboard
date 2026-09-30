// Optional recording utility: install playwright locally or set PLAYWRIGHT_MODULE to its index.mjs.
import { createApp } from '../server.js';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const app = await createApp({ delayMs: 12000 });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, recordVideo: { dir: 'docs/recordings', size: { width: 1440, height: 1080 } } });
const page = await context.newPage();
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
  await caption('BSE Trade Desk · 3,000 saved trades appear immediately. This walkthrough uses a 12-second pull.');
  await page.waitForTimeout(3500);
  await page.getByRole('button', { name: /Pull latest/ }).click();
  await caption('The pull returns HTTP 202 immediately. Short exchange requests run in the background.');
  await page.waitForTimeout(2500);
  await page.getByRole('searchbox').fill('RELIANCE');
  await caption('The ledger remains usable during ingestion. Filter by symbol, client or trade ID.');
  await page.waitForTimeout(3000);
  assert.equal(await page.locator('#count').textContent(), '3,000');
  await page.getByRole('searchbox').fill('');
  await caption('60 cursor pages → one SQLite transaction → a WebSocket completion event. No polling or refresh.');
  await page.waitForFunction(() => document.getElementById('count').textContent === '6,000', { timeout: 20000 });
  await caption('6,000 trades, automatically. The committed batch is pushed to this already-open dashboard.');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'docs/dashboard.png', fullPage: true });
  assert.equal(requests.filter(url => url.endsWith('/api/trades')).length, 1);
  assert.deepEqual(errors, []);
  await caption('Default mode takes 15 minutes total. Pagination keeps HTTP requests below 30 seconds; WebSocket support is required.');
  await page.waitForTimeout(4500);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.getElementById('video-caption').remove());
  await page.screenshot({ path: 'docs/mobile.png', fullPage: true });
  assert.ok(await page.getByRole('searchbox').isVisible());
  await page.close();
  await context.close();
  await page.video().saveAs('docs/walkthrough.webm');
  await page.video().delete();
  console.log('Browser checks passed; walkthrough and desktop/mobile screenshots saved.');
} finally { await browser.close(); await app.close(); }
