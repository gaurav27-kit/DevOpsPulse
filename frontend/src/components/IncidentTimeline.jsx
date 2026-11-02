import React from 'react';
import { Bot, MessageSquare, Tag } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { formatDateTime, formatRelative } from '../utils/formatDate.js';

const TYPE_CONFIG = {
  system: {
    label: 'System',
    icon: Bot,
    iconBg: 'bg-slate-100 text-slate-600 border-slate-200'
  },
  note: {
    label: 'Note',
    icon: MessageSquare,
    iconBg: 'bg-blue-50 text-blue-600 border-blue-200'
  },
  status_change: {
    label: 'Status Change',
    icon: Tag,
    iconBg: 'bg-amber-50 text-amber-600 border-amber-200'
  }
};

/**
 * Vertical chronological timeline of incident updates.
 * Renders semantic <ol> with distinct icons and labels for each event type.
 */
export function IncidentTimeline({ updates = [] }) {
  const { user } = useAuth();

  if (!updates || updates.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-slate-500">
        No timeline entries recorded yet.
      </div>
    );
  }

  // Ensure chronological order (oldest to newest)
  const sortedUpdates = [...updates].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );

  return (
    <ol className="relative border-l border-slate-200 ml-4 space-y-6 py-2">
      {sortedUpdates.map((entry, index) => {
        const type = entry.type || 'system';
        const config = TYPE_CONFIG[type] || TYPE_CONFIG.system;
        const Icon = config.icon;

        // Author determination
        let authorLabel = 'System';
        if (entry.author) {
          const currentUserId = user?._id || user?.id;
          const authorId = typeof entry.author === 'object' ? (entry.author._id || entry.author.id) : entry.author;
          authorLabel = String(authorId) === String(currentUserId) ? 'You' : 'Team member';
        }

        return (
          <li key={entry._id || index} className="ml-6">
            {/* Timeline node icon */}
            <span
              className={`absolute -left-3.5 flex h-7 w-7 items-center justify-center rounded-full border bg-white shadow-xs ${config.iconBg}`}
              aria-hidden="true"
            >
              <Icon className="h-3.5 w-3.5" />
            </span>

            {/* Content card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 mb-1.5 pb-1.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="font-semibold uppercase tracking-wider text-2xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    {config.label}
                  </span>
                  <span className="text-slate-400">&bull;</span>
                  <span className="font-medium text-slate-700">{authorLabel}</span>
                </div>
                <div className="text-2xs text-slate-400">
                  <time dateTime={new Date(entry.createdAt).toISOString()} title={formatDateTime(entry.createdAt)}>
                    {formatRelative(entry.createdAt)} ({formatDateTime(entry.createdAt)})
                  </time>
                </div>
              </div>

              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                {entry.message}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
