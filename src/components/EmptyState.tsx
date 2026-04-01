'use client';

import type { FilterType } from '@/types/task';

interface EmptyStateProps {
  filter: FilterType;
  hasSearch: boolean;
}

export function EmptyState({ filter, hasSearch }: EmptyStateProps) {
  const messages: Record<string, { emoji: string; title: string; sub: string }> = {
    search: {
      emoji: '🔍',
      title: 'Nenhuma tarefa encontrada',
      sub: 'Tente buscar com outros termos.',
    },
    completed: {
      emoji: '🏆',
      title: 'Nenhuma tarefa concluída ainda',
      sub: 'Conclua suas tarefas pendentes para vê-las aqui.',
    },
    pending: {
      emoji: '🎉',
      title: 'Tudo em dia!',
      sub: 'Não há tarefas pendentes. Bom trabalho!',
    },
    all: {
      emoji: '✨',
      title: 'Nenhuma tarefa ainda',
      sub: 'Crie sua primeira tarefa usando o formulário acima.',
    },
  };

  const key = hasSearch ? 'search' : filter;
  const msg = messages[key] ?? messages.all;

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-4" role="img" aria-label={msg.title}>
        {msg.emoji}
      </div>
      <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>
        {msg.title}
      </h3>
      <p className="text-sm" style={{ color: 'var(--text-muted)', maxWidth: '260px' }}>
        {msg.sub}
      </p>
    </div>
  );
}
