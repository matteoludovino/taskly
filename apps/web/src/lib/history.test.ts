import { describe as group, expect, it } from "vitest";
import { emptyBoard, type BoardEvent, type BoardState } from "@taskly/shared";
import { byDay, dayLabel, describe, timeLabel, type Line, type Piece } from "./history";

const board: BoardState = {
  ...emptyBoard("b", "Quadro"),
  participants: { ana: { id: "ana", name: "Ana", color: "#2563eb" } },
};
const text = (pieces: Piece[]) => pieces.map((p) => (typeof p === "string" ? p : p.strong)).join("");
const say = (event: Partial<BoardEvent> & Pick<BoardEvent, "type" | "payload">) =>
  text(
    describe(
      { seq: 1, clientOpId: null, actorId: "ana", at: "2026-11-22T12:00:00Z", ...event } as BoardEvent,
      board,
    ).pieces,
  );

group("history sentences", () => {
  it("describe moves between columns and within one", () => {
    const payload = {
      cardId: "c",
      cardTitle: "Comprar caixas",
      fromColumnId: "a",
      toColumnId: "b",
      position: "a0",
      fromColumnTitle: "A fazer",
      toColumnTitle: "Feito",
    };
    expect(say({ type: "card.moved", payload })).toBe("Ana moveu “Comprar caixas” de A fazer para Feito");
    expect(
      say({ type: "card.moved", payload: { ...payload, toColumnId: "a", toColumnTitle: "A fazer" } }),
    ).toBe("Ana reordenou “Comprar caixas” em A fazer");
  });

  it("describe each kind of field change", () => {
    const base = { cardId: "c", cardTitle: "Frete" };
    expect(
      say({
        type: "card.updated",
        payload: { ...base, change: { field: "title", value: "Frete grande" }, previous: "Frete" },
      }),
    ).toBe("Ana renomeou “Frete” para “Frete grande”");
    expect(
      say({
        type: "card.updated",
        payload: { ...base, change: { field: "priority", value: "high" }, previous: "med" },
      }),
    ).toBe("Ana mudou a prioridade de “Frete” para Alta");
    expect(
      say({
        type: "card.updated",
        payload: { ...base, change: { field: "dueDate", value: "2026-12-24" }, previous: null },
      }),
    ).toMatch(/^Ana definiu o prazo de “Frete” para 24 de dez/);
    expect(
      say({
        type: "card.updated",
        payload: { ...base, change: { field: "dueDate", value: null }, previous: "2026-12-24" },
      }),
    ).toBe("Ana tirou o prazo de “Frete”");
    expect(
      say({
        type: "card.updated",
        payload: { ...base, change: { field: "completed", value: true }, previous: false },
      }),
    ).toBe("Ana concluiu “Frete”");
  });

  it("use the names recorded in the event, and someone for unknown people", () => {
    expect(
      say({ type: "column.renamed", payload: { columnId: "x", title: "Feito", previousTitle: "Pronto" } }),
    ).toBe("Ana renomeou a coluna “Pronto” para “Feito”");
    expect(
      say({
        type: "card.deleted",
        payload: { cardId: "c", cardTitle: "Velho", columnId: "x" },
        actorId: "ghost",
      }),
    ).toBe("Alguém excluiu “Velho”");
    expect(
      say({
        type: "participant.joined",
        payload: { participantId: "bruno", name: "Bruno", color: "#db2777" },
        actorId: "bruno",
      }),
    ).toBe("Bruno entrou no quadro");
  });

  it("point at the card the line is about", () => {
    const line = describe(
      {
        seq: 3,
        clientOpId: null,
        actorId: "ana",
        at: "t",
        type: "card.described",
        payload: { cardId: "c9", cardTitle: "X", preview: "…" },
      },
      board,
    );
    expect(line.cardId).toBe("c9");
    expect(text(line.pieces)).toBe("Ana editou a descrição de “X”");
  });
});

group("history times", () => {
  const now = new Date(2026, 10, 22, 15, 0);
  it("label days relative to today", () => {
    expect(dayLabel(new Date(2026, 10, 22, 9).toISOString(), now)).toBe("Hoje");
    expect(dayLabel(new Date(2026, 10, 21, 23).toISOString(), now)).toBe("Ontem");
    expect(dayLabel(new Date(2026, 10, 2, 9).toISOString(), now)).toBe("2 de novembro");
  });

  it("label times relative to now, then by the clock", () => {
    expect(timeLabel(new Date(2026, 10, 22, 14, 59, 40).toISOString(), now)).toBe("agora");
    expect(timeLabel(new Date(2026, 10, 22, 14, 45).toISOString(), now)).toBe("há 15 min");
    expect(timeLabel(new Date(2026, 10, 22, 12, 30).toISOString(), now)).toBe("há 2 h");
    expect(timeLabel(new Date(2026, 10, 21, 12, 30).toISOString(), now)).toBe("12:30");
  });

  it("group lines by day, newest first", () => {
    const line = (seq: number, at: Date): Line => ({
      seq,
      at: at.toISOString(),
      actorId: null,
      cardId: null,
      pieces: [],
    });
    const groups = byDay(
      [
        line(1, new Date(2026, 10, 21, 10)),
        line(3, new Date(2026, 10, 22, 10)),
        line(2, new Date(2026, 10, 22, 9)),
      ],
      now,
    );
    expect(groups.map((g) => [g.day, g.lines.map((l) => l.seq)])).toEqual([
      ["Hoje", [3, 2]],
      ["Ontem", [1]],
    ]);
  });
});
