import type { ParticipantState } from "@taskly/shared";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

export function Avatar({ participant, you = false }: { participant: ParticipantState; you?: boolean }) {
  return (
    <span
      title={you ? `${participant.name} (você)` : participant.name}
      className="inline-flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-white"
      style={{ background: participant.color }}
    >
      {initials(participant.name)}
    </span>
  );
}
