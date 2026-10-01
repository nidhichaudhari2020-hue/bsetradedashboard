# Timestamped walkthrough narration

Video: [assignment-walkthrough.webm](assignment-walkthrough.webm). This recording has on-screen captions and no audio. Read the following script aloud when presenting or recording your own voiceover. Timestamps are approximate to the nearest second.

## 00:00–00:12 · 01 / Introduction

This is BSE Trade Desk, my software engineering assessment. It keeps saved trades available while new exchange data is imported in the background.

## 00:12–00:26 · 02 / Saved trades

The dashboard opens with 3,000 saved trades. Each record includes a trade ID, client, symbol, quantity, price, and timestamp. This recording uses a 12-second demo pull.

## 00:26–00:32 · 03 / Start ingestion

Clicking Pull latest trades starts an asynchronous job. The request returns HTTP 202 immediately, so the dashboard does not wait for the full import.

## 00:32–00:39 · 04 / Search during ingestion

I can still search existing records while the pull runs. Here I am filtering RELIANCE trades. Progress is pushed from the server.

## 00:39–00:54 · 05 / Automatic completion

The count has increased to 6,000 without refreshing the page. The completed batch is committed to SQLite, then delivered through a WebSocket event. There is no data polling or scheduler.

## 00:54–01:10 · 06 / Timeout design

The default pull takes 15 minutes across 60 short HTTP requests. This assumes the exchange supports pagination and the network permits WebSockets. A single 15-minute HTTP response would still time out.

## 01:10–01:26 · 07 / Verified results

The full-duration test passed in 15 minutes and 1.6 seconds. The slowest exchange response was 15.031 seconds, below the 30-second limit. Saved trades loaded during ingestion in 27 milliseconds.

## 01:26–01:41 · 08 / Submission

The GitHub repository includes setup instructions, an architecture diagram, tests, and this walkthrough. Run npm ci, then npm run demo. Use npm start for the default 15-minute mode.

## Suggested submission message

Please find my BSE Trade Desk technical assessment below. The repository includes the mock exchange API, persistent dashboard, background ingestion, WebSocket updates, setup instructions, architecture note, tests, and a captioned walkthrough. A full 15-minute ingestion test has passed. The README explicitly documents the pagination and WebSocket assumptions.

Repository: https://github.com/nidhichaudhari2020-hue/bsetradedashboard

Walkthrough: https://github.com/nidhichaudhari2020-hue/bsetradedashboard/blob/main/docs/assignment-walkthrough.webm
