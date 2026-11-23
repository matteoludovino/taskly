"use client";

import { useState } from "react";
import { sortedColumns, type BoardState, type CardChange, type CardField } from "@taskly/shared";
import type { Resolution, TrayItem } from "@/lib/conflicts";
import { formatDue, PRIORITY_LABEL } from "./card-labels";

const FIELD_LABEL: Record<CardField, string> = {
  title: "o título",
  priority: "a prioridade",
  dueDate: "o prazo",
  completed: "a conclusão",
};

function formatValue(field: CardField, value: CardChange["value"]): string {
  if (field === "priority") return PRIORITY_LABEL[value as keyof typeof PRIORITY_LABEL];
  if (field === "dueDate") return value ? formatDue(String(value)) : "sem prazo";
  if (field === "completed") return value ? "concluído" : "não concluído";
  return `“${String(value)}”`;
}

const button = "rounded-lg px-2.5 py-1 text-sm font-medium";

/**
 * Changes the server turned down because something happened first (someone else's edit, a deletion).
 * Nothing is lost silently: each waits here with its way out until the person chooses.
 */
export function ConflictTray({
  items,
  board,
  onSettle,
}: {
  items: TrayItem[];
  board: BoardState;
  onSettle: (item: TrayItem, resolution: Resolution) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = items.length;
  const title = (cardId: string) =>
    board.cards[cardId]?.title ?? board.deletedCards[cardId]?.title ?? "cartão";
  const who = (id: string | null) => (id && board.participants[id]?.name) || "Alguém";

  return (
    <div className="relative">
      <p className="sr-only" aria-live="polite">
        {count > 0 ? `${count} ${count === 1 ? "conflito para revisar" : "conflitos para revisar"}` : ""}
      </p>
      {count > 0 && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls="conflict-tray"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-950 hover:bg-amber-100"
        >
          <span aria-hidden>⚠</span> Conflitos
          <span className="rounded-full bg-amber-600 px-1.5 text-xs text-white tabular-nums">{count}</span>
        </button>
      )}
      {open && count > 0 && (
        <section
          id="conflict-tray"
          aria-label="Conflitos para revisar"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          className="absolute right-0 z-20 mt-2 grid w-[min(24rem,calc(100vw-2rem))] gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-xl"
        >
          <h2 className="text-sm font-semibold">Mudanças que precisam da sua escolha</h2>
          <ul className="grid gap-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="grid gap-2 border-t border-zinc-100 pt-3 text-sm text-zinc-700 first:border-0 first:pt-0"
              >
                <Item item={item} board={board} title={title} who={who} onSettle={onSettle} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The same choices, inside a card's dialog (the header's tray is behind the modal there). */
export function CardConflicts({
  items,
  board,
  onSettle,
}: {
  items: TrayItem[];
  board: BoardState;
  onSettle: (item: TrayItem, resolution: Resolution) => void;
}) {
  if (items.length === 0) return null;
  const title = (cardId: string) =>
    board.cards[cardId]?.title ?? board.deletedCards[cardId]?.title ?? "cartão";
  const who = (id: string | null) => (id && board.participants[id]?.name) || "Alguém";
  return (
    <ul
      role="alert"
      className="grid gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
    >
      {items.map((item) => (
        <li key={item.id} className="grid gap-2">
          <Item item={item} board={board} title={title} who={who} onSettle={onSettle} />
        </li>
      ))}
    </ul>
  );
}

function Item({
  item,
  board,
  title,
  who,
  onSettle,
}: {
  item: TrayItem;
  board: BoardState;
  title: (cardId: string) => string;
  who: (id: string | null) => string;
  onSettle: (item: TrayItem, resolution: Resolution) => void;
}) {
  const columns = sortedColumns(board);
  const [columnId, setColumnId] = useState(columns[0]?.id ?? "");
  switch (item.kind) {
    case "field":
      return (
        <>
          <p>
            Em <strong>“{title(item.cardId)}”</strong>, {who(item.by)} mudou {FIELD_LABEL[item.field]} para{" "}
            <strong>{formatValue(item.field, item.theirs)}</strong>. Você tinha escolhido{" "}
            <strong>{formatValue(item.field, item.mine)}</strong>.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSettle(item, "mine")}
              className={`${button} bg-zinc-900 text-white`}
            >
              Manter o meu
            </button>
            <button
              type="button"
              onClick={() => onSettle(item, "theirs")}
              className={`${button} border border-zinc-300`}
            >
              Manter o de {who(item.by)}
            </button>
          </div>
        </>
      );
    case "deleted":
      return (
        <>
          <p>
            <strong>“{title(item.cardId)}”</strong> foi excluído antes da sua alteração chegar.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSettle(item, "restore")}
              className={`${button} bg-zinc-900 text-white`}
            >
              Restaurar com a minha alteração
            </button>
            <button
              type="button"
              onClick={() => onSettle(item, "dismiss")}
              className={`${button} border border-zinc-300`}
            >
              Deixar excluído
            </button>
          </div>
        </>
      );
    case "column-gone":
      return (
        <>
          <p>
            A coluna do cartão <strong>“{item.op.title}”</strong> foi excluída antes de ele chegar.
          </p>
          {columns.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`col-${item.id}`}>
                Coluna
              </label>
              <select
                id={`col-${item.id}`}
                value={columnId}
                onChange={(e) => setColumnId(e.target.value)}
                className="rounded-lg border border-zinc-300 px-2 py-1"
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onSettle(item, { columnId })}
                className={`${button} bg-zinc-900 text-white`}
              >
                Adicionar aqui
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => onSettle(item, "dismiss")}
            className={`${button} justify-self-start border border-zinc-300`}
          >
            Descartar
          </button>
        </>
      );
    case "move-gone":
      return (
        <>
          <p>
            A coluna para onde você moveu <strong>“{title(item.cardId)}”</strong> foi excluída. O cartão ficou
            onde estava.
          </p>
          <button
            type="button"
            onClick={() => onSettle(item, "dismiss")}
            className={`${button} justify-self-start border border-zinc-300`}
          >
            Entendi
          </button>
        </>
      );
  }
}
