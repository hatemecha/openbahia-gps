# Reliability

Designed so a frozen GPSBahía, a bad session cookie, or a phone that fell asleep does not take down the map.

```
UNINITIALIZED → REFRESHING → READY
                    ↓
                 BACKOFF → FAILED
                    ↓
              (cooldown) → REFRESHING
```

## Session (GPSBahía)

One `GpsBahiaSessionManager` is shared by all lines. Eight expired lines still trigger **one** homepage fetch (single-flight). Original request + **at most one retry** after a session refresh. Homepage and track calls use `AbortSignal.timeout(10s)`. Failures enter BACKOFF with exponential delay (capped at 60 s), then FAILED. No infinite instant retry.

## Circuit breaker

Around GPSBahía realtime: `closed → open → half_open`. Four consecutive hub failures open the circuit for 30 s. While OPEN the hub serves the last vehicles (stale-while-revalidate) and does not bombard upstream. One probe in HALF_OPEN.

## Timeouts, retry, backoff

- Every upstream `fetch` has an explicit timeout.
- Network backoff: 10 s → 20 s → 40 s → 60 s plus jitter (~25 %).
- JSON/HTML garbage is treated as an upstream failure, not a crash.

## Cache

Static cache (`data/cache/`): `schemaVersion`, `source`, `fetchedAt`, SHA-256 checksum. Writes are temp + fsync + rename. Truncated JSON is rejected.

If a **known-valid** GPSBahía cache exists, a GPSBahía outage does **not** flap to gpsbus geometries. Fallbacks (gpsbus Storage, municipal CSV) run only when there is no usable cache. Geometries and stops always come from one coherent source.

Realtime: a failed refresh **does not wipe** vehicles. The API keeps the last positions and sets `realtimeState` to `delayed` / `very_stale`. The UI says “Última ubicación hace 2 min”, never “En vivo”.

## GPS validation

Bahía Blanca ingest bounding box with margin. Reject NaN, 0,0, absurd future timestamps. Jumps of > 2.5 km in < 20 s are logged and not used for speed/matching until the next coherent point. Raw GPS is always kept when the observation is otherwise valid.

## Shutdown

`SIGTERM` / `SIGINT` close Fastify, stop hub timers/SSE, and skip further cache writes. `uncaughtException` and `unhandledRejection` are fatal (exit 1). Do not swallow them to limp on.

## Health

`GET /api/health` reads cached hub/static state and **never** calls GPSBahía. `GET /api/ready` is 200 when static routes can be served even if realtime is down.
