import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button.jsx';

/**
 * Accessible server-side pagination bar.
 */
export function Pagination({ page = 1, totalPages = 1, total = 0, onPageChange, className = '' }) {
  if (totalPages <= 1 && total === 0) return null;

  return (
    <nav
      role="navigation"
      aria-label="Pagination Navigation"
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200 ${className}`}
    >
      <div className="text-xs text-slate-500">
        Showing <span className="font-semibold text-slate-700">{total}</span> total application
        {total === 1 ? '' : 's'} &bull; Page <span className="font-semibold text-slate-700">{page}</span> of{' '}
        <span className="font-semibold text-slate-700">{totalPages || 1}</span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="text-xs py-1.5 px-3 flex items-center gap-1"
          aria-label="Go to previous page"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          <span>Previous</span>
        </Button>

        <span className="text-xs font-medium text-slate-600 px-2 sm:hidden">
          {page} / {totalPages || 1}
        </span>

        <Button
          variant="outline"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="text-xs py-1.5 px-3 flex items-center gap-1"
          aria-label="Go to next page"
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

