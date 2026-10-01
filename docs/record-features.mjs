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
  const elapsed = performance.now() - started;
  const chapterTime = stamp(elapsed);
  chapters.push(`${chapterTime} — ${text}`);
  await page.evaluate(text => {
    let el = document.getElementById('demo-label');
    if (!el) { el = document.createElement('div'); el.id = 'demo-label'; document.body.append(el); }
    document.body.style.paddingBottom = '100px';
    el.style.cssText = 'position:fixed;bottom:0;left:230px;right:0;z-index:9999;background:#ffffff;color:#253e34;padding:22px 36px;font:400 19px/1.55 Segoe UI;border-top:1px solid #dce5df;min-height:94px';
    el.textContent = text;
  }, text);
}
async function focus(selector) {
  await page.locator(selector).evaluate(el => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(700);
}
const pause = ms => page.waitForTimeout(ms);
try {
  await page.goto(`http://127.0.0.1:${app.server.address().port}`);
  await page.waitForFunction(() => document.getElementById('count').textContent === '3,000');
  await label('Here are the 3,000 trades already saved in the dashboard. I can view them as soon as the page opens.');
  await focus('.metrics'); await pause(3000);
  await label('I can search by symbol. Typing RELIANCE narrows the ledger to its matching trades.');
  await focus('#search');
  await page.getByRole('searchbox').pressSequentially('RELIANCE', { delay: 220 });
  assert.equal(await page.locator('#ledger-count').textContent(), '500');
  await pause(2500);
  await label('The results are split into pages. I can move forward and back while keeping the search applied.');
  await focus('footer');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  assert.equal(await page.locator('#page').textContent(), '2'); await pause(2000);
  await page.getByRole('button', { name: 'Previous page', exact: true }).click(); await pause(1500);
  await label('The same search also works with a client ID. Here are the records for CL-1001.'); await focus('#search');
  await page.getByRole('searchbox').fill('');
  await page.getByRole('searchbox').pressSequentially('CL-1001', { delay: 160 }); await pause(2200);
  await label('When there are no matches, the ledger shows a clear message. Clearing the search brings the trades back.');
  await page.getByRole('searchbox').fill('UNKNOWN');
  assert.ok(await page.locator('.empty-state').isVisible()); await pause(2200);
  await page.getByRole('searchbox').fill('');
  await label('I will start a new pull. This demonstration uses 20 seconds; the default full pull takes 15 minutes.');
  await focus('#pull'); await pause(1500);
  const accepted = page.waitForResponse(r => r.url().endsWith('/api/pulls'));
  await page.getByRole('button', { name: /Pull latest/ }).click();
  assert.equal((await accepted).status(), 202);
  await focus('.sync-panel'); await pause(3000);
  await label('While the pull runs, I can still search and browse the saved trades. The dashboard stays usable.');
  await focus('#search');
  await page.getByRole('searchbox').pressSequentially('TCS', { delay: 250 }); await pause(2000);
  assert.equal(await page.locator('#count').textContent(), '3,000');
  await focus('footer'); await page.getByRole('button', { name: 'Next page', exact: true }).click(); await pause(2000);
  await page.getByRole('searchbox').fill('');
  await label('The progress updates arrive from the server. I will leave the page open and wait for the new batch.');
  await focus('.sync-panel');
  await page.waitForFunction(() => document.getElementById('count').textContent === '6,000', null, { timeout: 30000 });
  await label('The count has changed to 6,000 automatically. I have not refreshed the page.');
  await focus('.metrics'); await pause(3500);
  await label('The newly imported records are now in the ledger, alongside the previously saved trades.');
  await focus('.ledger'); await pause(3500);
  await label('Now that the pull is complete, I will reload the page to check that the records are retained.'); await pause(2000);
  await page.reload();
  await page.waitForFunction(() => document.getElementById('count').textContent === '6,000');
  await label('All 6,000 trades are still available after reloading. The completed batch has been saved.');
  await focus('.metrics'); await pause(3500);
  assert.deepEqual(errors, []);
  writeFileSync('docs/features-timestamps.md', '# Live feature walkthrough\n\nThe video records real interactions with the running application. A plain narration strip appears at the bottom of the page, with no visible timer or highlight effects. No trade counts or job states are simulated by the recording script. Demo ingestion uses 20 seconds; the default remains 15 minutes. The reload is deliberately shown only after automatic completion to demonstrate retained records.\n\n' + chapters.map(x => '- ' + x).join('\n') + '\n\nVideo has on-screen captions and no voice audio.\n');
  await page.close(); await context.close();
  await page.video().saveAs('docs/features-walkthrough.webm'); await page.video().delete();
  console.log('Recorded live features and verified search, pagination, 202 response, background usability, automatic completion, and reload persistence.');
} finally { await browser.close(); await app.close(); }

