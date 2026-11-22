"use client";

import { useState } from "react";

/** Text that turns into an input on click; Enter or leaving the field saves, Escape cancels. */
export function InlineEdit({
  value,
  label,
  maxLength,
  onSave,
  className = "",
}: {
  value: string;
  label: string;
  maxLength: number;
  onSave: (value: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <button
        type="button"
        onClick={() => setDraft(value)}
        className={`block max-w-full truncate rounded px-1 text-left hover:bg-zinc-200/60 ${className}`}
        title={`${label}: clique para editar`}
      >
        {value}
      </button>
    );
  }

  const commit = () => {
    const next = draft.trim();
    setDraft(null);
    if (next && next !== value) onSave(next);
  };
  return (
    <input
      autoFocus
      name="title"
      aria-label={label}
      maxLength={maxLength}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(null);
      }}
      className={`w-full min-w-0 rounded border border-zinc-400 bg-white px-1 focus:outline-none ${className}`}
    />
  );
}
