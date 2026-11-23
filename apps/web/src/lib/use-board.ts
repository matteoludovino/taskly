"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  initialSync,
  view,
  type BoardSnapshot,
  type SyncState,
  type Focus,
  type Operation,
  type ParticipantState,
  type RejectCode,
} from "@taskly/shared";
import { api, ApiFailure } from "./api";
import { keyFromHash, knownKey, rememberKey } from "./board-keys";
import { addToTray, resolve, trayItemFor, type Resolution, type TrayItem } from "./conflicts";
import { LiveBoard, type LiveState } from "./live-board";
import { cleanUp, forgetBoard, holdBoard, loadBoard, saveBoard } from "./local-store";

export type Phase =
  | { kind: "loading" }
  /** No copy in this browser and the server isn't answering yet (a free-plan server waking up). */
  | { kind: "waking" }
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
  conflict: "Outra pessoa mudou esse campo antes de você.",
};

type Fetched =
  | { kind: "ready"; snapshot: BoardSnapshot }
  | { kind: "join"; key: string }
  | { kind: "no-key" }
  | { kind: "missing" }
  | { kind: "failed"; message: string };

type Loaded =
  | Exclude<Fetched, { kind: "ready" }>
  | { kind: "ready"; sync: SyncState; me: ParticipantState; dropped: number; expiresAt: string | null };

const WAKE_FOR_MS = 120_000;
/**
 * The server isn't there (yet): no response, a gateway error, or a 500 that didn't come from our API
 * (ours always carry an error code; a proxy whose upstream is down doesn't).
 */
const isWaking = (error: ApiFailure) =>
  error.status === 0 ||
  (error.status >= 502 && error.status <= 504) ||
  (error.status === 500 && error.code === "unknown");

