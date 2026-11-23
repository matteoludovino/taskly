"use client";

import Link from "next/link";
import { useState } from "react";
import { useBoard } from "@/lib/use-board";
import { BoardHeader } from "./board-header";
import { ActivityPanel } from "./activity-panel";
import { CardDialog } from "./card-dialog";
import { ConflictTray } from "./conflict-tray";
import { JoinForm } from "./join-form";
import { Kanban } from "./kanban";
import { Notices } from "./notices";

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center gap-3 px-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="text-zinc-600">{children}</div>
      <Link href="/" className="text-sm font-medium text-zinc-900 underline">
        Criar um quadro novo
      </Link>
    </main>
  );
}

export function BoardScreen({ boardId }: { boardId: string }) {
  const {
    phase,
    board,
    me,
    connection,
    online,
    activity,
    tray,
    settle,
    setFocus,
    notices,
    pending,
    submit,
    join,
    reconnectNow,
    live,
  } = useBoard(boardId);
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  switch (phase.kind) {
    case "loading":
      return <p className="p-6 text-zinc-500">Carregando o quadro…</p>;
    case "join":
      return <JoinForm onJoin={(name, color) => join(phase.key, name, color)} />;
    case "no-key":
      return (
        <Message title="Falta o convite">
          Este endereço não tem a chave do quadro. Peça o link completo a quem te convidou.
        </Message>
      );
    case "missing":
      return (
        <Message title="Quadro não encontrado">Ele pode ter expirado ou o link está incompleto.</Message>
      );
    case "error":
      return <Message title="Não deu para abrir o quadro">{phase.message}</Message>;
    case "ready":
      break;
  }
  if (!board || !me) return null;

  const openCard = openCardId ? board.cards[openCardId] : undefined;
  return (
    <div className="flex h-dvh flex-col">
      <BoardHeader
        board={board}
        me={me}
        connection={connection}
        online={online}
        pending={pending}
        onRename={(title) => submit({ type: "board.rename", title })}
        onReconnect={reconnectNow}
      >
        <ConflictTray items={tray} board={board} onSettle={settle} />
        <ActivityPanel board={board} me={me} live={live} onOpenCard={setOpenCardId} />
      </BoardHeader>
      {connection === "outdated" && (
        <p
          role="alert"
          className="flex items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-950"
        >
          Há uma versão nova do Taskly.
          <button type="button" onClick={() => window.location.reload()} className="font-medium underline">
            Recarregar
          </button>
        </p>
      )}
      <Kanban board={board} activity={activity} onOp={submit} onOpenCard={setOpenCardId} onFocus={setFocus} />
      {openCard && (
        <CardDialog
          board={board}
          card={openCard}
          others={activity.filter((a) => a.cardId === openCard.id)}
          live={live}
          me={me}
          conflicts={tray.filter((item) => "cardId" in item && item.cardId === openCard.id)}
          onSettle={settle}
          onOp={submit}
          onFocus={setFocus}
          onClose={() => setOpenCardId(null)}
        />
      )}
      <Notices notices={notices} />
    </div>
  );
}
