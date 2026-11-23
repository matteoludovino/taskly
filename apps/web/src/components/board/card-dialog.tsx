"use client";

import { useEffect, useRef } from "react";
import {
  cardsIn,
  PRIORITIES,
  sortedColumns,
  type Activity,
  type BoardState,
  type CardChange,
  type CardState,
  type Focus,
  type Operation,
  type Priority,
} from "@taskly/shared";
import type { Resolution, TrayItem } from "@/lib/conflicts";
import { PRIORITY_LABEL } from "./card-labels";
import { CardConflicts } from "./conflict-tray";
import { InlineEdit } from "./inline-edit";

/**
 * A card's details. Every control saves on its own, one field per operation, based on the version of
 * that field on screen: if someone else changed it in between, the change goes to the conflict tray
 * instead of silently overwriting theirs.
 */
export function CardDialog({
  board,
  card,
  others,
  conflicts,
  onSettle,
  onOp,
  onFocus,
  onClose,
}: {
  board: BoardState;
  card: CardState;
  /** Other people on this card right now. */
  others: Activity[];
  /** This card's entries in the conflict tray. */
  conflicts: TrayItem[];
  onSettle: (item: TrayItem, resolution: Resolution) => void;
  onOp: (op: Operation) => void;
  onFocus: (focus: Focus | null) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Opened once on mount. No close() on cleanup: it would fire `close`, and React's development
  // double-mount would then shut the dialog right after opening it. Unmounting removes it anyway.
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  // Everyone else sees this person on the card while the dialog is open.
  useEffect(() => {
    onFocus({ cardId: card.id, mode: "editing" });
    return () => onFocus(null);
  }, [card.id, onFocus]);

  const change = (value: CardChange, baseSeq = card.versions[value.field]?.seq) =>
    onOp({
      type: "card.update",
      cardId: card.id,
      change: value,
      ...(baseSeq === undefined ? {} : { baseSeq }),
    });
  const names = [...new Set(others.map((a) => board.participants[a.participantId]?.name ?? "Alguém"))];
  const column = board.columns[card.columnId];
  const field = "grid gap-1 text-sm font-medium text-zinc-700";
  const control =
    "rounded-lg border border-zinc-300 bg-white px-2 py-1.5 font-normal text-zinc-900 focus:border-zinc-900 focus:outline-none";

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      aria-labelledby="card-title"
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-2xl p-0 shadow-xl backdrop:bg-zinc-900/40"
    >
      <div className="grid gap-5 p-6">
        <div className="flex items-start gap-3">
          <h2 id="card-title" className="min-w-0 flex-1 text-lg font-semibold">
            <InlineEdit
              value={card.title}
              label="Título do cartão"
              maxLength={200}
              version={card.versions.title?.seq}
              onSave={(title, startedAt) => change({ field: "title", value: title }, startedAt)}
            />
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-zinc-500 hover:text-zinc-900"
          >
            ✕
          </button>
        </div>
        <p className="-mt-3 text-sm text-zinc-500">na coluna {column?.title}</p>
        <CardConflicts items={conflicts} board={board} onSettle={onSettle} />
        {names.length > 0 && (
          <p role="status" className="-mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {names.join(" e ")} também {names.length > 1 ? "estão" : "está"} com este cartão aberto. Se vocês
            mudarem o mesmo campo, você escolhe qual valor fica.
          </p>
        )}

        <label className="flex items-center gap-2 text-sm text-zinc-800">
          <input
            type="checkbox"
            name="completed"
            checked={card.completed}
            onChange={(e) => change({ field: "completed", value: e.target.checked })}
            className="size-4 accent-zinc-900"
          />
          Concluído
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className={field}>
            Prioridade
            <select
              name="priority"
              value={card.priority}
              onChange={(e) => change({ field: "priority", value: e.target.value as Priority })}
              className={control}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            Prazo
            <input
              type="date"
              name="dueDate"
              value={card.dueDate ?? ""}
              onChange={(e) => change({ field: "dueDate", value: e.target.value || null })}
              className={control}
            />
          </label>
        </div>

        <label className={field}>
          Mover para
          <select
            name="column"
            value={card.columnId}
            onChange={(e) => {
              const last = cardsIn(board, e.target.value).at(-1);
              onOp({
                type: "card.move",
                cardId: card.id,
                toColumnId: e.target.value,
                afterId: last?.id ?? null,
                beforeId: null,
              });
            }}
            className={control}
          >
            {sortedColumns(board).map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>

        <div className="flex justify-end border-t border-zinc-200 pt-4">
          <button
            type="button"
            onClick={() => {
              onOp({ type: "card.delete", cardId: card.id });
              onClose();
            }}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Excluir cartão
          </button>
        </div>
      </div>
    </dialog>
  );
}
