'use client';

import { useState, useEffect } from 'react';
import type { Task, Priority, UpdateTaskInput } from '@/types/task';
import type { AppTheme } from '@/lib/offline';

interface EditTaskModalProps {
  task: Task | null;
  theme: AppTheme;
  onClose: () => void;
  onSave: (id: string, data: UpdateTaskInput) => Promise<unknown>;
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'low', label: '🟢 Baixa' },
  { value: 'med', label: '🟡 Média' },
  { value: 'high', label: '🔴 Alta' },
];

const today = () => new Date().toISOString().split('T')[0];

export function EditTaskModal({ task, theme, onClose, onSave }: EditTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('med');
  const [dueDate, setDueDate] = useState('');
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(false);

  const inputClass = `${theme}-input`;
  const btnClass = `${theme}-button`;
  const modalClass = `${theme}-modal`;

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? '');
      setPriority(task.priority);
      setDueDate(task.dueDate ?? '');
      setCompleted(task.completed);
    }
  }, [task]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!task) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    await onSave(task.id, {
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      dueDate: dueDate || null,
      completed,
    });
    setLoading(false);
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-title"
    >
      <div className={`modal-box ${modalClass}`}>
        <h2 id="edit-title">Editar tarefa</h2>
        <form onSubmit={handleSubmit}>
          <div className="modal-field">
            <label className="modal-label" htmlFor="m-title">Título*</label>
            <input
              id="m-title"
              className={`modal-input ${inputClass}`}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={255}
              required
              autoFocus
            />
          </div>

          <div className="modal-field">
            <label className="modal-label" htmlFor="m-desc">Descrição</label>
            <textarea
              id="m-desc"
              className={`modal-textarea ${inputClass}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Detalhes opcionais…"
            />
          </div>

          <div className="modal-field" style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label className="modal-label" htmlFor="m-priority">Prioridade</label>
              <select
                id="m-priority"
                className={`modal-select ${inputClass}`}
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="modal-label" htmlFor="m-due">Data de vencimento</label>
              <input
                id="m-due"
                className={`modal-input ${inputClass}`}
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                min={today()}
              />
            </div>
          </div>

          <div className="modal-field" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="checkbox"
              id="m-done"
              checked={completed}
              onChange={(e) => setCompleted(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label htmlFor="m-done" className="modal-label" style={{ margin: 0, cursor: 'pointer' }}>
              Marcar como concluída
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className={`modal-btn ${btnClass}`} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={`modal-btn ${btnClass}`} disabled={loading}
              style={{ fontWeight: 400 }}>
              {loading ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
