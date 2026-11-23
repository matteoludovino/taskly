import { z } from "zod";
import { boardTitle, cardTitle, columnTitle, id, isoDate, priority } from "./model";

const neighbour = id.nullable();

/** A card field change. One operation changes one field, so concurrent edits of different fields merge. */
export const cardChange = z.discriminatedUnion("field", [
  z.object({ field: z.literal("title"), value: cardTitle }),
  z.object({ field: z.literal("priority"), value: priority }),
  z.object({ field: z.literal("dueDate"), value: isoDate.nullable() }),
  z.object({ field: z.literal("completed"), value: z.boolean() }),
]);
export type CardChange = z.infer<typeof cardChange>;

/** What a client asks for. The server decides what actually happens (see decide.ts). */
export const operation = z.discriminatedUnion("type", [
  z.object({ type: z.literal("board.rename"), title: boardTitle }),
  z.object({
    type: z.literal("column.create"),
    columnId: id,
    title: columnTitle,
    afterId: neighbour.optional(),
  }),
  z.object({ type: z.literal("column.rename"), columnId: id, title: columnTitle }),
  z.object({ type: z.literal("column.move"), columnId: id, afterId: neighbour, beforeId: neighbour }),
  z.object({ type: z.literal("column.delete"), columnId: id }),
  z.object({
    type: z.literal("card.create"),
    cardId: id,
    columnId: id,
    title: cardTitle,
    afterId: neighbour.optional(),
    beforeId: neighbour.optional(),
  }),
  z.object({
    type: z.literal("card.update"),
    cardId: id,
    change: cardChange,
    /** The field version the client was looking at (for conflict detection). */
    baseSeq: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("card.move"),
    cardId: id,
    toColumnId: id,
    afterId: neighbour,
    beforeId: neighbour,
  }),
  z.object({ type: z.literal("card.delete"), cardId: id }),
  /** Brings a deleted card back, at the end of a column. */
  z.object({ type: z.literal("card.restore"), cardId: id, columnId: id }),
]);
export type Operation = z.infer<typeof operation>;
export type OperationType = Operation["type"];

/** An operation plus the id that makes resending it harmless. */
export const envelope = z.object({ clientOpId: id, op: operation });
export type Envelope = z.infer<typeof envelope>;
