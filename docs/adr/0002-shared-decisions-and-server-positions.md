# 2. Shared decisions, server-computed positions

**Status:** accepted

## Context

A change should appear at once on the screen of whoever made it, and the server must stay the authority.

## Decision

- `decide(board, op, actor)` and `applyEvent(board, event)` live in `packages/shared`. The server runs them
  for real; a client replays its pending operations over the confirmed board with the same code to show them
  before confirmation (`view()`).
- Order uses fractional keys (ASCII, compared byte by byte: `COLLATE "C"` in PostgreSQL, `<` in JavaScript).
  A move sends the **neighbours** seen at drop time, not a key; the server resolves them against the current
  board (after → before → start → end) and computes the final key. Deleted rows drop their key, so a plain
  unique index keeps live keys distinct.
- Precedence: delete beats move beats edit. Moves are last-writer-wins; only empty columns can be deleted.

## Consequences

- Two people dropping into the same gap get distinct, ordered keys; nobody needs to agree on keys.
- Property tests generate colliding operation sequences and check the board stays consistent.
