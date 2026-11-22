"use client";

import { useEffect, useState } from "react";
import { checkServer, type ServerState } from "@/lib/health";

const LABELS: Record<ServerState | "checking", { text: string; dot: string }> = {
  checking: { text: "Acordando o servidor (pode levar uns 40 s)…", dot: "bg-amber-500 animate-pulse" },
  online: { text: "Servidor online", dot: "bg-emerald-600" },
  offline: { text: "Servidor indisponível no momento", dot: "bg-red-600" },
  outdated: { text: "Há uma versão nova do Taskly: recarregue a página", dot: "bg-amber-500" },
};

/** Calls /api/health as soon as the page opens: on a free instance, that wakes the server up early. */
export function ServerStatus() {
  const [state, setState] = useState<ServerState | "checking">("checking");

  useEffect(() => {
    const controller = new AbortController();
    checkServer(fetch, controller.signal).then((result) => {
      if (!controller.signal.aborted) setState(result);
    });
    return () => controller.abort();
  }, []);

  const label = LABELS[state];
  return (
    <p className="inline-flex items-center gap-2 text-sm text-zinc-600" role="status">
      <span aria-hidden className={`size-2 rounded-full ${label.dot}`} />
      {label.text}
    </p>
  );
}
