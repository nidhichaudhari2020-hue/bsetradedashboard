import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import { createApp } from '../server.js';

const app = await createApp({ delayMs: 900000 });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const started = new Date().toISOString();
const durations = [];
app.server.on('request', (req, res) => {
  const start = performance.now();
  res.on('finish', () => durations.push({ endpoint: req.url.split('?')[0], milliseconds: Math.round(performance.now() - start) }));
});
const socket = new WebSocket(base.replace('http:', 'ws:') + '/events');
const begin = performance.now();
let acceptedMs, cacheReadMs, checked = false;
try {
  const completed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Full pull exceeded 17 minutes')), 1020000);
    socket.on('error', reject);
    socket.on('message', async raw => {
      try {
        const message = JSON.parse(raw);
        if (message.type === 'job' && message.job.pages % 4 === 0) console.log(`Progress: ${message.job.pages}/60 pages`);
        if (message.type === 'job' && message.job.pages === 1 && !checked) {
          checked = true;
          const before = performance.now();
          const cached = await (await fetch(base + '/api/trades')).json();
          cacheReadMs = Math.round(performance.now() - before);
          assert.equal(cached.trades.length, 3000);
          assert.equal(cached.job.status, 'running');
          assert.ok(cacheReadMs < 1000);
          console.log(`Saved trades available during pull in ${cacheReadMs} ms`);
        }
        if (message.type === 'snapshot' && message.job?.status === 'completed') { clearTimeout(timeout); resolve(message); }
        if (message.type === 'job' && message.job.status === 'failed') { clearTimeout(timeout); reject(Error(message.job.error)); }
      } catch (e) { clearTimeout(timeout); reject(e); }
    });
  });
  await new Promise(resolve => socket.once('open', resolve));
  const before = performance.now();
  const response = await fetch(base + '/api/pulls', { method: 'POST' });
  acceptedMs = Math.round(performance.now() - before);
  assert.equal(response.status, 202);
  const snapshot = await completed;
  const elapsedMs = Math.round(performance.now() - begin);
  assert.equal(snapshot.trades.length, 6000);
  assert.equal(snapshot.job.pages, 60);
  const exchange = durations.filter(r => r.endpoint === '/getTrades');
  assert.equal(exchange.length, 60);
  assert.ok(exchange.every(r => r.milliseconds < 30000));
  assert.ok(elapsedMs >= 900000);
  const result = { passed: true, started, finished: new Date().toISOString(), configuredDelayMs: 900000, elapsedMs, acceptedMs, cacheReadDuringPullMs: cacheReadMs, exchangeRequests: exchange.length, longestExchangeResponseMs: Math.max(...exchange.map(r => r.milliseconds)), finalTradeCount: snapshot.trades.length, completionTransport: 'WebSocket', note: 'Local application test with enforced HTTP response cutoff; not an external gateway certification.' };
  writeFileSync(new URL('../docs/full-duration-results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally { socket.close(); await app.close(); }
