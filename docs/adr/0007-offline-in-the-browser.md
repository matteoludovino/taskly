# 7. Offline: the browser keeps its copy

**Status:** accepted

## Decision

- One IndexedDB database (versioned) keeps, per board, the confirmed state, the pending operations and the
  operations already answered, plus each description document's state. Pending operations are re-validated
  with the protocol schemas when read back.
- Reopening a board shows the saved copy at once, even with no network; the live connection catches up from it
  and resends what's pending. Descriptions saved after a sync stay editable offline and merge through the CRDT.
- Only one tab per board writes (Web Locks API), so tabs don't overwrite each other's pending work.
- Leaving with unconfirmed changes asks first. Data untouched for 30 days is removed.
- No service worker yet: the app needs the network to load its own code once.

## Alternatives

`y-indexeddb` creates a database per document; one schema-versioned database made cleanup and format changes
simpler.
