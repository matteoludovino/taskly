import { CreateBoardForm } from "@/components/create-board-form";
import { DemoButton } from "@/components/demo-button";
import { ServerStatus } from "@/components/server-status";

export default function Home() {
  return (
    <main className="mx-auto grid min-h-screen max-w-5xl content-center gap-10 px-4 py-16 md:grid-cols-[1.2fr_1fr] md:items-center">
      <section className="grid gap-5">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Taskly</h1>
        <p className="text-lg text-zinc-700">
          Quadros Kanban para fazer junto: várias pessoas no mesmo quadro, vendo cada mudança na hora.
        </p>
        <ul className="grid gap-2 text-zinc-600">
          <li>Arraste cartões entre colunas; todo mundo vê onde eles foram parar.</li>
          <li>Escrevam juntos na descrição de um cartão, cada um com o seu cursor.</li>
          <li>Sem internet? Continue editando: tudo se junta quando a conexão volta.</li>
          <li>Entre só com um link e um nome, sem criar conta.</li>
        </ul>
        <DemoButton />
        <ServerStatus />
      </section>
      <CreateBoardForm />
    </main>
  );
}
