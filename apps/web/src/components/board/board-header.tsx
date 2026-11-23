"use client";

import Link from "next/link";
import { useState } from "react";
import type { BoardState, ParticipantState } from "@taskly/shared";
import { inviteLink, knownKey } from "@/lib/board-keys";
import type { Connection } from "@/lib/live-board";
import { Avatar } from "./avatar";
import { InlineEdit } from "./inline-edit";

export function BoardHeader({
  board,
  me,
  connection,
  waking,
  online,
  pending,
  onRename,
  onReconnect,
  children,
}: {
  board: BoardState;
  me: ParticipantState;
  connection: Connection;
  waking: boolean;
  online: string[];
  pending: number;
  onRename: (title: string) => void;
  onReconnect: () => void;
  /** Extra controls (the conflict tray). */
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const key = knownKey(board.id);
  // Who has the board open first; everyone else faded.
  const isOnline = (id: string) => online.includes(id) || id === me.id;
  const participants = Object.values(board.participants).sort(
    (a, b) => Number(isOnline(b.id)) - Number(isOnline(a.id)),
  );
  const here = participants.filter((p) => isOnline(p.id)).length;

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
        <ConnectionStatus
          connection={connection}
          waking={waking}
          pending={pending}
          onReconnect={onReconnect}
        />
        <div
          className="flex -space-x-1"
          role="group"
          aria-label={`${here} de ${participants.length} ${participants.length === 1 ? "pessoa" : "pessoas"} no quadro agora`}
        >
          {participants.slice(0, 6).map((p) => (
            <Avatar key={p.id} participant={p} you={p.id === me.id} away={!isOnline(p.id)} />
          ))}
          {participants.length > 6 && (
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-zinc-200 text-xs ring-2 ring-white">
              +{participants.length - 6}
            </span>
          )}
        </div>
        {children}
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

function ConnectionStatus({
  connection,
  waking,
  pending,
  onReconnect,
}: {
  connection: Connection;
  waking: boolean;
  pending: number;
  onReconnect: () => void;
}) {
  const waiting =
    pending > 0 ? ` · ${pending} ${pending === 1 ? "alteração esperando" : "alterações esperando"}` : "";
  return (
    <p className="mr-auto flex items-center gap-2 text-sm text-zinc-600 sm:mr-0" role="status">
      {connection === "live" ? (
        <>
          <span aria-hidden className="size-2 rounded-full bg-emerald-600" />
          {pending > 0 ? "Salvando…" : "Ao vivo"}
        </>
      ) : waking ? (
        <>
          <span aria-hidden className="size-2 animate-pulse rounded-full bg-amber-500" />
          Acordando o servidor (~40 s)…{waiting}
        </>
      ) : connection === "connecting" ? (
        <>
          <span aria-hidden className="size-2 animate-pulse rounded-full bg-amber-500" />
          Conectando…{waiting}
        </>
      ) : (
        <>
          <span aria-hidden className="size-2 rounded-full bg-red-600" />
          Sem conexão{waiting}
          <button type="button" onClick={onReconnect} className="font-medium text-zinc-900 underline">
            Tentar agora
          </button>
        </>
      )}
    </p>
  );
}
