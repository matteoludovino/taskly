import { Suspense } from "react";
import { BoardScreen } from "@/components/board/board-screen";

export default function BoardPage({ params }: PageProps<"/b/[boardId]">) {
  return (
    <Suspense fallback={<p className="p-6 text-zinc-500">Carregando o quadro…</p>}>
      {params.then(({ boardId }) => (
        <BoardScreen boardId={boardId} />
      ))}
    </Suspense>
  );
}
