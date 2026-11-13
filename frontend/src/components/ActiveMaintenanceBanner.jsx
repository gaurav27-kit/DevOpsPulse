import React, { useState, useEffect } from 'react';
import { Wrench, Clock, User, AlertCircle, StopCircle } from 'lucide-react';
import { Button } from './Button.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { formatDateTime } from '../utils/formatDate.js';

/**
 * Format milliseconds into human-readable remaining time string.
 */
function formatRemainingTime(ms) {
  if (ms <= 0) return 'Scheduled time elapsed';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m remaining`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s remaining`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s remaining`;
  }
  return `${seconds}s remaining`;
}

/**
 * Prominent banner displayed when an application is currently under Active Maintenance.
 */
export function ActiveMaintenanceBanner({ activeWindow, onEndMaintenance, isEnding }) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [remainingText, setRemainingText] = useState('');

  useEffect(() => {
    if (!activeWindow?.endAt) return;

    const updateRemaining = () => {
      const diff = new Date(activeWindow.endAt).getTime() - Date.now();
      setRemainingText(formatRemainingTime(diff));
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [activeWindow?.endAt]);

  if (!activeWindow) return null;

  return (
    <>
      <div
        className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 via-indigo-50/50 to-white p-5 shadow-sm transition-all"
        role="region"
        aria-label="Active Maintenance Notice"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <Wrench className="h-5 w-5 animate-pulse" aria-hidden="true" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-ping" />
                  Active Maintenance Mode
                </span>

                <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-900 bg-white/80 px-2 py-0.5 rounded border border-blue-200">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>{remainingText}</span>
                </span>
              </div>

              <p className="text-sm font-medium text-slate-800">
                {activeWindow.reason || 'Scheduled service maintenance in progress.'}
              </p>

              <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap pt-0.5">
                <span>
                  Started: <strong className="font-semibold text-slate-700">{formatDateTime(activeWindow.startAt)}</strong>
                </span>
                <span>•</span>
                <span>
                  Ends: <strong className="font-semibold text-slate-700">{formatDateTime(activeWindow.endAt)}</strong>
                </span>
                {activeWindow.createdBy?.name && (
                  <>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3 h-3" />
                      <span>{activeWindow.createdBy.name}</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
            <Button
              variant="outline"
              onClick={() => setIsConfirmOpen(true)}
              disabled={isEnding}
              className="text-xs py-1.5 px-3.5 border-blue-300 text-blue-700 hover:bg-blue-100/60 font-semibold"
            >
              <StopCircle className="w-3.5 h-3.5 mr-1 text-blue-600" />
              <span>End Maintenance</span>
            </Button>
          </div>
        </div>

        <div className="mt-3.5 pt-3 border-t border-blue-100/80 flex items-center gap-2 text-xs text-blue-700/90">
          <AlertCircle className="w-4 h-4 shrink-0 text-blue-500" />
          <span>
            Telemetry and checks continue in the background. Outbound incident alerts are suppressed until maintenance concludes.
          </span>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="End Maintenance Mode?"
        message="Ending maintenance will restore normal incident evaluation. If the application is unhealthy, an incident will be opened and alerts will be dispatched."
        confirmText="End Maintenance Now"
        cancelText="Keep in Maintenance"
        variant="primary"
        isLoading={isEnding}
        onConfirm={async () => {
          await onEndMaintenance(activeWindow._id);
          setIsConfirmOpen(false);
        }}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </>
  );
}

