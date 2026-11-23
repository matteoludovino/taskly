import type { BoardEvent, BoardState } from "@taskly/shared";
import type { Db } from "../db.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { fromIsoDate } from "./snapshot.ts";

type Write = Prisma.PrismaPromise<unknown>;

/**
 * The writes that record `event`, given the board as it is after the event (`next`).
 *
 * The event row goes first: (boardId, seq) is its primary key, so if another writer already took this
 * number the insert fails and the whole batch rolls back. That, plus the conditional seq bump, keeps
 * seq gapless without an interactive transaction (one round trip, no locks held while deciding).
 */
export function writesFor(db: Db, event: BoardEvent, next: BoardState, extra: Write[] = []): Write[] {
  const boardId = next.id;
  const now = new Date(event.at);
  const writes: Write[] = [
    db.boardEvent.create({
      data: {
        boardId,
        seq: event.seq,
        clientOpId: event.clientOpId,
        actorId: event.actorId,
        type: event.type,
        payload: event.payload as Prisma.InputJsonValue,
        createdAt: now,
      },
    }),
    db.board.updateMany({
      where: { id: boardId, seq: event.seq - 1 },
      data: {
        seq: event.seq,
        lastActivityAt: now,
        ...(event.type === "board.renamed" ? { title: next.title } : {}),
      },
    }),
    ...extra,
  ];

  const column = (id: string) => ({ boardId_id: { boardId, id } });
  switch (event.type) {
    case "column.created": {
      const c = next.columns[event.payload.columnId]!;
      writes.push(db.column.create({ data: { boardId, id: c.id, title: c.title, position: c.position } }));
      break;
    }
    case "column.renamed":
    case "column.moved": {
      const c = next.columns[event.payload.columnId]!;
      writes.push(db.column.update({ where: column(c.id), data: { title: c.title, position: c.position } }));
      break;
    }
    case "column.deleted":
      writes.push(
        db.column.update({ where: column(event.payload.columnId), data: { deletedAt: now, position: null } }),
      );
      break;
    case "card.created":
    case "card.updated":
    case "card.moved": {
      const c = next.cards[event.payload.cardId]!;
      const row = {
        columnId: c.columnId,
        title: c.title,
        priority: c.priority,
        dueDate: fromIsoDate(c.dueDate),
        completed: c.completed,
        position: c.position,
        fieldVersions: c.versions as Prisma.InputJsonValue,
      };
      writes.push(
        event.type === "card.created"
          ? db.card.create({ data: { boardId, id: c.id, ...row, createdAt: now, updatedAt: now } })
          : db.card.update({ where: { boardId_id: { boardId, id: c.id } }, data: row }),
      );
      break;
    }
    case "card.deleted":
      writes.push(
        db.card.update({
          where: { boardId_id: { boardId, id: event.payload.cardId } },
          data: { deletedAt: now, position: null },
        }),
      );
      break;
    case "card.restored": {
      const c = next.cards[event.payload.cardId]!;
      writes.push(
        db.card.update({
          where: { boardId_id: { boardId, id: c.id } },
          data: { deletedAt: null, columnId: c.columnId, position: c.position },
        }),
      );
      break;
    }
    case "board.renamed":
    case "participant.joined":
      break;
  }
  return writes;
}
