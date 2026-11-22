"use client";

import Link from "next/link";
import { useState } from "react";
import type { BoardState, ParticipantState } from "@taskly/shared";
import { inviteLink, knownKey } from "@/lib/board-keys";
import type { Saving } from "@/lib/use-board";
import { Avatar } from "./avatar";
import { InlineEdit } from "./inline-edit";

export function BoardHeader({
  board,
  me,
  saving,
  pending,
  onRename,
  onRefresh,
  onRetry,
}: {
  board: BoardState;
  me: ParticipantState;
  saving: Saving;
  pending: number;
  onRename: (title: string) => void;
  onRefresh: () => void;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const key = knownKey(board.id);
  const participants = Object.values(board.participants);

  async function copyInvite() {
    if (!key) return;
    await navigator.clipboard.writeText(inviteLink(window.location.origin, board.id, key));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 bg-white px-4 py-3">
      <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
        <Link href="/" className="font-semibold text-zinc-900">
          Taskly
        </Link>
        <h1 className="min-w-0 flex-1 text-lg font-semibold">
          <InlineEdit value={board.title} label="Nome do quadro" maxLength={80} onSave={onRename} />
        </h1>
      </div>
      <div className="flex flex-1 flex-wrap items-center justify-end gap-3 sm:flex-none">
        <p className="mr-auto text-sm text-zinc-500 sm:mr-0" role="status">
          {saving === "failed" ? (
            <button type="button" onClick={onRetry} className="text-red-700 underline">
              Não foi possível salvar. Tentar de novo
            </button>
          ) : saving === "saving" || pending > 0 ? (
            "Salvando…"
          ) : (
            "Tudo salvo"
          )}
        </p>
        <div className="flex -space-x-1" aria-label="Pessoas no quadro">
          {participants.slice(0, 6).map((p) => (
            <Avatar key={p.id} participant={p} you={p.id === me.id} />
          ))}
          {participants.length > 6 && (
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-zinc-200 text-xs ring-2 ring-white">
              +{participants.length - 6}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
        >
          Atualizar
        </button>
        {key && (
          <button
            type="button"
            onClick={copyInvite}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            {copied ? "Link copiado" : "Convidar"}
          </button>
        )}
      </div>
    </header>
  );
}
