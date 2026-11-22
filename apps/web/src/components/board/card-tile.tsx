"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CardState } from "@taskly/shared";
import { formatDue, isOverdue, PRIORITY_LABEL, PRIORITY_STYLE } from "./card-labels";

export function CardFace({ card, lifted = false }: { card: CardState; lifted?: boolean }) {
  const overdue = isOverdue(card);
  return (
    <div
      className={`grid gap-2 rounded-lg border bg-white p-3 text-left text-sm ${
        lifted ? "rotate-2 border-zinc-400 shadow-lg" : "border-zinc-200 shadow-sm"
      }`}
    >
      <p className={`break-words ${card.completed ? "text-zinc-500 line-through" : "text-zinc-900"}`}>
        {card.completed && <span aria-hidden>✓ </span>}
        {card.title}
        {card.completed && <span className="sr-only"> (concluído)</span>}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded px-1.5 py-0.5 font-medium ${PRIORITY_STYLE[card.priority]}`}>
          {PRIORITY_LABEL[card.priority]}
        </span>
        {card.dueDate && (
          <span className={overdue ? "font-medium text-red-700" : "text-zinc-500"}>
            {overdue ? "Atrasado · " : "Prazo "}
            {formatDue(card.dueDate)}
          </span>
        )}
      </div>
    </div>
  );
}

/** A card in its column: drag it (mouse, touch, or Space then arrows), or click / Enter to open it. */
export function CardTile({ card, onOpen }: { card: CardState; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", columnId: card.columnId },
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-40" : ""}
    >
      <div
        {...attributes}
        {...listeners}
        aria-roledescription="cartão arrastável"
        aria-label={card.title}
        onClick={() => onOpen(card.id)}
        onKeyDown={(event) => {
          listeners?.onKeyDown?.(event);
          if (event.key === "Enter" && !event.defaultPrevented) onOpen(card.id);
        }}
        className="cursor-grab rounded-lg focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:outline-none active:cursor-grabbing"
      >
        <CardFace card={card} />
      </div>
    </li>
  );
}
