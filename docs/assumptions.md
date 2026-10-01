# Assessment interpretation

This submission treats “a full pull takes 15 minutes” as the time to retrieve the complete dataset, not the lifetime of a single HTTP response. The mock implements 60 cursor pages with 50 records each. The default aggregate simulated latency is 900,000 milliseconds.

This interpretation is necessary to respect an absolute 30-second HTTP connection limit on every network hop. Simply moving a monolithic 15-minute HTTP request to a background worker would still fail under that limit.

The dashboard receives completion over an upgraded WebSocket connection. Deployment requires the gateway to permit that protocol. SSE or HTTP heartbeats cannot bypass an absolute HTTP connection lifetime.

## Question for the evaluator

“May the mock `/getTrades` endpoint be cursor-paginated, with a complete pull taking 15 minutes while each HTTP request remains below 30 seconds? The proposed dashboard uses WebSocket push for automatic completion updates. If a single 15-minute exchange response is mandatory, is a worker-to-exchange route exempt from the 30-second limit, or may the exchange expose an asynchronous export/callback interface?”

The evaluator has not yet confirmed these assumptions. This note records the interpretation transparently; it does not claim approval.
