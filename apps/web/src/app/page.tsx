import { ServerStatus } from "@/components/server-status";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Taskly</h1>
      <p className="text-lg text-zinc-700">
        Quadros Kanban colaborativos em tempo real: várias pessoas no mesmo quadro, vendo cada mudança na
        hora, mesmo depois de ficar sem internet.
      </p>
      <p className="text-zinc-600">Os quadros chegam na próxima versão.</p>
      <ServerStatus />
    </main>
  );
}
