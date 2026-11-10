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
      className={`rounded-2xl border border-dashed border-[#dae2fd] bg-white p-8 text-center max-w-lg mx-auto shadow-sm ${className}`}
    >
      <div className="w-14 h-14 rounded-2xl bg-[#f2f3ff] border border-[#e2e8f0] text-[#a23f00] flex items-center justify-center mx-auto mb-4 shadow-xs">
        <Icon className="w-6 h-6" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-[#131b2e]">{title}</h3>
      {description && <p className="mt-1.5 text-sm text-[#5a4136] max-w-sm mx-auto leading-relaxed">{description}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