/** The board over REST. A server that doesn't answer yet is given two minutes to wake up. */
async function fetchBoard(boardId: string, onWaking: () => void = () => {}): Promise<Fetched> {
  const started = Date.now();
  for (let delay = 1000; ; delay = Math.min(delay * 2, 8000)) {
    try {
      const snapshot = await api<BoardSnapshot>(`/boards/${boardId}`);
      return { kind: "ready", snapshot };
    } catch (failure) {
      const error =
        failure instanceof ApiFailure ? failure : new ApiFailure(0, "unknown", "Algo deu errado.");
      if (error.status === 401) {
        const key = keyFromHash(window.location.hash) ?? knownKey(boardId);
        return key ? { kind: "join", key } : { kind: "no-key" };
      }
      if (error.status === 404) return { kind: "missing" };
      if (!isWaking(error) || Date.now() - started > WAKE_FOR_MS)
        return { kind: "failed", message: error.message };
      onWaking();
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Opens a board: from this browser's saved copy when there is one (shown at once, even offline; the live
 * connection then catches up from it), otherwise over REST. Operations saved but never confirmed are
 * kept either way.
 */
async function openBoard(boardId: string, onWaking: () => void, { fresh = false } = {}): Promise<Loaded> {
  const key = keyFromHash(window.location.hash);
  if (key) rememberKey(boardId, key);
  const saved = await loadBoard(boardId);
  // `fresh` (after joining again): the saved copy belongs to the previous identity; keep only its changes.
  if (saved?.board && !fresh) {
    const { confirmed, settled, me, expiresAt } = saved.board;
    return {
      kind: "ready",
      sync: { ...initialSync(confirmed), pending: saved.pending, settled },
      me,
      dropped: saved.dropped,
      expiresAt,
    };
  }
  const fetched = await fetchBoard(boardId, onWaking);
  if (fetched.kind === "missing") await forgetBoard(boardId);
  if (fetched.kind !== "ready") return fetched;
  return {
    kind: "ready",
    sync: { ...initialSync(fetched.snapshot.board), pending: saved?.pending ?? [] },
    me: fetched.snapshot.me,
    dropped: saved?.dropped ?? 0,
    expiresAt: fetched.snapshot.expiresAt,
  };
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
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [live, setLive] = useState<LiveBoard | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [tray, setTray] = useState<TrayItem[]>([]);
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
          setMe(loaded.me);
          setExpiresAt(loaded.expiresAt);
          if (loaded.dropped > 0) {
            notify(
              `${loaded.dropped} alteração(ões) guardada(s) neste navegador não puderam ser recuperadas.`,
            );
          }
          liveRef.current?.stop();
          const board = new LiveBoard(boardId, loaded.sync, {
            // Rejections the person can act on wait in the tray; the rest pass as a notice.
            onRejected: (rejection) => {
              const item = trayItemFor(rejection);
              if (item) setTray((current) => addToTray(current, item));
              else notify(REJECTIONS[rejection.code]);
            },
            // Back through the REST check, which leads to the join screen. Saved changes stay and go out
            // after joining again.
            onUnauthorized: () =>
              void fetchBoard(boardId).then((again) => {
                if (again.kind === "missing") void forgetBoard(boardId);
                setPhase(again.kind === "ready" || again.kind === "failed" ? { kind: "no-key" } : again);
              }),
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

  const waking = useCallback(() => setPhase((p) => (p.kind === "loading" ? { kind: "waking" } : p)), []);
  const load = useCallback(
    async () => show(await openBoard(boardId, waking, { fresh: true })),
    [boardId, show, waking],
  );

  useEffect(() => {
    let current = true;
    void cleanUp().catch(() => undefined);
    openBoard(boardId, () => current && waking()).then((loaded) => current && show(loaded));
    return () => {
      current = false;
      liveRef.current?.stop();
      liveRef.current = null;
    };
  }, [boardId, show, waking]);

  const state: LiveState | null = useSyncExternalStore(
    live?.subscribe ?? noSubscription,
    live?.getSnapshot ?? nothing,
    nothing,
  );

  const connection = state?.connection;

  // Keep this board in the browser's storage, from one tab at a time: saved shortly after each change,
  // and right away when the page is hidden or closed.
  useEffect(() => {
    if (!live || !me) return;
    return holdBoard(boardId, () => {
      let last = live.getSnapshot().sync;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const save = () => void saveBoard(boardId, me, live.getSnapshot().sync, expiresAt);
      const flush = () => {
        clearTimeout(timer);
        save();
      };
      const stop = live.subscribe(() => {
        const { sync } = live.getSnapshot();
        if (sync === last) return;
        last = sync;
        clearTimeout(timer);
        timer = setTimeout(save, 200);
      });
      window.addEventListener("pagehide", flush);
      save();
      return () => {
        stop();
        window.removeEventListener("pagehide", flush);
        flush();
      };
    });
  }, [boardId, live, me, expiresAt]);

  // Leaving with changes not yet confirmed: ask first (they're also saved, but may not be sent soon).
  const pending = state?.sync.pending.length ?? 0;
  useEffect(() => {
    if (pending === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  // The board is gone for good: nothing to keep.
  useEffect(() => {
    if (connection === "gone") void forgetBoard(boardId);
  }, [connection, boardId]);

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

  const settle = useCallback(
    (item: TrayItem, resolution: Resolution) => {
      if (board) for (const op of resolve(item, resolution, board)) live?.submit(op);
      setTray((current) => current.filter((i) => i.id !== item.id));
    },
    [board, live],
  );

  const setFocus = useCallback((focus: Focus | null) => live?.setFocus(focus), [live]);

  // Others' activity only: this person's own tabs don't need a marker.
  const activity = useMemo(
    () => (state?.activity ?? []).filter((a) => a.participantId !== me?.id),
    [state?.activity, me?.id],
  );

  return {
    phase: connection === "gone" ? ({ kind: "missing" } as const) : phase,
    board,
    me,
    connection: connection ?? "connecting",
    online: state?.online ?? [],
    activity,
    tray,
    settle,
    setFocus,
    pending,
    waking: state?.waking ?? false,
    expiresAt,
    notices,
    submit,
    join,
    reconnectNow: () => live?.reconnectNow(),
    live,
  };
}
