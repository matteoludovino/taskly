"use client";

import { createContext, useContext } from "react";
import type { Activity, BoardState } from "@taskly/shared";

export interface Marker {
  participantId: string;
  name: string;
  color: string;
  mode: Activity["mode"];
}

/** Who is on each card right now (other people only). */
export const ActivityContext = createContext<ReadonlyMap<string, Marker[]>>(new Map());

export function markersByCard(activity: Activity[], board: BoardState): Map<string, Marker[]> {
  const byCard = new Map<string, Marker[]>();
  for (const a of activity) {
    const person = board.participants[a.participantId];
    const marker = {
      participantId: a.participantId,
      name: person?.name ?? "Alguém",
      color: person?.color ?? "#71717a",
      mode: a.mode,
    };
    const list = byCard.get(a.cardId) ?? [];
    // One marker per person per card (two tabs on the same card show once).
    if (!list.some((m) => m.participantId === a.participantId && m.mode === a.mode)) list.push(marker);
    byCard.set(a.cardId, list);
  }
  return byCard;
}

export function useMarkers(cardId: string): Marker[] {
  return useContext(ActivityContext).get(cardId) ?? [];
}

export const describe = (m: Marker) => `${m.name} ${m.mode === "editing" ? "editando" : "arrastando"}`;

/** Small tags above a card: whose colour, who, doing what. Text in ink; the colour is only the dot. */
export function MarkerTags({ markers }: { markers: Marker[] }) {
  if (markers.length === 0) return null;
  return (
    <div className="mb-1 flex flex-wrap gap-1" aria-hidden>
      {markers.map((m) => (
        <span
          key={`${m.participantId}:${m.mode}`}
          className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-800"
          style={{ borderColor: m.color }}
        >
          <span className="size-1.5 rounded-full" style={{ background: m.color }} />
          {describe(m)}
        </span>
      ))}
    </div>
  );
}
