"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  enqueue,
  localBoard,
  refresh,
  settle,
  uuidv7,
  view,
  type BoardSnapshot,
  type LocalBoard,
  type Operation,
  type OpResult,
  type ParticipantState,
  type RejectCode,
} from "@taskly/shared";
import { api, ApiFailure } from "./api";
import { keyFromHash, knownKey, rememberKey } from "./board-keys";

export type Phase =
  | { kind: "loading" }
  | { kind: "join"; key: string }
  | { kind: "no-key" }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

export type Saving = "idle" | "saving" | "failed";

export interface Notice {
  id: number;
  text: string;
}

const REJECTIONS: Record<RejectCode, string> = {
  not_found: "Esse item não existe mais.",
  deleted: "Alguém excluiu esse cartão antes da sua mudança chegar.",
  column_deleted: "Essa coluna foi excluída por outra pessoa.",
  column_not_empty: "Só dá para excluir colunas vazias.",
  exists: "Esse item já existe.",
};

type Loaded =
  | { kind: "ready"; snapshot: BoardSnapshot }
  | { kind: "join"; key: string }
  | { kind: "no-key" }
  | { kind: "missing" }
  | { kind: "failed"; message: string };

async function fetchBoard(boardId: string): Promise<Loaded> {
  try {
    const snapshot = await api<BoardSnapshot>(`/boards/${boardId}`);
    const key = keyFromHash(window.location.hash);
    if (key) rememberKey(boardId, key);
    return { kind: "ready", snapshot };
  } catch (failure) {
    const error = failure instanceof ApiFailure ? failure : new ApiFailure(0, "unknown", "Algo deu errado.");
    if (error.status === 401) {
      const key = keyFromHash(window.location.hash) ?? knownKey(boardId);
      return key ? { kind: "join", key } : { kind: "no-key" };
    }
    if (error.status === 404) return { kind: "missing" };
    return { kind: "failed", message: error.message };
  }
}

/**
 * A board as this browser sees it. Operations are sent one at a time, in order (a card's creation
 * before its rename), and shown immediately; the server's answers settle them. Other people's changes
 * arrive when the board is refreshed (live updates come with the WebSocket).
 */
export function useBoard(boardId: string) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [local, setLocal] = useState<LocalBoard | null>(null);
  const [me, setMe] = useState<ParticipantState | null>(null);
  const [saving, setSaving] = useState<Saving>("idle");
  const [notices, setNotices] = useState<Notice[]>([]);
  const localRef = useRef<LocalBoard | null>(null);
  const sending = useRef(false);
  const noticeId = useRef(0);

  const update = useCallback((change: (current: LocalBoard | null) => LocalBoard | null) => {
    localRef.current = change(localRef.current);
    setLocal(localRef.current);
  }, []);

  const notify = useCallback((text: string) => {
    const id = ++noticeId.current;
    setNotices((all) => [...all, { id, text }]);
    setTimeout(() => setNotices((all) => all.filter((n) => n.id !== id)), 6000);
  }, []);

  const show = useCallback(
    (loaded: Loaded) => {
      switch (loaded.kind) {
        case "ready":
          setMe(loaded.snapshot.me);
          update((current) =>
            current ? refresh(current, loaded.snapshot.board) : localBoard(loaded.snapshot.board),
          );
          setPhase({ kind: "ready" });
          return;
        case "failed":
          if (localRef.current) notify(loaded.message);
          else setPhase({ kind: "error", message: loaded.message });
          return;
        default:
          setPhase(loaded);
      }
    },
    [notify, update],
  );

  const load = useCallback(async () => show(await fetchBoard(boardId)), [boardId, show]);

  useEffect(() => {
    let current = true;
    fetchBoard(boardId).then((loaded) => current && show(loaded));
    return () => {
      current = false;
    };
  }, [boardId, show]);

  const pump = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      while (localRef.current && localRef.current.pending.length > 0) {
        const envelope = localRef.current.pending[0]!;
        setSaving("saving");
        let result: OpResult;
        try {
          result = await api<OpResult>(`/boards/${boardId}/ops`, { body: envelope });
        } catch (failure) {
          if (failure instanceof ApiFailure && failure.status === 400) {
            // Malformed by our own bug: it will never pass, so don't block what comes after it.
            update((current) => current && { ...current, pending: current.pending.slice(1) });
            notify("Uma mudança não pôde ser salva.");
            continue;
          }
          if (failure instanceof ApiFailure && failure.status === 401) await load();
          setSaving("failed");
          return;
        }
        const settled = settle(localRef.current, envelope.clientOpId, result);
        update(() => settled.local);
        if (settled.rejected) notify(REJECTIONS[settled.rejected]);
        if (settled.stale) await load();
      }
      setSaving("idle");
    } finally {
      sending.current = false;
    }
  }, [boardId, load, notify, update]);

  const submit = useCallback(
    (op: Operation) => {
      update((current) => current && enqueue(current, { clientOpId: uuidv7(), op }));
      void pump();
    },
    [pump, update],
  );

  const join = useCallback(
    async (key: string, name: string, color: string) => {
      await api(`/boards/${boardId}/join`, { body: { key, name, color } });
      rememberKey(boardId, key);
      await load();
    },
    [boardId, load],
  );

  const board = useMemo(() => (local ? view(local, me?.id ?? null) : null), [local, me]);

  return {
    phase,
    board,
    me,
    saving,
    notices,
    pending: local?.pending.length ?? 0,
    submit,
    join,
    refresh: load,
    retry: pump,
  };
}
