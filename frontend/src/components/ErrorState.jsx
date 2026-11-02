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
      className={`rounded-2xl border border-rose-200 bg-rose-50/50 p-8 text-center max-w-lg mx-auto ${className}`}
    >
      <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
        <AlertTriangle className="w-6 h-6" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-rose-900">{title}</h3>
      <p className="mt-1 text-sm text-rose-700 max-w-sm mx-auto">{message}</p>
      {onRetry && (
        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            onClick={onRetry}
            className="text-xs py-2 px-4 flex items-center gap-2 border-rose-300 text-rose-700 hover:bg-rose-100"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Try again</span>
          </Button>
        </div>
      )}
    </div>
  );
}
