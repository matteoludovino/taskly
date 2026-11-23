import type { FastifyBaseLogger } from "fastify";
import type { Db } from "../db.ts";
import type { BoardStore } from "./store.ts";

/** Regular boards nobody touched for this long are removed (the free database is small). */
export const IDLE_BOARD_MS = 60 * 24 * 60 * 60 * 1000;

/** Removes expired demo boards and long-idle ones, everything they hold included (cascade). */
export async function removeExpiredBoards(db: Db, store: BoardStore, now = new Date()): Promise<number> {
  const expired = await db.board.findMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        { expiresAt: null, lastActivityAt: { lt: new Date(now.getTime() - IDLE_BOARD_MS) } },
      ],
    },
    select: { id: true },
  });
  if (expired.length === 0) return 0;
  const ids = expired.map((b) => b.id);
  await db.board.deleteMany({ where: { id: { in: ids } } });
  ids.forEach((id) => store.evict(id));
  return ids.length;
}

/** Runs the cleanup when the server starts and every `everyMs` while it's up (no external cron). */
export function scheduleCleanup(
  db: Db,
  store: BoardStore,
  log: FastifyBaseLogger,
  everyMs: number,
): () => void {
  const run = () =>
    removeExpiredBoards(db, store)
      .then((count) => count && log.info({ count }, "removed expired boards"))
      .catch((error: unknown) => log.error({ err: error }, "board cleanup failed"));
  void run();
  const timer = setInterval(run, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
