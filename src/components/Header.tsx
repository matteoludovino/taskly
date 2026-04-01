'use client';

import { useState, useEffect } from 'react';
import type { AppTheme } from '@/lib/offline';

interface HeaderProps {
  theme: AppTheme;
  onThemeChange: (t: AppTheme) => void;
  isOnline: boolean;
  syncing: boolean;
  onSync: () => void;
}

export function Header({ theme, onThemeChange, isOnline, syncing, onSync }: HeaderProps) {
  const [datetime, setDatetime] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setDatetime(
        now.toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const inputClass = `${theme}-input`;
  const btnClass = `${theme}-button`;

  return (
    <div id="header">
      <div className="header-controls">
        <span className={`online-indicator ${isOnline ? 'online' : 'offline'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h.01"></path><path d="M2 8.82a15 15 0 0 1 20 0"></path><path d="M5 12.859a10 10 0 0 1 14 0"></path><path d="M8.5 16.429a5 5 0 0 1 7 0"></path></svg>
          <span>{isOnline ? 'Online' : 'Offline'}</span>
        </span>

        <button
          className={`sync-button ${theme}-button ${syncing ? 'active' : ''}`}
          onClick={onSync}
          disabled={!isOnline || syncing}
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg>
          <span>{syncing ? 'Sincronizando...' : 'Sincronizar'}</span>
        </button>

        <button
          className="theme-toggle"
          onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
          type="button"
          aria-label="Alternar tema"
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
              <path
                d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z"
                fill="currentColor"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="5" fill="currentColor" />
              <path
                d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      <h1 id="title" className={theme === 'dark' ? 'dark-title' : ''}>
        Taskly.
      </h1>

      <p id="datetime">{datetime}</p>
    </div>
  );
}
