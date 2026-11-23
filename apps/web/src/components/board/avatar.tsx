import type { ParticipantState } from "@taskly/shared";

/** First letters of the first and last words, letters only ("Bia (simulada)" → "BS"). */
export function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? (words.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

export function Avatar({
  participant,
  you = false,
  away = false,
}: {
  participant: ParticipantState;
  you?: boolean;
  /** Not on the board right now. */
  away?: boolean;
}) {
  const label = `${participant.name}${you ? " (você)" : ""}${away ? ", fora do quadro" : ", no quadro"}`;
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={`inline-flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-white ${away ? "opacity-35 grayscale" : ""}`}
      style={{ background: participant.color }}
    >
      {initials(participant.name)}
    </span>
  );
}
