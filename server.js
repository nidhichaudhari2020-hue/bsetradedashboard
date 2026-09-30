import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const SIZE = 3000, PAGE = 50, PAGES = SIZE / PAGE;
const symbols = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ITC', 'BHARTIARTL'];
export function trades(batch) {
  return Array.from({ length: SIZE }, (_, i) => ({
    id: `${batch}-${String(i + 1).padStart(5, '0')}`,
    client: `CL-${String(1001 + i % 180)}`, symbol: symbols[i % symbols.length],
    quantity: 10 + (i * 17 % 990), price: (10000 + i * 137 % 350000) / 100,
    timestamp: new Date(Date.UTC(2026, 8, 30, 3, 45) + i * 1000).toISOString()
  }));
}
export async function createApp({ database = ':memory:', delayMs = 900000 } = {}) {
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs / PAGES > 20000)
    throw new Error('PULL_DELAY_MS must be between 0 and 1200000; each page must finish within 20 seconds');
  const db = new DatabaseSync(database);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS trades(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, status TEXT NOT NULL, pages INTEGER NOT NULL DEFAULT 0, error TEXT, started TEXT NOT NULL, finished TEXT);
    UPDATE jobs SET status='failed', error='Service restarted before pull completed' WHERE status='running';`);
  const insert = db.prepare('INSERT OR IGNORE INTO trades VALUES (?, ?)');
  function commit(records) {
    db.exec('BEGIN');
    try { for (const t of records) insert.run(t.id, JSON.stringify(t)); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  if (!db.prepare('SELECT 1 FROM trades LIMIT 1').get()) commit(trades('seed'));
  let active = null, closing = false;
  const controller = new AbortController();
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  function snapshot() {
    return { type: 'snapshot', trades: db.prepare('SELECT payload FROM trades ORDER BY rowid DESC').all().map(r => JSON.parse(r.payload)),
      job: db.prepare('SELECT * FROM jobs ORDER BY rowid DESC LIMIT 1').get() ?? null,
      delayMs };
  }
  function broadcast(value) {
    const message = JSON.stringify(value);
    for (const client of sockets.clients) if (client.readyState === WebSocket.OPEN) {
      if (client.bufferedAmount > 8 * 1024 * 1024) client.terminate(); else client.send(message);
    }
  }
  function jobEvent() { broadcast({ type: 'job', job: db.prepare('SELECT * FROM jobs ORDER BY rowid DESC LIMIT 1').get() }); }
  const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/getTrades') {
        const page = Number(url.searchParams.get('cursor') ?? 0);
        const batch = url.searchParams.get('batch') ?? 'exchange';
        if (!Number.isInteger(page) || page < 0 || page >= PAGES || !/^[a-zA-Z0-9-]{1,64}$/.test(batch)) return json(res, 400, { error: 'Invalid cursor or batch' });
        const timer = setTimeout(() => {
          if (!res.destroyed) json(res, 200, { trades: trades(batch).slice(page * PAGE, (page + 1) * PAGE), nextCursor: page + 1 < PAGES ? page + 1 : null, total: SIZE });
        }, delayMs / PAGES);
        res.on('close', () => clearTimeout(timer));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/trades') return json(res, 200, snapshot());
      if (req.method === 'POST' && url.pathname === '/api/pulls') {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, { error: 'Origin rejected' });
        if (active) return json(res, 409, { error: 'A pull is already running', id: active.id });
        const id = randomUUID();
        db.prepare('INSERT INTO jobs(id,status,started) VALUES (?, ?, ?)').run(id, 'running', new Date().toISOString());
        active = { id, promise: null };
        json(res, 202, { id }); jobEvent();
        active.promise = ingest(id);
        return;
      }
      const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
      if (req.method === 'GET' && assets[url.pathname]) {
        const [file, type] = assets[url.pathname];
        res.writeHead(200, { 'Content-Type': type }); res.end(readFileSync(new URL(`./public/${file}`, import.meta.url))); return;
      }
      json(res, 404, { error: 'Not found' });
    } catch (e) { if (!res.headersSent) json(res, 500, { error: 'Request failed' }); else res.end(); }
  });
  // This enforces the same absolute 30-second HTTP response budget as the scenario.
  server.on('request', (_req, res) => { const timer = setTimeout(() => res.destroy(), 30000); res.on('close', () => clearTimeout(timer)); });
  async function ingest(id) {
    try {
      const collected = [];
      let cursor = 0;
      do {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/getTrades?batch=${id}&cursor=${cursor}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)])
        });
        if (!response.ok) throw new Error(`Exchange returned ${response.status}`);
        const page = await response.json();
        collected.push(...page.trades);
        db.prepare('UPDATE jobs SET pages=pages+1 WHERE id=?').run(id); jobEvent();
        cursor = page.nextCursor;
      } while (cursor !== null);
      db.exec('BEGIN');
      try {
        for (const t of collected) insert.run(t.id, JSON.stringify(t));
        db.prepare("UPDATE jobs SET status='completed', finished=? WHERE id=?").run(new Date().toISOString(), id);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      broadcast(snapshot());
    } catch (e) {
      db.prepare("UPDATE jobs SET status='failed', error=?, finished=? WHERE id=?").run(e.message, new Date().toISOString(), id);
      if (!closing) jobEvent();
    } finally { active = null; }
  }
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/events' || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) { socket.destroy(); return; }
    sockets.handleUpgrade(req, socket, head, client => {
      // Registration and snapshot are synchronous: completion cannot fall into a subscription gap.
      client.send(JSON.stringify(snapshot()));
      client.on('error', () => client.terminate());
    });
  });
  return { server, db, async close() {
    closing = true; controller.abort();
    if (active) await active.promise;
    for (const client of sockets.clients) client.terminate();
    sockets.close();
    await new Promise(resolve => server.close(resolve)); db.close();
  } };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(new URL('./data/', import.meta.url), { recursive: true });
  const app = await createApp({ database: fileURLToPath(new URL('./data/trades.sqlite', import.meta.url)), delayMs: Number(process.env.PULL_DELAY_MS ?? (process.argv.includes('--demo') ? 12000 : 900000)) });
  app.server.listen(Number(process.env.PORT ?? 4300), '127.0.0.1', () => console.log(`Trade desk: http://localhost:${app.server.address().port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
}
