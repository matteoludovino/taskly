import type { BoardEvent, BoardState, CardChange } from "@taskly/shared";

/** A sentence in pieces: plain text, or emphasised names and titles. */
export type Piece = string | { strong: string };

export interface Line {
  seq: number;
  at: string;
  actorId: string | null;
  /** The card the line is about, if any (clicking the line opens it). */
  cardId: string | null;
  pieces: Piece[];
}

const PRIORITY: Record<string, string> = { low: "Baixa", med: "Média", high: "Alta" };
const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });

const quote = (title: string): Piece => ({ strong: `“${title}”` });
const strong = (text: string): Piece => ({ strong: text });

function change(card: string, { field, value }: CardChange, previous: CardChange["value"]): Piece[] {
  switch (field) {
    case "title":
      return ["renomeou ", quote(String(previous)), " para ", quote(value)];
    case "priority":
      return ["mudou a prioridade de ", quote(card), " para ", strong(PRIORITY[value] ?? value)];
    case "dueDate":
      return value
        ? [
            "definiu o prazo de ",
            quote(card),
            " para ",
            strong(shortDate.format(new Date(`${value}T00:00:00Z`))),
          ]
        : ["tirou o prazo de ", quote(card)];
    case "completed":
      return value ? ["concluiu ", quote(card)] : ["reabriu ", quote(card)];
  }
}

/**
 * An event as a sentence in Portuguese. Names and titles come from the event itself (as they were then),
 * so the history reads right after renames; only the person's name is looked up, since it doesn't change.
 */
export function describe(event: BoardEvent, board: BoardState): Line {
  const actor = event.actorId ? board.participants[event.actorId]?.name : undefined;
  const who: Piece = strong(actor ?? "Alguém");
  const line = (pieces: Piece[], cardId: string | null = null): Line => ({
    seq: event.seq,
    at: event.at,
    actorId: event.actorId,
    cardId,
    pieces: [who, " ", ...pieces],
  });

  switch (event.type) {
    case "board.renamed":
      return line(["renomeou o quadro para ", quote(event.payload.title)]);
    case "participant.joined":
      return { ...line(["entrou no quadro"]), pieces: [strong(event.payload.name), " entrou no quadro"] };
    case "column.created":
      return line(["criou a coluna ", quote(event.payload.title)]);
    case "column.renamed":
      return line([
        "renomeou a coluna ",
        quote(event.payload.previousTitle),
        " para ",
        quote(event.payload.title),
      ]);
    case "column.moved":
      return line(["mudou a coluna ", quote(event.payload.title), " de lugar"]);
    case "column.deleted":
      return line(["excluiu a coluna ", quote(event.payload.title)]);
    case "card.created":
      return line(
        ["criou ", quote(event.payload.title), " em ", strong(event.payload.columnTitle)],
        event.payload.cardId,
      );
    case "card.updated":
      return line(
        change(event.payload.cardTitle, event.payload.change, event.payload.previous),
        event.payload.cardId,
      );
    case "card.moved": {
      const { cardTitle, fromColumnTitle, toColumnTitle, fromColumnId, toColumnId, cardId } = event.payload;
      return fromColumnId === toColumnId
        ? line(["reordenou ", quote(cardTitle), " em ", strong(toColumnTitle)], cardId)
        : line(
            ["moveu ", quote(cardTitle), " de ", strong(fromColumnTitle), " para ", strong(toColumnTitle)],
            cardId,
          );
    }
    case "card.deleted":
      return line(["excluiu ", quote(event.payload.cardTitle)], event.payload.cardId);
    case "card.restored":
      return line(
        ["restaurou ", quote(event.payload.cardTitle), " em ", strong(event.payload.columnTitle)],
        event.payload.cardId,
      );
    case "card.described":
      return line(["editou a descrição de ", quote(event.payload.cardTitle)], event.payload.cardId);
  }
}

const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" });
const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

const localDay = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/** "Hoje", "Ontem" or "22 de novembro", in the viewer's time zone. */
export function dayLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (localDay(date) === localDay(now)) return "Hoje";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (localDay(date) === localDay(yesterday)) return "Ontem";
  return dayFormat.format(date);
}

/** "agora", "há 5 min", "há 2 h"; past today's first hours, the clock time. */
export function timeLabel(iso: string, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 6 * 60 && localDay(new Date(iso)) === localDay(now))
    return `há ${Math.floor(minutes / 60)} h`;
  return timeFormat.format(new Date(iso));
}

/** Lines grouped under their day, newest first. */
export function byDay(lines: Line[], now = new Date()): { day: string; lines: Line[] }[] {
  const groups: { day: string; lines: Line[] }[] = [];
  for (const line of [...lines].sort((a, b) => b.seq - a.seq)) {
    const day = dayLabel(line.at, now);
    const last = groups.at(-1);
    if (last?.day === day) last.lines.push(line);
    else groups.push({ day, lines: [line] });
  }
  return groups;
}
