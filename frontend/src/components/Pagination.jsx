import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button.jsx';

/**
 * Accessible server-side pagination bar styled with DevOpsPulse design tokens.
 */
export function Pagination({ page = 1, totalPages = 1, total = 0, onPageChange, itemLabel = 'record', className = '' }) {
  if (totalPages <= 1 && total === 0) return null;

  return (
    <nav
      role="navigation"
      aria-label="Pagination Navigation"
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[#e2e8f0] ${className}`}
    >
      <div className="text-xs text-[#5a4136]">
        Showing <span className="font-semibold text-[#131b2e]">{total}</span> total {itemLabel}
        {total === 1 ? '' : 's'} &bull; Page <span className="font-semibold text-[#131b2e]">{page}</span> of{' '}
        <span className="font-semibold text-[#131b2e]">{totalPages || 1}</span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="text-xs py-1.5 px-3 flex items-center gap-1 min-h-[36px]"
          aria-label="Go to previous page"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          <span>Previous</span>
        </Button>

        <span className="text-xs font-medium text-[#5a4136] px-2 sm:hidden">
          {page} / {totalPages || 1}
        </span>

        <Button
          variant="outline"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="text-xs py-1.5 px-3 flex items-center gap-1 min-h-[36px]"
          aria-label="Go to next page"
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
