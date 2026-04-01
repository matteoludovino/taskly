'use client';

import { useState } from 'react';
import type { CreateTaskInput, Priority } from '@/types/task';
import type { AppTheme } from '@/lib/offline';

interface CreateTaskFormProps {
  theme: AppTheme;
  onSubmit: (input: CreateTaskInput) => Promise<unknown>;
}

const today = () => new Date().toISOString().split('T')[0];

export function CreateTaskForm({ theme, onSubmit }: CreateTaskFormProps) {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  const inputClass = `${theme}-input`;
  const btnClass = `${theme}-button`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    await onSubmit({ title: title.trim(), priority: 'med' });
    setTitle('');
    setLoading(false);
  };

  return (
    <div id="form">
      <form onSubmit={handleSubmit}>
        <input
          className={`todo-input ${inputClass}`}
          type="text"
          placeholder="Adicione uma tarefa."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={255}
          aria-label="Nova tarefa"
        />
        <button className={`todo-btn ${btnClass}`} type="submit" disabled={loading}>
          {loading ? 'Adicionando…' : 'Adicionar'}
        </button>
      </form>
    </div>
  );
}
