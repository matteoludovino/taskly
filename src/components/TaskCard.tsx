'use client';

import { useState } from 'react';
import type { Task } from '@/types/task';
import type { AppTheme } from '@/lib/offline';

interface TaskCardProps {
  task: Task;
  theme: AppTheme;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
}

const PRIORITY_LABELS = { low: 'Baixa', med: 'Média', high: 'Alta' } as const;

function formatDue(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', month: 'short', day: 'numeric' });
}

function isOverdue(d?: string | null) {
  if (!d) return false;
  const due = new Date(d + 'T00:00:00');
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return due < now;
}

function isDueSoon(d?: string | null) {
  if (!d) return false;
  const due = new Date(d + 'T00:00:00');
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const diff = (due.getTime() - now.getTime()) / 86400000;
  return diff >= 0 && diff <= 2;
}

export function TaskCard({ task, theme, onToggle, onDelete, onEdit }: TaskCardProps) {
  const [falling, setFalling] = useState(false);
  const btnClass = `${theme}-button`;
  const todoClass = `${theme}-todo`;
  const badgeLightClass = theme === 'light' ? 'light-badge' : '';

  const handleDelete = () => {
    setFalling(true);
    setTimeout(() => onDelete(task.id), 480);
  };

  const overdue = isOverdue(task.dueDate);
  const dueSoon = isDueSoon(task.dueDate);

  return (
    <div className={`todo ${todoClass} ${falling ? 'fall' : ''}`}>
      <li className={task.completed ? 'completed' : ''}>
        {task.title}
        <div className="todo-meta">
          <span className={`todo-badge badge-${task.priority} ${badgeLightClass}`}>
            {PRIORITY_LABELS[task.priority as keyof typeof PRIORITY_LABELS]}
          </span>
          {task.dueDate && (
            <span className={`todo-due ${overdue ? 'overdue' : dueSoon ? 'due-soon' : ''}`}>
              {overdue ? '⚠ ' : '📅 '}
              {formatDue(task.dueDate)}
            </span>
          )}
        </div>
      </li>

      <button
        className={`edit-btn ${btnClass}`}
        onClick={() => onEdit(task)}
        aria-label="Edit task"
        title="Edit"
      >
        <i className="fas fa-pen" style={{ fontSize: '14px', pointerEvents: 'none' }} />
      </button>

      <button
        className={`check-btn ${btnClass}`}
        onClick={() => onToggle(task.id, !task.completed)}
        aria-label={task.completed ? 'Mark as pending' : 'Mark as done'}
        title={task.completed ? 'Reopen' : 'Complete'}
      >
        <i className="fas fa-check" style={{ pointerEvents: 'none' }} />
      </button>

      <button
        className={`delete-btn ${btnClass}`}
        onClick={handleDelete}
        aria-label="Delete task"
        title="Delete"
      >
        <i className="fas fa-trash" style={{ pointerEvents: 'none' }} />
      </button>
    </div>
  );
}
