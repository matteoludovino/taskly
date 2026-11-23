"use client";

import { useCallback, useEffect, useState } from "react";
import type { BoardEvent, HistoryPage } from "@taskly/shared";
import { api } from "./api";
import type { LiveBoard } from "./live-board";

const PAGE = 40;

/**
 * The board's history: older pages over REST when asked, new events as they arrive live. Kept as a
 * map by seq, so repeats (catch-ups, acks) don't duplicate lines. Counts what others did since the
 * person last looked.
 */
export function useHistory({
  boardId,
  live,
  meId,
  startSeq,
}: {
  boardId: string;
  live: LiveBoard | null;
  meId: string;
  /** The board's seq when the page loaded: earlier events don't count as new. */
  startSeq: number;
}) {
  const [events, setEvents] = useState<ReadonlyMap<number, BoardEvent>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [seenSeq, setSeenSeq] = useState(startSeq);

  const add = useCallback((more: BoardEvent[]) => {
    setEvents((current) => {
      const next = new Map(current);
      for (const event of more) next.set(event.seq, event);
      return next;
    });
  }, []);

  const fetchPage = useCallback(
    async (before?: number) => {
      setLoading(true);
      try {
        const query = new URLSearchParams({
          limit: String(PAGE),
          ...(before ? { before: String(before) } : {}),
        });
        const page = await api<HistoryPage>(`/boards/${boardId}/events?${query}`);
        add(page.events);
        // Only the oldest page decides whether there's more further back.
        setHasMore((more) => (before === undefined && loaded ? more : page.hasMore));
        setLoaded(true);
      } catch {
        // The panel offers to try again (loaded stays false, or the button stays).
      } finally {
        setLoading(false);
      }
    },
    [add, boardId, loaded],
  );

  // Live events, always (they feed the unread count). A snapshot or a jump may leave a hole: refetch the
  // latest page if the history is on screen.
  useEffect(() => {
    if (!live) return;
    return live.onEvents((news) => {
      if ("snapshot" in news) {
        if (loaded) void fetchPage();
        return;
      }
      add([news.event]);
    });
  }, [live, add, loaded, fetchPage]);

  const latest = Math.max(startSeq, ...events.keys());

  /** The panel opened or closed: load the latest page the first time, and count everything as seen. */
  const markSeen = useCallback(() => {
    setSeenSeq(latest);
    if (!loaded && !loading) void fetchPage();
  }, [latest, loaded, loading, fetchPage]);

  const unread = [...events.values()].filter((e) => e.seq > seenSeq && e.actorId !== meId).length;
  const oldest = Math.min(...events.keys());

  return {
    events: [...events.values()],
    loaded,
    loading,
    hasMore,
    unread,
    markSeen,
    loadMore: () => void fetchPage(oldest),
    retry: () => void fetchPage(),
  };
}
