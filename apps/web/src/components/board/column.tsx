"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { uuidv7, type CardState, type ColumnState, type Operation } from "@taskly/shared";
import { CardTile } from "./card-tile";
import { InlineEdit } from "./inline-edit";

export const listId = (columnId: string) => `list:${columnId}`;

export function Column({
  column,
  cards,
  onOp,
  onOpenCard,
}: {
  column: ColumnState;
  cards: CardState[];
  onOp: (op: Operation) => void;
  onOpenCard: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: "column" },
  });
  // The card list is a drop target of its own, so empty columns accept cards too.
  const { setNodeRef: setListRef, isOver } = useDroppable({
    id: listId(column.id),
    data: { type: "list", columnId: column.id },
  });

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={column.title}
      className={`flex max-h-full w-72 shrink-0 snap-start flex-col rounded-xl bg-zinc-100 ${isDragging ? "opacity-50" : ""}`}
    >
      <header className="flex items-center gap-1 px-2 pt-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Mover a coluna ${column.title}`}
          aria-roledescription="coluna arrastável"
          className="cursor-grab rounded px-1 text-zinc-400 hover:text-zinc-700 active:cursor-grabbing"
        >
          ⋮⋮
        </button>
        <h2 className="min-w-0 flex-1 text-sm font-semibold text-zinc-800">
          <InlineEdit
            value={column.title}
            label="Nome da coluna"
            maxLength={60}
            onSave={(title) => onOp({ type: "column.rename", columnId: column.id, title })}
          />
        </h2>
        <span className="text-xs text-zinc-500 tabular-nums" aria-label={`${cards.length} cartões`}>
          {cards.length}
        </span>
        <button
          type="button"
          disabled={cards.length > 0}
          onClick={() => onOp({ type: "column.delete", columnId: column.id })}
          title={cards.length > 0 ? "Esvazie a coluna para excluí-la" : "Excluir coluna"}
          aria-label={`Excluir a coluna ${column.title}`}
          className="rounded px-1.5 text-zinc-400 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-zinc-400"
        >
          ✕
        </button>
      </header>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ol
          ref={setListRef}
          className={`grid min-h-12 flex-1 content-start gap-2 overflow-y-auto p-2 ${isOver ? "bg-zinc-200/60" : ""}`}
        >
          {cards.map((card) => (
            <CardTile key={card.id} card={card} onOpen={onOpenCard} />
          ))}
        </ol>
      </SortableContext>
      <AddCard
        onAdd={(title) =>
          onOp({
            type: "card.create",
            cardId: uuidv7(),
            columnId: column.id,
            title,
            afterId: cards.at(-1)?.id ?? null,
          })
        }
      />
    </section>
  );
}

function AddCard({ onAdd }: { onAdd: (title: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return (
      <button
        type="button"
        onClick={() => setDraft("")}
        className="m-2 mt-0 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-600 hover:bg-zinc-200"
      >
        + Adicionar cartão
      </button>
    );
  }
  return (
    <form
      className="grid gap-2 p-2 pt-0"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim()) onAdd(draft.trim());
        setDraft(""); // stays open for the next one
      }}
    >
      <textarea
        autoFocus
        name="title"
        aria-label="Título do cartão"
        maxLength={200}
        rows={2}
        value={draft}
        placeholder="O que precisa ser feito?"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
          if (e.key === "Escape") setDraft(null);
        }}
        className="resize-none rounded-lg border border-zinc-300 bg-white p-2 text-sm focus:border-zinc-900 focus:outline-none"
      />
      <div className="flex gap-2">
        <button type="submit" className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white">
          Adicionar
        </button>
        <button type="button" onClick={() => setDraft(null)} className="px-2 text-sm text-zinc-600">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function AddColumn({ onAdd }: { onAdd: (title: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return (
      <button
        type="button"
        onClick={() => setDraft("")}
        className="h-fit w-72 shrink-0 rounded-xl border-2 border-dashed border-zinc-300 px-3 py-2.5 text-left text-sm text-zinc-600 hover:border-zinc-400"
      >
        + Nova coluna
      </button>
    );
  }
  return (
    <form
      className="grid h-fit w-72 shrink-0 gap-2 rounded-xl bg-zinc-100 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim()) onAdd(draft.trim());
        setDraft(null);
      }}
    >
      <input
        autoFocus
        name="title"
        aria-label="Nome da coluna"
        maxLength={60}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setDraft(null)}
        className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-zinc-900 focus:outline-none"
      />
      <button type="submit" className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white">
        Criar coluna
      </button>
    </form>
  );
}
