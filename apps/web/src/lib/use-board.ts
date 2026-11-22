"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  view,
  type BoardSnapshot,
  type Operation,
  type ParticipantState,
  type RejectCode,
} from "@taskly/shared";
import { api, ApiFailure } from "./api";
import { keyFromHash, knownKey, rememberKey } from "./board-keys";
import { LiveBoard, type LiveState } from "./live-board";

export type Phase =
  | { kind: "loading" }
  | { kind: "join"; key: string }
  | { kind: "no-key" }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

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

const noSubscription = () => () => {};
const nothing = () => null;

/**
 * A board as this browser sees it: the first snapshot comes over REST (which also tells whether this
 * browser has joined), then a live connection keeps it current and carries this person's changes.
 */
export function useBoard(boardId: string) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [me, setMe] = useState<ParticipantState | null>(null);
  const [live, setLive] = useState<LiveBoard | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const liveRef = useRef<LiveBoard | null>(null);
  const noticeId = useRef(0);

  const notify = useCallback((text: string) => {
    const id = ++noticeId.current;
    setNotices((all) => [...all, { id, text }]);
    setTimeout(() => setNotices((all) => all.filter((n) => n.id !== id)), 6000);
  }, []);

  const show = useCallback(
    (loaded: Loaded) => {
      switch (loaded.kind) {
        case "ready": {
          setMe(loaded.snapshot.me);
          liveRef.current?.stop();
          const board = new LiveBoard(boardId, loaded.snapshot.board, {
            onRejected: (code) => notify(REJECTIONS[code]),
            // Back through the REST check, which leads to the join screen.
            onUnauthorized: () =>
              void fetchBoard(boardId).then((again) =>
                setPhase(again.kind === "ready" || again.kind === "failed" ? { kind: "no-key" } : again),
              ),
          });
          liveRef.current = board;
          board.start();
          setLive(board);
          setPhase({ kind: "ready" });
          return;
        }
        case "failed":
          setPhase({ kind: "error", message: loaded.message });
          return;
        default:
          setPhase(loaded);
      }
    },
    [boardId, notify],
  );

  const load = useCallback(async () => show(await fetchBoard(boardId)), [boardId, show]);

  useEffect(() => {
    let current = true;
    fetchBoard(boardId).then((loaded) => current && show(loaded));
    return () => {
      current = false;
      liveRef.current?.stop();
      liveRef.current = null;
    };
  }, [boardId, show]);

  const state: LiveState | null = useSyncExternalStore(
    live?.subscribe ?? noSubscription,
    live?.getSnapshot ?? nothing,
    nothing,
  );

  const connection = state?.connection;

  const submit = useCallback((op: Operation) => live?.submit(op), [live]);

  const join = useCallback(
    async (key: string, name: string, color: string) => {
      await api(`/boards/${boardId}/join`, { body: { key, name, color } });
      rememberKey(boardId, key);
      await load();
    },
    [boardId, load],
  );

  const board = useMemo(() => (state ? view(state.sync, me?.id ?? null) : null), [state, me]);

  return {
    phase: connection === "gone" ? ({ kind: "missing" } as const) : phase,
    board,
    me,
    connection: connection ?? "connecting",
    online: state?.online ?? [],
    pending: state?.sync.pending.length ?? 0,
    notices,
    submit,
    join,
    reconnectNow: () => live?.reconnectNow(),
  };
}
