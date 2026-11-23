# 1. One write path and a gapless event log

**Status:** accepted

## Context

Every change must reach every client in the same order, survive retries, and leave a history. Changes come
from REST, from WebSockets and from the server itself (joins, the demo's teammate, description sessions).

## Decision

- Everything goes through `BoardStore.apply` / `record`. Each board has an **in-process queue**: one write at
  a time, decided against the board held in memory, persisted, then broadcast from inside the queue.
- Each write is an **event** numbered `1, 2, 3…` per board (`board_events`, key `(boardId, seq)`), allocated
  in the same transaction as the rows it changes. No `SEQUENCE`: a rolled-back write leaves no gap.
- Persistence is one non-interactive batch with the event insert first: if another writer took the number,
  the primary key fails, the batch rolls back, the board reloads and the operation is decided again, once.
- Operations carry a client-minted id; `(boardId, clientOpId)` is unique, so a resend returns the original
  event (looked up first only when the decision is a no-op or a rejection; otherwise the constraint catches it).

## Consequences

- Clients can apply events strictly in order and detect gaps by number.
- One instance owns a board's queue. Several instances would need a per-board leader or `LISTEN/NOTIFY` to
  fan events out (see ADR 8).
