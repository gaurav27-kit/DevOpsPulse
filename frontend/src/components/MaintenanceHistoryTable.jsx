import React, { useState } from 'react';
import {
  Wrench,
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  StopCircle,
  User,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { formatDateTime } from '../utils/formatDate.js';
import { Button } from './Button.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';

function StatusPill({ status }) {
  switch (status) {
    case 'ACTIVE':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-ping" />
          Active
        </span>
      );
    case 'SCHEDULED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
          <Calendar className="w-3 h-3 text-purple-600" />
          Scheduled
        </span>
      );
    case 'COMPLETED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          Completed
        </span>
      );
    case 'CANCELLED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
          <XCircle className="w-3 h-3 text-slate-500" />
          Cancelled
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">
          {status}
        </span>
      );
  }
}

export function MaintenanceHistoryTable({
  windows = [],
  pagination = { page: 1, limit: 10, total: 0, totalPages: 1 },
  onPageChange,
  onEndWindow,
  isEnding = false
}) {
  const [confirmTarget, setConfirmTarget] = useState(null);

  const handleActionClick = (windowDoc) => {
    setConfirmTarget(windowDoc);
  };

  const handleConfirmAction = async () => {
    if (!confirmTarget) return;
    await onEndWindow(confirmTarget._id);
    setConfirmTarget(null);
  };

  if (!windows || windows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-2">
          <Wrench className="h-5 w-5" />
        </div>
        <h4 className="text-xs font-semibold text-slate-700">No maintenance windows</h4>
        <p className="text-xs text-slate-400 mt-0.5">
          Planned or past maintenance windows will appear here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold">
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Reason / Description</th>
                <th className="py-3 px-4">Scheduled Window</th>
                <th className="py-3 px-4">Created By</th>
                <th className="py-3 px-4">Ended By / At</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {windows.map((w) => {
                const isPendingOrActive = w.status === 'ACTIVE' || w.status === 'SCHEDULED';
                return (
                  <tr key={w._id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusPill status={w.status} />
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <p className="font-medium text-slate-800 line-clamp-2" title={w.reason}>
                        {w.reason}
                      </p>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-[11px] text-slate-500">
                          <span>Start:</span>
                          <span className="font-medium text-slate-700">{formatDateTime(w.startAt)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-500">
                          <span>End:</span>
                          <span className="font-medium text-slate-700">{formatDateTime(w.endAt)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>{w.createdBy?.name || w.createdBy?.email || 'User'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                      {w.endedAt ? (
                        <div className="space-y-0.5">
                          <div className="text-[11px] font-medium text-slate-700">
                            {formatDateTime(w.endedAt)}
                          </div>
                          {w.endedBy ? (
                            <div className="text-[10px] text-slate-400">
                              by {w.endedBy?.name || w.endedBy?.email || 'User'}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400">by System (auto)</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {isPendingOrActive ? (
                        <Button
                          variant="outline"
                          onClick={() => handleActionClick(w)}
                          disabled={isEnding}
                          className={`text-[11px] py-1 px-2.5 h-auto ${
                            w.status === 'ACTIVE'
                              ? 'text-blue-700 hover:bg-blue-50 border-blue-200'
                              : 'text-slate-700 hover:bg-slate-100 border-slate-200'
                          }`}
                        >
                          <StopCircle className="w-3 h-3 mr-1" />
                          <span>{w.status === 'ACTIVE' ? 'End Now' : 'Cancel'}</span>
                        </Button>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-600">
            <div>
              Showing page <span className="font-semibold">{pagination.page}</span> of{' '}
              <span className="font-semibold">{pagination.totalPages}</span> ({pagination.total} total)
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-1 h-7 w-7 flex items-center justify-center"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="p-1 h-7 w-7 flex items-center justify-center"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {confirmTarget && (
        <ConfirmDialog
          isOpen={Boolean(confirmTarget)}
          title={confirmTarget.status === 'ACTIVE' ? 'End Maintenance Mode?' : 'Cancel Scheduled Maintenance?'}
          message={
            confirmTarget.status === 'ACTIVE'
              ? 'Ending maintenance will restore normal incident evaluation. If the application is currently unhealthy, an incident will be opened and alerts dispatched.'
              : 'Are you sure you want to cancel this scheduled maintenance window?'
          }
          confirmText={confirmTarget.status === 'ACTIVE' ? 'End Maintenance Now' : 'Cancel Window'}
          cancelText="Go Back"
          variant={confirmTarget.status === 'ACTIVE' ? 'primary' : 'danger'}
          isLoading={isEnding}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </>
  );
}

