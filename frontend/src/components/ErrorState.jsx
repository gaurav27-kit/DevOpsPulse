import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './Button.jsx';

/**
 * Reusable error boundary view with recovery trigger.
 */
export function ErrorState({
  title = 'Failed to load data',
  message = 'An unexpected error occurred while fetching information.',
  onRetry,
  className = ''
}) {
  return (
    <div
      role="alert"
      className={`rounded-2xl border border-[#ffdad6] bg-[#ffdad6]/30 p-8 text-center max-w-lg mx-auto shadow-sm ${className}`}
    >
      <div className="w-14 h-14 rounded-2xl bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center mx-auto mb-4 shadow-xs">
        <AlertTriangle className="w-6 h-6" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-[#93000a]">{title}</h3>
      <p className="mt-1.5 text-sm text-[#93000a]/90 max-w-sm mx-auto leading-relaxed">{message}</p>
      {onRetry && (
        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            onClick={onRetry}
            className="text-xs py-2 px-4 flex items-center gap-2 border-[#ffdad6] text-[#ba1a1a] hover:bg-[#ffdad6]/60 focus:ring-[#ba1a1a]"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Try again</span>
          </Button>
        </div>
      )}
    </div>
  );
}

