'use client';

import type { Task, CreateTaskInput } from '@/types/task';

const STORAGE_KEY = 'todo_offline_queue';
const TASKS_CACHE_KEY = 'todo_tasks_cache';
const THEME_KEY = 'todo_theme';

export type AppTheme = 'light' | 'dark';

export type OfflineAction =
  | { type: 'create'; payload: CreateTaskInput; tempId: string }
  | { type: 'update'; payload: Partial<Task> & { id: string } }
  | { type: 'delete'; payload: { id: string } };

export function getTheme(): AppTheme {
  if (typeof window === 'undefined') return 'dark';
  return (localStorage.getItem(THEME_KEY) as AppTheme) ?? 'dark';
}

export function setTheme(theme: AppTheme) {
  localStorage.setItem(THEME_KEY, theme);
}

export function getOfflineQueue(): OfflineAction[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}

export function addToOfflineQueue(action: OfflineAction) {
  const queue = getOfflineQueue();
  queue.push(action);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function clearOfflineQueue() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getCachedTasks(): Task[] {
  try { return JSON.parse(localStorage.getItem(TASKS_CACHE_KEY) ?? '[]'); } catch { return []; }
}

export function setCachedTasks(tasks: Task[]) {
  localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(tasks));
}

export async function syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0, failed = 0;
  const remaining: OfflineAction[] = [];

  for (const action of queue) {
    try {
      let res: Response;
      if (action.type === 'create') {
        res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action.payload) });
      } else if (action.type === 'update') {
        const { id, ...rest } = action.payload;
        res = await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rest) });
      } else {
        res = await fetch(`/api/tasks/${action.payload.id}`, { method: 'DELETE' });
      }
      if (res.ok) synced++; else { failed++; remaining.push(action); }
    } catch { failed++; remaining.push(action); }
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
  return { synced, failed };
}
