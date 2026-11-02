import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Reusable animated loading spinner with optional full-page overlay mode.
 */
export function Spinner({ size = 'md', fullPage = false, className = '' }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-10 h-10'
  };

  const spinner = (
    <div role="status" className="flex items-center justify-center">
      <Loader2
        className={`animate-spin text-indigo-600 ${sizeClasses[size] || sizeClasses.md} ${className}`}
        aria-hidden="true"
      />
      <span className="sr-only">Loading...</span>
    </div>
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 bg-white/80 backdrop-blur-xs flex items-center justify-center z-50">
        {spinner}
      </div>
    );
  }

  return spinner;
}

