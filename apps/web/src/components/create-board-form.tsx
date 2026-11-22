"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CreateBoardResponse } from "@taskly/shared";
import { api, ApiFailure } from "@/lib/api";
import { inviteLink, rememberKey } from "@/lib/board-keys";
import { ParticipantFields } from "./participant-fields";

export function CreateBoardForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>("#2563eb");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { boardId, key } = await api<CreateBoardResponse>("/boards", { body: { title, name, color } });
      rememberKey(boardId, key);
      router.push(inviteLink("", boardId, key));
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : "Não foi possível criar o quadro.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Criar um quadro</h2>
      <label className="grid gap-1 text-sm font-medium text-zinc-700">
        Nome do quadro
        <input
          required
          maxLength={80}
          placeholder="Ex.: Sprint 12, Mudança de casa"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base font-normal text-zinc-900 focus:border-zinc-900 focus:outline-none"
        />
      </label>
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
        {busy ? "Criando…" : "Criar quadro"}
      </button>
      <p className="text-xs text-zinc-500">
        Sem cadastro: quem tiver o link entra escolhendo um nome. Guarde o link para voltar.
      </p>
    </form>
  );
}
