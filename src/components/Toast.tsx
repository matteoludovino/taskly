'use client';

import { useState, useCallback, useEffect } from 'react';
import type { AppTheme } from '@/lib/offline';

export type ToastType = 'success' | 'error' | 'info';
export interface ToastMessage { id: string; type: ToastType; message: string; }

interface ToastContainerProps {
  toasts: ToastMessage[];
  theme: AppTheme;
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, theme, onDismiss }: ToastContainerProps) {
  const modalClass = `${theme}-modal`;
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} modalClass={modalClass} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, modalClass, onDismiss }: { toast: ToastMessage; modalClass: string; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 3000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const icons = { success: '✓', error: '✗', info: 'i' };
  return (
    <div className={`toast-item ${modalClass}`} role="alert" onClick={() => onDismiss(toast.id)}>
      <span>{icons[toast.type]}</span>
      {toast.message}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);
  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  return { toasts, addToast, dismiss };
}
