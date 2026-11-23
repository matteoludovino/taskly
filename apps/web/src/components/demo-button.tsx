"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CreateBoardResponse } from "@taskly/shared";
import { api, ApiFailure } from "@/lib/api";
import { inviteLink, rememberKey } from "@/lib/board-keys";

/** One click to a demo board of your own, with a simulated teammate already at work. */
export function DemoButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    // A sleeping free-plan server takes a while: say so instead of looking stuck.
    const timer = setTimeout(() => setSlow(true), 3000);
    try {
      const { boardId, key } = await api<CreateBoardResponse>("/demo", { method: "POST" });
      rememberKey(boardId, key);
      router.push(inviteLink("", boardId, key));
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : "Não foi possível abrir a demo.");
      setBusy(false);
    } finally {
      clearTimeout(timer);
      setSlow(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="justify-self-start rounded-lg bg-zinc-900 px-5 py-3 font-medium text-white hover:bg-zinc-700 disabled:opacity-70"
      >
        {busy ? "Preparando o seu quadro…" : "Experimentar a demo"}
      </button>
      <p className="text-sm text-zinc-600" role="status">
        {error ??
          (slow
            ? "Acordando o servidor gratuito: pode levar uns 40 segundos."
            : "Um quadro só seu, com a Bia, uma colega simulada que mexe nos cartões enquanto você olha. Abra o link em outra aba para ver o tempo real dos dois lados.")}
      </p>
    </div>
  );
}
