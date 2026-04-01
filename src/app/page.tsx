'use client';

import { useState, useCallback, useEffect } from 'react';
import { Header } from '@/components/Header';
import { FilterBar } from '@/components/FilterBar';
import { CreateTaskForm } from '@/components/CreateTaskForm';
import { TaskCard } from '@/components/TaskCard';
import { EditTaskModal } from '@/components/EditTaskModal';
import { Pagination } from '@/components/Pagination';
import { ToastContainer, useToast } from '@/components/Toast';
import { useTasks } from '@/hooks/useTasks';
import { getTheme, setTheme, type AppTheme } from '@/lib/offline';
import type { Task } from '@/types/task';

export default function Home() {
  const [theme, setThemeState] = useState<AppTheme>('dark');
  const [mounted, setMounted] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const { toasts, addToast, dismiss } = useToast();

  const {
    tasks, loading, syncing, filter, q, page, totalPages, total, isOnline,
    setFilter, setQ, setPage,
    sync, createTask, updateTask, deleteTask, toggleTask,
  } = useTasks();

  useEffect(() => {
    const stored = getTheme();
    setThemeState(stored);
    document.body.className = stored;
    setMounted(true);
  }, []);

  const handleThemeChange = useCallback((t: AppTheme) => {
    setThemeState(t);
    setTheme(t);
    document.body.className = t;
  }, []);

  const handleCreate = useCallback(async (input: Parameters<typeof createTask>[0]) => {
    const result = await createTask(input);
    if (result) addToast('Tarefa adicionada!', 'success');
    else addToast('Falha ao adicionar tarefa.', 'error');
    return result;
  }, [createTask, addToast]);

  const handleToggle = useCallback(async (id: string, completed: boolean) => {
    await toggleTask(id, completed);
    addToast(completed ? 'Pronto! 🎉' : 'Tarefa reaberta!', 'success');
  }, [toggleTask, addToast]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteTask(id);
    addToast('Tarefa excluída!', 'info');
  }, [deleteTask, addToast]);

  const handleSave = useCallback(async (id: string, data: Parameters<typeof updateTask>[1]) => {
    const result = await updateTask(id, data);
    addToast('Tarefa atualizada!', 'success');
    return result ?? {};
  }, [updateTask, addToast]);

  if (!mounted) return null;

  return (
    <>
      <Header
        theme={theme}
        onThemeChange={handleThemeChange}
        isOnline={isOnline}
        syncing={syncing}
        onSync={sync}
      />

      <div id="form" style={{ width: '100%' }}>
        <CreateTaskForm theme={theme} onSubmit={handleCreate} />
      </div>

      {!isOnline && (
        <p style={{ fontSize: '13px', opacity: 0.7, marginBottom: '8px', textAlign: 'center' }}>
          📡 Offline — as alterações serão sincronizadas em breve.
        </p>
      )}

      <FilterBar
        theme={theme}
        filter={filter}
        q={q}
        total={total}
        onFilterChange={(f) => { setFilter(f); setPage(1); }}
        onSearch={(s) => { setQ(s); setPage(1); }}
      />

      <div id="myUnOrdList">
        <ul className="todo-list">
          {loading ? (
            <li style={{ textAlign: 'center', opacity: 0.5, padding: '2rem', listStyle: 'none' }}>
              Carregando tarefas…
            </li>
          ) : tasks.length === 0 ? (
            <li className="empty-state" style={{ listStyle: 'none' }}>
              {q ? 'No tasks found.' : filter === 'completed' ? 'No completed tasks yet.' : filter === 'pending' ? 'All done! 🎉' : 'Add your first task above.'}
            </li>
          ) : (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                theme={theme}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onEdit={setEditingTask}
              />
            ))
          )}
        </ul>
      </div>

      <Pagination page={page} totalPages={totalPages} theme={theme} onPageChange={setPage} />

      <EditTaskModal
        task={editingTask}
        theme={theme}
        onClose={() => setEditingTask(null)}
        onSave={handleSave}
      />

      <ToastContainer toasts={toasts} theme={theme} onDismiss={dismiss} />
    </>
  );
}
