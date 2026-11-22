import type { EventBody } from "./events";
import { CARD_FIELDS, type BoardState, type CardField, type FieldVersion } from "./model";

export function emptyBoard(id: string, title: string): BoardState {
  return {
    id,
    title,
    seq: 0,
    columns: {},
    cards: {},
    participants: {},
    deletedColumns: {},
    deletedCards: {},
  };
}

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

/**
 * Applies a recorded event. Pure and total: it trusts the payload (the server already decided), so every
 * client that applies the same events in the same order ends up with the same board.
 */
export function applyEvent(
  state: BoardState,
  event: EventBody & { seq: number; actorId: string | null },
): BoardState {
  const next = { ...state, seq: event.seq };
  const version: FieldVersion = { seq: event.seq, by: event.actorId };

  switch (event.type) {
    case "board.renamed":
      return { ...next, title: event.payload.title };

    case "participant.joined": {
      const { participantId, name, color } = event.payload;
      return {
        ...next,
        participants: { ...state.participants, [participantId]: { id: participantId, name, color } },
      };
    }

    case "column.created": {
      const { columnId, title, position } = event.payload;
      return { ...next, columns: { ...state.columns, [columnId]: { id: columnId, title, position } } };
    }

    case "column.renamed":
    case "column.moved": {
      const column = state.columns[event.payload.columnId];
      if (!column) return next;
      const changed =
        event.type === "column.renamed"
          ? { ...column, title: event.payload.title }
          : { ...column, position: event.payload.position };
      return { ...next, columns: { ...state.columns, [column.id]: changed } };
    }

    case "column.deleted": {
      const { columnId, title } = event.payload;
      return {
        ...next,
        columns: omit(state.columns, columnId),
        deletedColumns: { ...state.deletedColumns, [columnId]: title },
      };
    }

    case "card.created": {
      const { cardId, columnId, title, position, priority } = event.payload;
      const versions = Object.fromEntries(CARD_FIELDS.map((field) => [field, version])) as Record<
        CardField,
        FieldVersion
      >;
      const card = {
        id: cardId,
        columnId,
        title,
        priority,
        dueDate: null,
        completed: false,
        position,
        versions,
      };
      return { ...next, cards: { ...state.cards, [cardId]: card } };
    }

    case "card.updated": {
      const card = state.cards[event.payload.cardId];
      if (!card) return next;
      const { field, value } = event.payload.change;
      const changed = { ...card, [field]: value, versions: { ...card.versions, [field]: version } };
      return { ...next, cards: { ...state.cards, [card.id]: changed } };
    }

    case "card.moved": {
      const card = state.cards[event.payload.cardId];
      if (!card) return next;
      const { toColumnId, position } = event.payload;
      return { ...next, cards: { ...state.cards, [card.id]: { ...card, columnId: toColumnId, position } } };
    }

    case "card.deleted": {
      const { cardId, cardTitle } = event.payload;
      return {
        ...next,
        cards: omit(state.cards, cardId),
        deletedCards: { ...state.deletedCards, [cardId]: cardTitle },
      };
    }
  }
}
