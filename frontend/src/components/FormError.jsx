import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Alert banner for general form-level errors.
 * Includes an icon alongside color styling so status is never conveyed by color alone.
 * Uses DevOpsPulse design tokens.
 */
export function FormError({ message, className = '' }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className={`rounded-lg bg-[#ffdad6]/70 border border-[#ffb4ab] p-3 flex items-start gap-2.5 text-sm text-[#93000a] ${className}`}
    >
      <AlertCircle className="w-5 h-5 text-[#ba1a1a] shrink-0 mt-0.5" aria-hidden="true" />
      <span className="font-medium text-[#131b2e]">{message}</span>
    </div>
  );
}
