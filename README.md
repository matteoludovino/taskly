# Taskly

Real-time collaborative Kanban boards: several people on the same board, every change showing up live over
WebSocket, edits made offline merged back when the connection returns, and card descriptions edited
together character by character (CRDT).

> **Status:** being rebuilt from a single-user to-do app into the real-time version. The roadmap below
> tracks the stages; the live demo comes back with the last one.

## Architecture

An npm-workspaces monorepo:

| Package           | What it is                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `apps/web`        | Next.js 16 + Tailwind 4 frontend (UI in Brazilian Portuguese)                                 |
| `apps/server`     | Fastify + WebSocket server, the only writer to the database (Prisma 7, PostgreSQL)            |
| `packages/shared` | Wire protocol and sync engine used by both sides (Zod schemas, reducer, fractional positions) |

The browser reaches the REST API through a `/api` rewrite on the web app's own origin (first-party cookie)
and opens the WebSocket straight to the server with a one-time ticket.

## How changes flow

Every change is an **operation** (`card.move`, `card.update`, …) with a client-minted id. The server
runs it through one write path, per board and in order: it decides what actually happens against the
current board (`decide()` in `packages/shared`), records the outcome as a numbered **event** (1, 2, 3…
with no gaps) and updates the rows in the same transaction. Resending an operation returns the original
event, so retries are harmless.

The browser shows its own operations immediately by running the same `decide()` locally, and settles
them when the server answers. Moves carry the neighbours seen at drop time, not a position: the server
computes the final order key, so two people dropping into the same gap still get a clean order.

## Live updates

The browser trades its participant cookie for a one-time ticket (REST, same origin) and opens a WebSocket
straight to the server. It says `hello` with the last event number it has; inside the board's queue, the
server sends what it missed (the events since, or a snapshot when that's shorter) and subscribes it, so no
event can fall between the catch-up and the live stream. From then on everyone receives the same events
in the same gapless order; the sender also gets an acknowledgement after its own event.

The client applies events strictly in order, holds any that arrive past a gap and asks for the missing ones
(`pull`) if the gap doesn't close in 1.5 s. After a reconnect it resends its pending operations, which is
safe because the server answers an already-applied operation with its original event. A property test runs
three clients against a model server with messages reordered, duplicated and dropped, and checks they all
converge on the server's board.

## Conflicts

Most concurrent changes simply merge: edits to different cards, or to different fields of the same card,
and moves (the last one wins). The one case worth a person's attention is two people changing the same
field. Every field edit carries the version of that field the person was looking at; the server turns it
down only if someone else changed the field since, to a different value, and says what's there now and who
put it. The change then waits in a **conflict tray** with "keep mine" (the same edit, based on the current
version) or "keep theirs". A delete beats an edit or a move, and the tray offers to restore the card with
the change applied. Who is editing or dragging which card is shown live, so most conflicts never happen.

## Writing descriptions together

A card's description is a [Yjs](https://yjs.dev) document (a CRDT), edited with TipTap: concurrent typing
merges character by character, with everyone's cursor shown. Its updates travel as binary frames on the
board's WebSocket, multiplexed by card id, separate from the operation log (no event per keystroke).

The server keeps open documents in memory, relays updates and cursors, and never drops an update: one past
the size guard closes that subscription with a reason instead. Saving is debounced and always **merges**
with what's stored (`SELECT … FOR UPDATE` + `Y.mergeUpdates`), so two server processes saving the same card
both keep their changes. On shutdown every open document is saved before clients are told to reconnect.
When someone stops typing for 30 seconds (or closes the card), the edit session becomes one history event
with a preview of the text.

## Running locally

Requirements: Node.js 22.18+, Docker.

```bash
npm install
npm run db:up                          # PostgreSQL on localhost:5438
cp .env.example apps/server/.env
npm run db:migrate -w @taskly/server
npm run dev                            # server on :8030, web on http://localhost:3020
```

| Script                                      | Does                                             |
| ------------------------------------------- | ------------------------------------------------ |
| `npm test`                                  | Every package's tests (server tests need the DB) |
| `npm run lint` / `typecheck` / `build`      | Across all workspaces                            |
| `npm run format` / `format:check`           | Prettier                                         |
| `docker build -f apps/server/Dockerfile .`  | Server image (applies migrations on start)       |
| `npm run bot -w @taskly/server -- "<link>"` | A bot that joins a board and keeps editing it    |

## Roadmap

1. ✅ Monorepo: Next 16 / Tailwind 4, Fastify server, shared package, Vitest, Compose, CI
2. ✅ Boards, columns and cards over REST; join by link + name; drag and drop
3. ✅ Real-time core: ordered event log, acknowledgements, gap recovery, presence, reconnection
4. ✅ Who is editing what; per-field conflicts and a conflict tray
5. ✅ Simultaneous description editing (Yjs)
6. Live activity history
7. Offline: pending changes and documents survive a reload
8. Per-visitor demo boards with a simulated teammate, end-to-end tests, deploy

## History

Taskly started as a single-user to-do list (Next.js API routes, Prisma 5). That version lives in the git
history; its `tasks` table is dropped when boards arrive in stage 2.
