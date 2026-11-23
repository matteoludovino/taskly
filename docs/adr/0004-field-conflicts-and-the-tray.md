# 4. Per-field conflicts and a tray

**Status:** accepted

## Context

Most concurrent edits merge naturally (different cards, different fields, moves). Silently overwriting a
field someone else just changed is the case worth a person's attention, especially after working offline.

## Decision

- Each card field keeps a version `{seq, by}`. A field edit carries the version the person saw (`baseSeq`).
- The server turns it down as `conflict` only if **someone else** changed that field after `baseSeq`, to a
  different value; the rejection includes what's there now and who put it. A person's own successive edits
  never conflict; choosing the value that's already there is a no-op.
- The client collects such rejections in a **tray** (header and the card's own dialog) with "keep mine" (the
  same edit, based on the current version) or "keep theirs". A deleted card offers a restore with the change
  re-applied; a card headed for a deleted column can be put elsewhere.
- Presence shows who is editing or dragging which card, so most conflicts never happen.

## Consequences

No modal per conflict and no lost work; the rules are pure functions with their own tests.
