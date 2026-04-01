'use client';

import type { FilterType } from '@/types/task';
import type { AppTheme } from '@/lib/offline';

interface FilterBarProps {
  theme: AppTheme;
  filter: FilterType;
  q: string;
  total: number;
  onFilterChange: (f: FilterType) => void;
  onSearch: (q: string) => void;
}

const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'completed', label: 'Concluídas' },
];

export function FilterBar({ theme, filter, q, total, onFilterChange, onSearch }: FilterBarProps) {
  const btnClass = `${theme}-button`;
  const inputClass = `${theme}-input`;

  return (
    <>
      <div className="search-wrap">
        <input
          type="search"
          className={`search-input ${inputClass}`}
          placeholder="Buscar tarefas…"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Buscar tarefas"
        />
      </div>
      <div className="filter-bar">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`filter-btn ${btnClass} ${filter === f.value ? 'active' : ''}`}
            onClick={() => onFilterChange(f.value)}
            aria-pressed={filter === f.value}
          >
            {f.label}
          </button>
        ))}
        <span style={{ fontSize: '13px', opacity: 0.6, alignSelf: 'center' }}>
          {total} tarefa{total !== 1 ? 's' : ''}
        </span>
      </div>
    </>
  );
}
