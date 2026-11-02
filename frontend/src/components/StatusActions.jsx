import React, { useState } from 'react';
import { Search, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useChangeIncidentStatus } from '../hooks/useIncidents.js';
import { Button } from './Button.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { Spinner } from './Spinner.jsx';

/**
 * Lifecycle action buttons for an incident.
 * Enforces state machine transitions:
 *   open -> investigating
 *   open -> resolved
 *   investigating -> resolved
 *   resolved -> read-only
 *
 * Handles HTTP 409 conflicts gracefully with informative feedback and auto-refresh.
 */
export function StatusActions({ incident, onRefetch }) {
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolveNote, setResolveNote] = useState('');
  const [actionError, setActionError] = useState(null);

  const changeStatusMutation = useChangeIncidentStatus(incident?._id);

  if (!incident) return null;

  const currentStatus = incident.status;

  const handleMarkInvestigating = async () => {
    setActionError(null);
    try {
      await changeStatusMutation.mutateAsync({ status: 'investigating' });
    } catch (err) {
      if (err.statusCode === 409) {
        setActionError('Status conflict: This incident was updated elsewhere. Refreshing...');
        onRefetch?.();
      } else {
        setActionError(err.message || 'Failed to update status.');
      }
    }
  };

  const handleConfirmResolve = async () => {
    setActionError(null);
    try {
      await changeStatusMutation.mutateAsync({
        status: 'resolved',
        note: resolveNote.trim() || undefined
      });
      setIsResolveModalOpen(false);
      setResolveNote('');
    } catch (err) {
      if (err.statusCode === 409) {
        setActionError('Status conflict: This incident is already resolved or its status changed. Refreshing...');
        setIsResolveModalOpen(false);
        onRefetch?.();
      } else {
        setActionError(err.message || 'Failed to resolve incident.');
      }
    }
  };

  if (currentStatus === 'resolved') {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
        <span>Resolved incidents cannot be changed.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {actionError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">{actionError}</p>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-500 hover:text-rose-700 font-bold ml-1 cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {currentStatus === 'open' && (
          <Button
            type="button"
            variant="outline"
            onClick={handleMarkInvestigating}
            disabled={changeStatusMutation.isPending}
            className="text-xs py-1.5 px-3 flex items-center gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50"
          >
            {changeStatusMutation.isPending ? (
              <Spinner size="sm" />
            ) : (
              <Search className="h-3.5 w-3.5 text-amber-600" />
            )}
            <span>Mark as investigating</span>
          </Button>
        )}

        <Button
          type="button"
          variant="primary"
          onClick={() => setIsResolveModalOpen(true)}
          disabled={changeStatusMutation.isPending}
          className="text-xs py-1.5 px-3 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Resolve incident</span>
        </Button>
      </div>

      {/* Resolution Confirmation Modal */}
      <ConfirmDialog
        isOpen={isResolveModalOpen}
        title="Resolve this incident?"
        description="Marking this incident as resolved indicates the underlying outage or degradation has ceased. Resolved incidents are archived and cannot be reopened."
        confirmText="Confirm Resolution"
        cancelText="Keep open"
        variant="primary"
        isLoading={changeStatusMutation.isPending}
        onConfirm={handleConfirmResolve}
        onClose={() => {
          setIsResolveModalOpen(false);
          setResolveNote('');
        }}
      >
        <div className="space-y-1.5 text-left">
          <label htmlFor="resolve-note-input" className="block text-xs font-medium text-slate-700">
            Resolution note (optional):
          </label>
          <textarea
            id="resolve-note-input"
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            placeholder="Describe what resolved the issue (e.g. rolled back deployment, fixed DNS record)..."
            rows={3}
            maxLength={1000}
            className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
