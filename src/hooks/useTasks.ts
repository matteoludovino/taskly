'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Task, FilterType, SortType, PaginatedResponse, CreateTaskInput, UpdateTaskInput } from '@/types/task';
import { getCachedTasks, setCachedTasks, addToOfflineQueue, syncOfflineQueue } from '@/lib/offline';

const API = '/api/tasks';

function buildUrl(params: {
  filter: FilterType;
  sort: SortType;
  order: 'asc' | 'desc';
  q: string;
  page: number;
}) {
  const url = new URL(API, window.location.origin);
  if (params.filter === 'completed') url.searchParams.set('completed', 'true');
  if (params.filter === 'pending') url.searchParams.set('completed', 'false');
  url.searchParams.set('sort', params.sort);
  url.searchParams.set('order', params.order);
  if (params.q) url.searchParams.set('q', params.q);
  url.searchParams.set('page', String(params.page));
  url.searchParams.set('limit', '20');
  return url.toString();
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const fetchTasks = useCallback(async (showLoader = true) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    if (showLoader) setLoading(true);
    setError(null);

    if (!navigator.onLine) {
      setTasks(getCachedTasks());
      setLoading(false);
      return;
    }

    try {
      const url = buildUrl({ filter, sort, order, q, page });
      const res = await fetch(url, { signal: abortRef.current.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: PaginatedResponse<Task> = await res.json();
      setTasks(json.data);
      setTotalPages(json.pagination.totalPages);
      setTotal(json.pagination.total);
      setCachedTasks(json.data);
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      setError('Failed to load tasks');
      setTasks(getCachedTasks());
    } finally {
      setLoading(false);
    }
  }, [filter, sort, order, q, page]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = async () => {
      setIsOnline(true);
      const result = await syncOfflineQueue();
      if (result.synced > 0) fetchTasks();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchTasks]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const sync = useCallback(async () => {
    setSyncing(true);
    await syncOfflineQueue();
    await fetchTasks(false);
    setSyncing(false);
  }, [fetchTasks]);

  const createTask = useCallback(async (input: CreateTaskInput): Promise<Task | null> => {
    if (!navigator.onLine) {
      const tempId = `temp_${Date.now()}`;
      addToOfflineQueue({ type: 'create', payload: input, tempId });
      const tempTask: Task = {
        id: tempId,
        ...input,
        completed: false,
        priority: input.priority ?? 'med',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setTasks((prev) => [tempTask, ...prev]);
      return tempTask;
    }

    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to create task');
      }
      const task: Task = await res.json();
      setTasks((prev) => [task, ...prev]);
      setTotal((t) => t + 1);
      return task;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, []);

  const updateTask = useCallback(async (id: string, input: UpdateTaskInput): Promise<Task | null> => {
    if (!navigator.onLine) {
      addToOfflineQueue({ type: 'update', payload: { id, ...input } });
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...input, updatedAt: new Date().toISOString() } : t));
      return null;
    }

    try {
      const res = await fetch(`${API}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to update task');
      }
      const task: Task = await res.json();
      setTasks((prev) => prev.map((t) => t.id === id ? task : t));
      return task;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, []);

  const deleteTask = useCallback(async (id: string): Promise<boolean> => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setTotal((t) => Math.max(0, t - 1));

    if (!navigator.onLine) {
      addToOfflineQueue({ type: 'delete', payload: { id } });
      return true;
    }

    try {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete task');
      return true;
    } catch (err) {
      setError((err as Error).message);
      await fetchTasks(false);
      return false;
    }
  }, [fetchTasks]);

  const toggleTask = useCallback((id: string, completed: boolean) => {
    return updateTask(id, { completed });
  }, [updateTask]);

  return {
    tasks, loading, syncing, error, filter, sort, order, q, page, totalPages, total, isOnline,
    setFilter: (f: FilterType) => { setFilter(f); setPage(1); },
    setSort, setOrder, setQ: (s: string) => { setQ(s); setPage(1); },
    setPage, fetchTasks, sync, createTask, updateTask, deleteTask, toggleTask,
  };
}