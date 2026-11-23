# 5. Card descriptions as Yjs documents

**Status:** accepted

## Context

Free text typed by several people at once needs character-level merging, which an operation log of whole
field values can't give.

## Decision

- Each description is a Yjs document (CRDT) bound to TipTap. Updates travel as binary frames on the board's
  WebSocket, multiplexed by card id: `[type][card id][payload]` with y-protocols sync and awareness.
- No event per keystroke: an edit session (30 s idle, or the last reader leaving, or shutdown) becomes one
  `card.described` history event per person, with a text preview extracted on the server.
- The server never drops an update; an update past the size guard closes that subscription with a reason.
- Saving is debounced and always **merges** with what's stored (`SELECT … FOR UPDATE` + `Y.mergeUpdates`),
  so two processes saving the same card both keep their changes. Shutdown saves everything before telling
  clients to reconnect.
- A client never seeds content: until the server's copy (or a previously synced local copy) arrives, the
  editor is read-only.

## Consequences

Tests with real Yjs clients cover convergence, the merge between two servers, history and shutdown;
mutations (overwrite instead of merge, no flush) fail them.
