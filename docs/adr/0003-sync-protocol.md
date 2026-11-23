# 3. Sync protocol: catch up and subscribe in one step

**Status:** accepted

## Decision

- A connection says `hello {protocolVersion, lastSeq}`. Inside the board's queue, the server sends the events
  after `lastSeq` (or a snapshot when that's longer than 500 events), then `synced`, and subscribes the
  connection, all before any other write can land: nothing is lost or doubled between catch-up and live.
- Events are broadcast from inside the queue, so a sender gets its own event before its `ack`.
- The client (`packages/shared/src/sync.ts`, pure functions) applies only `seq == confirmed + 1`, holds events
  past a gap, and sends `pull` if the gap is still open after 1.5 s. A pending operation leaves only when the
  board has caught up with the server's answer (its event applied, or the seq a no-op/rejection was decided
  at), so an early ack never makes the screen flicker back.
- After reconnecting, pending operations are resent in order (safe: ADR 1).
- The server accepts the current protocol version and the previous one; older clients are told to reload.

## Consequences

A property test runs three clients against a model server with messages reordered, duplicated and dropped,
connections cut at any point; all converge on the server's board and nothing is applied twice.
