import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Alert banner for general form-level errors.
 * Includes an icon alongside color styling so status is never conveyed by color alone.
 */
export function FormError({ message, className = '' }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className={`rounded-lg bg-rose-50 border border-rose-200 p-3 flex items-start gap-2.5 text-sm text-rose-800 ${className}`}
    >
      <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
      <span className="font-medium">{message}</span>
    </div>
  );
}

