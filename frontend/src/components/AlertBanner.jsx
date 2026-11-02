import React from 'react';
import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react';

/**
 * Dismissible alert notification banner for feedback after create/update/delete operations.
 */
export function AlertBanner({ message, type = 'success', onDismiss, className = '' }) {
  if (!message) return null;

  const styles = {
    success: {
      container: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      icon: CheckCircle2,
      iconColor: 'text-emerald-600'
    },
    info: {
      container: 'bg-indigo-50 border-indigo-200 text-indigo-800',
      icon: Info,
      iconColor: 'text-indigo-600'
    },
    error: {
      container: 'bg-rose-50 border-rose-200 text-rose-800',
      icon: AlertCircle,
      iconColor: 'text-rose-600'
    }
  };

  const current = styles[type] || styles.success;
  const Icon = current.icon;

  return (
    <div
      role="status"
      className={`rounded-xl border p-4 flex items-center justify-between gap-3 shadow-xs ${current.container} ${className}`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`w-5 h-5 shrink-0 ${current.iconColor}`} aria-hidden="true" />
        <span className="text-sm font-medium">{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-slate-400 hover:text-slate-600 p-1 rounded-md focus:outline-hidden"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

