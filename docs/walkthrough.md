# Walkthrough

The accompanying `walkthrough.webm` is a captioned, accelerated demonstration of the real running application (12-second demo mode).

1. Open the dashboard: 3,000 persisted seed records are immediately available.
2. Start a pull. Its HTTP request returns 202, and the dashboard remains usable.
3. Filter RELIANCE trades during ingestion; progress arrives over WebSocket.
4. Clear the filter and watch the stored count increase to 6,000 automatically.
5. Explain the architecture: 60 short exchange requests, one atomic SQLite commit, then WebSocket completion push.

Production-duration mode is `npm start`: the same 60 requests take approximately 15 minutes total. The video intentionally uses demo timing to keep the walkthrough short.
