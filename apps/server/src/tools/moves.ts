import { cardsIn, sortedColumns, uuidv7, PRIORITIES, type BoardState, type Operation } from "@taskly/shared";

const TITLES = [
  "Revisar proposta",
  "Ligar para o fornecedor",
  "Atualizar planilha",
  "Preparar reunião",
  "Responder e-mails",
  "Testar no celular",
  "Escrever a documentação",
  "Conferir orçamento",
];

const pick = <T>(items: readonly T[], random: () => number): T | undefined =>
  items[Math.floor(random() * items.length)];

/**
 * A plausible change to a board, the kind a person makes: move a card (often to the next column), add
 * one, tick one off, change a priority. Used by the test bot and by load tests.
 */
export function randomOperation(board: BoardState, random: () => number = Math.random): Operation | null {
  const columns = sortedColumns(board);
  if (columns.length === 0) return null;
  const cards = Object.values(board.cards);
  const roll = random();

  if (cards.length < 4 || roll < 0.25) {
    const column = columns[0]!;
    return {
      type: "card.create",
      cardId: uuidv7(),
      columnId: column.id,
      title: pick(TITLES, random)!,
      afterId: cardsIn(board, column.id).at(-1)?.id ?? null,
    };
  }
  const card = pick(cards, random)!;
  if (roll < 0.7) {
    const here = columns.findIndex((c) => c.id === card.columnId);
    const to = random() < 0.7 ? (columns[here + 1] ?? columns[0]!) : pick(columns, random)!;
    const target = cardsIn(board, to.id).filter((c) => c.id !== card.id);
    const index = Math.floor(random() * (target.length + 1));
    return {
      type: "card.move",
      cardId: card.id,
      toColumnId: to.id,
      afterId: target[index - 1]?.id ?? null,
      beforeId: target[index]?.id ?? null,
    };
  }
  if (roll < 0.85)
    return { type: "card.update", cardId: card.id, change: { field: "completed", value: !card.completed } };
  if (roll < 0.95)
    return {
      type: "card.update",
      cardId: card.id,
      change: { field: "priority", value: pick(PRIORITIES, random)! },
    };
  // Keep boards from growing forever.
  return cards.length > 12 ? { type: "card.delete", cardId: card.id } : null;
}
