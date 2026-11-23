import type { CardChange } from "./ops";
import type { Priority } from "./model";

/**
 * What happened, as the server recorded it. Payloads carry the final values (positions included) and
 * the names involved at that moment, so the history reads right even after things are renamed.
 */
export interface EventPayloads {
  "board.renamed": { title: string; previousTitle: string };
  "participant.joined": { participantId: string; name: string; color: string; simulated?: true };
  "column.created": { columnId: string; title: string; position: string };
  "column.renamed": { columnId: string; title: string; previousTitle: string };
  "column.moved": { columnId: string; title: string; position: string };
  "column.deleted": { columnId: string; title: string };
  "card.created": {
    cardId: string;
    columnId: string;
    title: string;
    position: string;
    priority: Priority;
    columnTitle: string;
  };
  "card.updated": { cardId: string; cardTitle: string; change: CardChange; previous: CardChange["value"] };
  "card.moved": {
    cardId: string;
    cardTitle: string;
    fromColumnId: string;
    toColumnId: string;
    position: string;
    fromColumnTitle: string;
    toColumnTitle: string;
  };
  "card.deleted": { cardId: string; cardTitle: string; columnId: string };
  /** Someone's edit session on a card's description ended (idle, closed or flushed). */
  "card.described": { cardId: string; cardTitle: string; preview: string };
  "card.restored": {
    cardId: string;
    cardTitle: string;
    columnId: string;
    columnTitle: string;
    position: string;
  };
}

export type EventType = keyof EventPayloads;

export type EventBody = { [T in EventType]: { type: T; payload: EventPayloads[T] } }[EventType];

export type BoardEvent = EventBody & {
  seq: number;
  /** The operation that caused it (null for events the server makes on its own, like joins). */
  clientOpId: string | null;
  actorId: string | null;
  at: string;
};
