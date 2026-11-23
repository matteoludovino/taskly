import * as Y from "yjs";
import { descriptionPreview, uuidv7 } from "@taskly/shared";
import { addParticipant, type Membership } from "../boards/access.ts";
import type { BoardStore } from "../boards/store.ts";
import { hashSecret, newBoardId, newSecret } from "../auth/secrets.ts";
import { plainText } from "../collab/text.ts";
import type { Db } from "../db.ts";
import { demoBoard, DEMO_TITLE, TEAMMATE, VISITOR } from "./template.ts";

export const DEMO_LIFETIME_MS = 24 * 60 * 60 * 1000;

/**
 * A fresh demo board for one visitor: set up by a simulated teammate (so its history already tells a
 * story), with the visitor joined last. Gone after a day.
 */
export async function createDemo(
  db: Db,
  store: BoardStore,
  now = new Date(),
): Promise<Membership & { boardId: string; key: string }> {
  const boardId = newBoardId();
  const key = newSecret();
  await db.board.create({
    data: {
      id: boardId,
      keyHash: hashSecret(key),
      title: DEMO_TITLE,
      expiresAt: new Date(now.getTime() + DEMO_LIFETIME_MS),
    },
  });
  const { participant: teammate } = await addParticipant(store, boardId, TEAMMATE, { simulated: true });
  const { ops, descriptions } = demoBoard(now);
  for (const op of ops) await store.apply(boardId, teammate.id, { clientOpId: uuidv7(), op });

  for (const [cardId, update] of descriptions) {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, update);
    const text = plainText(doc);
    doc.destroy();
    await db.card.update({
      where: { boardId_id: { boardId, id: cardId } },
      data: { descriptionDoc: Buffer.from(update), descriptionText: text },
    });
    const card = (await store.get(boardId))!.cards[cardId]!;
    await store.record(
      boardId,
      {
        type: "card.described",
        payload: { cardId, cardTitle: card.title, preview: descriptionPreview(text) },
      },
      teammate.id,
    );
  }
  const membership = await addParticipant(store, boardId, VISITOR);
  return { ...membership, boardId, key };
}
