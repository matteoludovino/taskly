"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardState, ParticipantState } from "@taskly/shared";
import { byDay, describe, timeLabel, type Line, type Piece } from "@/lib/history";
import type { LiveBoard } from "@/lib/live-board";
import { useHistory } from "@/lib/use-history";

function Sentence({ pieces }: { pieces: Piece[] }) {
  return (
    <>
      {pieces.map((piece, i) =>
        typeof piece === "string" ? (
          piece
        ) : (
          <strong key={i} className="font-medium text-zinc-900">
            {piece.strong}
          </strong>
        ),
      )}
    </>
  );
}

/** "Atividade": what happened on the board, in sentences, newest first and live. */
export function ActivityPanel({
  board,
  me,
  live,
  onOpenCard,
}: {
  board: BoardState;
  me: ParticipantState;
  live: LiveBoard | null;
  onOpenCard: (cardId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [startSeq] = useState(board.seq);
  const history = useHistory({ boardId: board.id, live, meId: me.id, startSeq });
  const toggle = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  // Relative times ("há 3 min") move on while the panel is open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, [open]);

  // Escape closes the panel wherever the focus is (unless a card dialog on top takes it).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) show(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function show(next: boolean) {
    setOpen(next);
    setNow(new Date());
    history.markSeen();
    // Focus follows the panel: into it on open, back to the button on close.
    requestAnimationFrame(() => (next ? close.current : toggle.current)?.focus());
  }

  const lines: Line[] = history.events.map((event) => describe(event, board));
  const groups = byDay(lines, now);

  return (
    <>
      <button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls="activity-panel"
        onClick={() => show(!open)}
        className="relative rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
      >
        Atividade
        {!open && history.unread > 0 && (
          <span className="ml-1.5 rounded-full bg-zinc-900 px-1.5 text-xs text-white tabular-nums">
            {history.unread > 99 ? "99+" : history.unread}
            <span className="sr-only">{history.unread === 1 ? " novidade" : " novidades"}</span>
          </span>
        )}
      </button>
      {open && (
        <aside
          id="activity-panel"
          aria-label="Atividade do quadro"
          className="fixed inset-y-0 right-0 z-30 flex w-full flex-col border-l border-zinc-200 bg-white shadow-2xl sm:w-96"
        >
          <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <h2 className="font-semibold">Atividade</h2>
            <button
              ref={close}
              type="button"
              onClick={() => show(false)}
              aria-label="Fechar atividade"
              className="rounded px-2 text-zinc-500 hover:text-zinc-900"
            >
              ✕
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {!history.loaded && history.loading && <p className="text-sm text-zinc-500">Carregando…</p>}
            {!history.loaded && !history.loading && (
              <p className="text-sm text-zinc-600">
                Não deu para carregar a atividade.{" "}
                <button type="button" onClick={history.retry} className="font-medium underline">
                  Tentar de novo
                </button>
              </p>
            )}
            {groups.map((group) => (
              <section key={group.day} className="mb-4" aria-label={group.day}>
                <h3 className="sticky top-0 bg-white py-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  {group.day}
                </h3>
                <ol className="grid gap-1">
                  {group.lines.map((line) => {
                    const person = line.actorId ? board.participants[line.actorId] : undefined;
                    const openable = line.cardId !== null && board.cards[line.cardId] !== undefined;
                    const body = (
                      <>
                        <span
                          aria-hidden
                          className="mt-1.5 size-2 shrink-0 rounded-full"
                          style={{ background: person?.color ?? "#a1a1aa" }}
                        />
                        <span className="min-w-0 flex-1 text-sm text-zinc-700">
                          <Sentence pieces={line.pieces} />
                        </span>
                        <time dateTime={line.at} className="shrink-0 text-xs text-zinc-500 tabular-nums">
                          {timeLabel(line.at, now)}
                        </time>
                      </>
                    );
                    return (
                      <li key={line.seq}>
                        {openable ? (
                          <button
                            type="button"
                            onClick={() => onOpenCard(line.cardId!)}
                            className="flex w-full gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-100"
                          >
                            {body}
                          </button>
                        ) : (
                          <div className="flex gap-2 px-2 py-1.5">{body}</div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
            {history.loaded && history.hasMore && (
              <button
                type="button"
                onClick={history.loadMore}
                disabled={history.loading}
                className="w-full rounded-lg border border-zinc-300 py-2 text-sm hover:bg-zinc-100 disabled:opacity-60"
              >
                {history.loading ? "Carregando…" : "Ver mais antigos"}
              </button>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
