'use client';

import type { AppTheme } from '@/lib/offline';

interface PaginationProps {
  page: number;
  totalPages: number;
  theme: AppTheme;
  onPageChange: (p: number) => void;
}

export function Pagination({ page, totalPages, theme, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;
  const btnClass = `${theme}-button`;

  const pages: (number | '…')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('…');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('…');
    pages.push(totalPages);
  }

  return (
    <div className="pagination" role="navigation" aria-label="Pagination">
      <button className={`page-btn ${btnClass}`} onClick={() => onPageChange(page - 1)} disabled={page === 1} aria-label="Previous">
        ‹
      </button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} style={{ alignSelf: 'center', opacity: 0.5 }}>…</span>
        ) : (
          <button
            key={p}
            className={`page-btn ${btnClass} ${p === page ? 'active' : ''}`}
            onClick={() => onPageChange(p as number)}
            aria-current={p === page ? 'page' : undefined}
            style={{ fontWeight: p === page ? 400 : 300 }}
          >
            {p}
          </button>
        )
      )}
      <button className={`page-btn ${btnClass}`} onClick={() => onPageChange(page + 1)} disabled={page === totalPages} aria-label="Next">
        ›
      </button>
    </div>
  );
}
