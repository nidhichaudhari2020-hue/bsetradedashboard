# BSE Trade Desk

A runnable software-engineering assessment: mock exchange, persistent dashboard, background ingestion and live completion delivery.

## Run

Requires Node.js 22.14+ and npm. SQLite is bundled with Node (Node 22 prints an experimental-feature warning).

```sh
cd bse-trades
npm ci
npm start
```

Open http://localhost:4300. The dashboard starts with 3,000 deterministic demonstration trades saved in SQLite. Click **Pull latest trades** to ingest another 3,000 trades. The default complete pull takes approximately **15 minutes** (60 sequential pages, 15 seconds per page, plus processing overhead). Existing records remain visible and searchable throughout.

For the walkthrough, run `npm run demo` instead: the same ingestion path takes approximately 12 seconds. Stop the current server before switching modes. `PULL_DELAY_MS` overrides either default; `PORT` overrides 4300. For PowerShell: `$env:PULL_DELAY_MS='900000'; npm start`. Supported delays: 0–1,200,000 milliseconds.

```sh
npm test
```

Tests cover immediate cache reads, asynchronous acceptance, concurrent-pull rejection, completion push, reconnection snapshots, atomic publication, persistence, interrupted jobs and configuration validation.

## API

| Endpoint | Behavior |
| --- | --- |
| `GET /getTrades?cursor=0&batch=exchange` | Mock exchange: 50 seeded trades, `nextCursor`, and total count. Follow cursors until null for all 3,000 records. Same batch and cursor produce the same records. |
| `GET /api/trades` | Immediate persisted trades and latest job state. |
| `POST /api/pulls` | Returns 202 immediately; 409 if another pull is running. |
| `WS /events` | Initial authoritative snapshot, job progress events, and committed completion snapshot. |

Trade fields: `id`, `client`, `symbol`, `quantity`, `price` (INR), and ISO `timestamp`. Each new pull uses a distinct mock batch ID to simulate newly available records; this does not model a real exchange watermark. The initial `seed` batch is explicitly demonstration data.

Data lives in `data/trades.sqlite`; it survives restarts. Incomplete batches are discarded, interrupted jobs become failed, and the user can retry. There is no cron, scheduler or data polling loop. WebSocket reconnection uses bounded exponential backoff only after disconnect; it is transport recovery, not periodic fetching.

See [architecture](docs/architecture.md) and [walkthrough guide](docs/walkthrough.md). The recorded walkthrough is `docs/walkthrough.webm`.

## Scope

This is a local, single-process assessment, bound to loopback. It has no authentication and is not an internet-facing trading service. Production additions would include authenticated users, a dedicated durable queue/worker, exchange cursor checkpoints, bounded server-side ledger pagination and shared pub/sub for multiple instances. Financial amounts here are mock display values; an accounting system should store integer minor units or decimal types.

The crucial protocol assumption is explicit: the exchange supports pagination, and the network permits upgraded WebSockets. A single exchange HTTP response that produces no usable result for 15 minutes cannot cross an absolute 30-second connection limit unchanged. See the architecture note for alternatives.
