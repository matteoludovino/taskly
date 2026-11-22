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

## Running locally

Requirements: Node.js 22.18+, Docker.

```bash
npm install
npm run db:up                          # PostgreSQL on localhost:5438
cp .env.example apps/server/.env
npm run db:migrate -w @taskly/server
npm run dev                            # server on :8030, web on http://localhost:3020
```

| Script                                     | Does                                             |
| ------------------------------------------ | ------------------------------------------------ |
| `npm test`                                 | Every package's tests (server tests need the DB) |
| `npm run lint` / `typecheck` / `build`     | Across all workspaces                            |
| `npm run format` / `format:check`          | Prettier                                         |
| `docker build -f apps/server/Dockerfile .` | Server image (applies migrations on start)       |

## Roadmap

1. ✅ Monorepo: Next 16 / Tailwind 4, Fastify server, shared package, Vitest, Compose, CI
2. ✅ Boards, columns and cards over REST; join by link + name; drag and drop
3. Real-time core: ordered event log, acknowledgements, gap recovery, presence, reconnection
4. Who is editing what; per-field conflicts and a conflict tray
5. Simultaneous description editing (Yjs)
6. Live activity history
7. Offline: pending changes and documents survive a reload
8. Per-visitor demo boards with a simulated teammate, end-to-end tests, deploy

## History

Taskly started as a single-user to-do list (Next.js API routes, Prisma 5). That version lives in the git
history; its `tasks` table is dropped when boards arrive in stage 2.
