import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createApp } from '../server.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const app = await createApp({ delayMs: 20000 });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, recordVideo: { dir: 'docs/recordings', size: { width: 1440, height: 1080 } } });
const page = await context.newPage();
const started = performance.now(), chapters = [], errors = [];
page.on('pageerror', e => errors.push(e.message));
const stamp = ms => new Date(ms).toISOString().slice(14, 19);
async function label(text) {
  chapters.push(`${stamp(performance.now() - started)} — ${text}`);
  await page.evaluate(text => {
    let el = document.getElementById('demo-label');
    if (!el) { el = document.createElement('div'); el.id = 'demo-label'; document.body.append(el); }
    el.style.cssText = 'position:fixed;top:0;left:230px;right:0;z-index:9999;background:#123e34;color:white;padding:15px 30px;font:600 18px Segoe UI;box-shadow:0 2px 15px #0002';
    el.textContent = text;
  }, text);
}
async function focus(selector) {
  await page.locator(selector).evaluate(el => {
    document.querySelectorAll('[data-demo-focus]').forEach(x => { x.style.outline = ''; x.removeAttribute('data-demo-focus'); });
    el.dataset.demoFocus = 'true'; el.style.outline = '3px solid #d59b36'; el.style.outlineOffset = '5px';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(700);
}
const pause = ms => page.waitForTimeout(ms);
try {
  await page.goto(`http://127.0.0.1:${app.server.address().port}`);
  await page.waitForFunction(() => document.getElementById('count').textContent === '3,000');
  await label('1. Saved dashboard — 3,000 records ready immediately');
  await focus('.metrics'); await pause(3000);
  await label('2. Search by symbol — typing RELIANCE');
  await focus('#search');
  await page.getByRole('searchbox').pressSequentially('RELIANCE', { delay: 220 });
  assert.equal(await page.locator('#ledger-count').textContent(), '500');
  await pause(2500);
  await label('3. Browse matching trades — next page, then previous page');
  await focus('footer');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  assert.equal(await page.locator('#page').textContent(), '2'); await pause(2000);
  await page.getByRole('button', { name: 'Previous page', exact: true }).click(); await pause(1500);
  await label('4. Search by client — CL-1001'); await focus('#search');
  await page.getByRole('searchbox').fill('');
  await page.getByRole('searchbox').pressSequentially('CL-1001', { delay: 160 }); await pause(2200);
  await label('5. Empty search — clear feedback when no records match');
  await page.getByRole('searchbox').fill('UNKNOWN');
  assert.ok(await page.locator('.empty-state').isVisible()); await pause(2200);
  await page.getByRole('searchbox').fill('');
  await label('6. Start a background pull — 20-second demo, 15-minute default');
  await focus('#pull'); await pause(1500);
  const accepted = page.waitForResponse(r => r.url().endsWith('/api/pulls'));
  await page.getByRole('button', { name: /Pull latest/ }).click();
  assert.equal((await accepted).status(), 202);
  await focus('.sync-panel'); await pause(3000);
  await label('7. Existing trades remain usable while synchronization runs');
  await focus('#search');
  await page.getByRole('searchbox').pressSequentially('TCS', { delay: 250 }); await pause(2000);
  assert.equal(await page.locator('#count').textContent(), '3,000');
  await focus('footer'); await page.getByRole('button', { name: 'Next page', exact: true }).click(); await pause(2000);
  await page.getByRole('searchbox').fill('');
  await label('8. Watch live progress — no page refresh or data polling');
  await focus('.sync-panel');
  await page.waitForFunction(() => document.getElementById('count').textContent === '6,000', null, { timeout: 30000 });
  await label('9. Automatic completion — the count changes to 6,000');
  await focus('.metrics'); await pause(3500);
  await label('10. Inspect the newly imported batch in the trade ledger');
  await focus('.ledger'); await pause(3500);
  await label('11. Reload AFTER completion to verify saved records remain'); await pause(2000);
  await page.reload();
  await page.waitForFunction(() => document.getElementById('count').textContent === '6,000');
  await label('12. Still 6,000 saved trades — completion already happened without a refresh');
  await focus('.metrics'); await pause(3500);
  assert.deepEqual(errors, []);
  writeFileSync('docs/features-timestamps.md', '# Live feature walkthrough\n\nThe video records real interactions with the running application. Gold outlines guide attention; no trade counts or job states are simulated by the recording script. Demo ingestion uses 20 seconds; the default remains 15 minutes. The reload is deliberately shown only after automatic completion to demonstrate retained records.\n\n' + chapters.map(x => '- ' + x).join('\n') + '\n\nVideo has on-screen captions and no voice audio.\n');
  await page.close(); await context.close();
  await page.video().saveAs('docs/features-walkthrough.webm'); await page.video().delete();
  console.log('Recorded live features and verified search, pagination, 202 response, background usability, automatic completion, and reload persistence.');
} finally { await browser.close(); await app.close(); }
