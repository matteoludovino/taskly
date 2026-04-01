'use client';

import type { Task } from '@/types/task';

interface StatsBarProps {
  tasks: Task[];
  total: number;
}

export function StatsBar({ tasks, total }: StatsBarProps) {
  const completedCount = tasks.filter((t) => t.completed).length;
  const pendingCount = tasks.filter((t) => !t.completed).length;
  const highPriorityCount = tasks.filter((t) => t.priority === 'high' && !t.completed).length;

  const completionRate = total > 0
    ? Math.round((tasks.filter((t) => t.completed).length / tasks.length) * 100)
    : 0;

  const stats = [
    { label: 'Total', value: tasks.length, color: 'var(--grad-start)' },
    { label: 'Pendentes', value: pendingCount, color: '#eab308' },
    { label: 'Concluídas', value: completedCount, color: '#22c55e' },
    { label: 'Alta prioridade', value: highPriorityCount, color: '#ef4444' },
  ];

  return (
    <div
      className="rounded-xl p-4 mb-4"
      style={{
        background: 'var(--gradient)',
      }}
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-2xl font-bold text-white leading-none">{s.value}</div>
            <div className="text-xs font-medium text-white/80 mt-0.5">{s.label}</div>
          </div>
        ))}

        <div className="flex-1 min-w-[120px]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-white/80 font-medium">Progresso</span>
            <span className="text-xs text-white font-bold">{completionRate}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-white/30">
            <div
              className="h-2 rounded-full bg-white transition-all duration-500"
              style={{ width: `${completionRate}%` }}
              role="progressbar"
              aria-valuenow={completionRate}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
