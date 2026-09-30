# Reviewer evaluation guide

## Five-minute review

1. Run `npm ci`, then `npm test` from the repository root.
2. Start `npm run demo` and open http://localhost:4300. A fresh database contains 3,000 records.
3. In browser developer tools, inspect Network. Click **Pull latest trades** and confirm an immediate HTTP 202 response.
4. Search for RELIANCE during ingestion. Existing records remain available. Clear the search before completion.
5. Watch the count increase by 3,000 without refreshing. Inspect WebSocket messages on `/events`. There should be one initial `/api/trades` request and no recurring status requests.
6. Restart the app. Committed records remain available. Subsequent pulls add new batches, so the initial count may exceed 3,000.

## Failure and recovery checks

| Action | Expected result |
| --- | --- |
| Send a second POST /api/pulls during ingestion | HTTP 409; only one active job |
| Request an invalid exchange cursor | HTTP 400 |
| Stop the service during ingestion, then restart | Existing records retained; interrupted job marked failed |
| Disconnect and reconnect the dashboard | Current snapshot restored through WebSocket |
| Search for an unknown symbol | Clear empty-result message |
| Configure a delay above 1,200,000 ms | Startup rejected to protect the per-request latency budget |

## Design discussion

**Why not increase an HTTP timeout?** The network imposes an independent limit. Short exchange requests are required even when ingestion runs in the background.

**Why WebSocket rather than SSE?** SSE is a long-lived HTTP response. Heartbeats cannot defeat an absolute connection lifetime. This implementation assumes the gateway permits WebSocket upgrades.

**Why SQLite?** Transactions and persistence are available without a separate service, making the submission easy to run. A shared production deployment would require additional coordination.

**What was measured?** Accelerated ingestion, persistence and browser behavior. The default configuration represents approximately 15 minutes, but a complete 15-minute run has not been measured.
