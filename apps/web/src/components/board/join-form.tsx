"use client";

import { useState } from "react";
import { ApiFailure } from "@/lib/api";
import { ParticipantFields, randomColor } from "../participant-fields";

export function JoinForm({ onJoin }: { onJoin: (name: string, color: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(randomColor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onJoin(name, color);
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : "Não foi possível entrar.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center px-4">
      <form
        onSubmit={submit}
        className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Você foi convidado para um quadro</h1>
        <p className="text-sm text-zinc-600">Escolha como os outros vão te ver.</p>
        <ParticipantFields name={name} color={color} onName={setName} onColor={setColor} />
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-zinc-900 px-4 py-2.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-60"
        >
          {busy ? "Entrando…" : "Entrar no quadro"}
        </button>
      </form>
    </main>
  );
}
