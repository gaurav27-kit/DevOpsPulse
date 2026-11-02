import React from 'react';
import { Server } from 'lucide-react';

/**
 * Reusable empty state view.
 */
export function EmptyState({
  title = 'No items found',
  description = 'Get started by creating your first entry.',
  icon: Icon = Server,
  action = null,
  className = ''
}) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center max-w-lg mx-auto ${className}`}
    >
      <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 flex items-center justify-center mx-auto mb-4">
        <Icon className="w-6 h-6" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
