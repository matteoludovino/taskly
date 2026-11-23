# 8. Deployment on free plans, single instance

**Status:** accepted

## Context

The demo runs on free tiers: Render (0.1 CPU, 512 MB, sleeps after 15 minutes idle), Neon PostgreSQL and
Vercel.

## Decision

- One server instance (it owns each board's queue, presence and open documents). Prisma's Rust-free client
  with the node-postgres adapter keeps memory low; the heap is capped at 384 MB.
- The landing page calls `/api/health` (no database) to wake the server early; the UI says it is waking up
  (about 40 s) instead of looking broken, and shows a board from the browser's copy meanwhile.
- Housekeeping runs inside the server (on start and every 6 hours): expired demo boards and boards idle for
  60 days are removed. No external cron, which a sleeping instance wouldn't hear anyway.
- Migrations run on start through the direct (non-pooled) connection; the app uses the pooled one.

## Path to several instances

Fan events out with PostgreSQL `LISTEN/NOTIFY` (or Redis pub/sub), keep presence in Redis, and route each board
to one writer (consistent hashing on the board id) so the per-board queue stays single.

## Measured

Load test, 50 clients on one board, on a 0.1 CPU / 512 MB container: one operation per second is delivered to
all at p50 16 ms / p95 268 ms; five per second at p50 15 ms / p95 850 ms (CPU-bound). On a laptop core:
p50 15 ms / p95 19 ms at twenty per second.
