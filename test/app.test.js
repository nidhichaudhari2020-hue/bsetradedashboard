import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createApp } from '../server.js';

async function start(options) {
  const app = await createApp(options);
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return { app, base: `http://127.0.0.1:${app.server.address().port}` };
}
test('cached reads, short requests, single-flight pull, atomic commit and WebSocket completion', async () => {
  const { app, base } = await start({ delayMs: 600 });
  const socket = new WebSocket(base.replace('http:', 'ws:') + '/events');
  const messages = [];
  socket.on('message', data => messages.push(JSON.parse(data)));
  try {
    await new Promise(resolve => socket.on('open', resolve));
    assert.equal((await (await fetch(base + '/api/trades')).json()).trades.length, 3000);
    const before = Date.now();
    assert.equal((await fetch(base + '/api/pulls', { method: 'POST' })).status, 202);
    assert.ok(Date.now() - before < 500);
    assert.equal((await fetch(base + '/api/pulls', { method: 'POST' })).status, 409);
    assert.equal((await (await fetch(base + '/api/trades')).json()).trades.length, 3000);
    const final = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('No completion push')), 10000);
      socket.on('message', raw => { const event = JSON.parse(raw); if (event.type === 'snapshot' && event.job?.status === 'completed') { clearTimeout(timeout); resolve(event); } });
    });
    assert.equal(final.trades.length, 6000);
    assert.equal(new Set(final.trades.map(t => t.id)).size, 6000);
    assert.equal(final.job.pages, 60);
    assert.ok(messages.some(m => m.type === 'job' && m.job.status === 'running'));
    const reconnect = new WebSocket(base.replace('http:', 'ws:') + '/events');
    const recovered = await new Promise(resolve => reconnect.once('message', raw => resolve(JSON.parse(raw))));
    assert.equal(recovered.trades.length, 6000); reconnect.close();
    assert.equal((await fetch(base + '/getTrades?cursor=-1')).status, 400);
  } finally { socket.close(); await app.close(); }
});
test('restart preserves saved trades and marks interrupted jobs failed', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'bse-'));
  const database = join(folder, 'test.sqlite');
  let running = await start({ database, delayMs: 900000 });
  try {
    await fetch(running.base + '/api/pulls', { method: 'POST' });
    await running.app.close();
    running = await start({ database, delayMs: 0 });
    const data = await (await fetch(running.base + '/api/trades')).json();
    assert.equal(data.trades.length, 3000); assert.equal(data.job.status, 'failed');
  } finally { await running.app.close(); rmSync(folder, { recursive: true, force: true }); }
});
test('rejects delays that cannot meet the per-request budget', async () => {
  await assert.rejects(createApp({ delayMs: 1200001 }), /20 seconds/);
});
