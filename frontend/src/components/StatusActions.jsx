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
 * Styled with DevOpsPulse design tokens.
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
      <div className="flex items-center gap-2 text-xs font-semibold text-[#065f46] bg-[#ecfdf5] border border-[#a7f3d0] rounded-lg px-3.5 py-2">
        <CheckCircle2 className="h-4 w-4 text-[#10b981] shrink-0" aria-hidden="true" />
        <span>Resolved incidents cannot be changed.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {actionError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-[#ffdad6] border border-[#ffb4ab] p-3 text-xs text-[#93000a]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-[#ba1a1a] mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">{actionError}</p>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-[#93000a] hover:text-[#ba1a1a] font-bold ml-1 cursor-pointer"
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
            className="text-xs py-1.5 px-3 flex items-center gap-1.5 border-[#fde68a] bg-[#fffbeb] text-[#92400e] hover:bg-[#fef3c7] min-h-[38px] font-semibold"
          >
            {changeStatusMutation.isPending ? (
              <Spinner size="sm" />
            ) : (
              <Search className="h-3.5 w-3.5 text-[#d97706]" />
            )}
            <span>Mark as investigating</span>
          </Button>
        )}

        <Button
          type="button"
          variant="primary"
          onClick={() => setIsResolveModalOpen(true)}
          disabled={changeStatusMutation.isPending}
          className="text-xs py-1.5 px-3.5 flex items-center gap-1.5 min-h-[38px] font-semibold"
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
          <label htmlFor="resolve-note-input" className="block text-xs font-semibold text-[#131b2e]">
            Resolution note (optional):
          </label>
          <textarea
            id="resolve-note-input"
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            placeholder="Describe what resolved the issue (e.g. rolled back deployment, fixed DNS record)..."
            rows={3}
            maxLength={1000}
            className="w-full rounded-lg border border-[#dae2fd] p-2.5 text-xs text-[#131b2e] placeholder:text-[#59605f] focus:border-[#ff6700] focus:outline-hidden focus:ring-2 focus:ring-[#ff6700]/25 transition-colors"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
