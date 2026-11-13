import React, { useState } from 'react';
import { X, Calendar, Clock, Wrench, AlertCircle, Play, CalendarClock } from 'lucide-react';
import { Button } from './Button.jsx';
import { AlertBanner } from './AlertBanner.jsx';
import { Spinner } from './Spinner.jsx';

/**
 * Helper to convert a Date into YYYY-MM-DDTHH:mm string for datetime-local input.
 */
function toLocalDateTimeInputString(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function MaintenanceModal({ isOpen, onClose, onSubmit, isLoading, serverError }) {
  const [mode, setMode] = useState('immediate'); // 'immediate' | 'scheduled'
  const [startDateTime, setStartDateTime] = useState(() => {
    const d = new Date(Date.now() + 3600000); // 1 hour in future default for scheduled
    return toLocalDateTimeInputString(d);
  });
  const [endDateTime, setEndDateTime] = useState(() => {
    const d = new Date(Date.now() + 7200000); // 2 hours in future default
    return toLocalDateTimeInputString(d);
  });
  const [reason, setReason] = useState('');
  const [clientError, setClientError] = useState('');

  if (!isOpen) return null;

  const handlePresetDuration = (hours) => {
    const base = mode === 'immediate' ? new Date() : new Date(startDateTime);
    const end = new Date(base.getTime() + hours * 3600000);
    setEndDateTime(toLocalDateTimeInputString(end));
    setClientError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setClientError('');

    if (!reason.trim()) {
      setClientError('Please provide a reason or description for the maintenance.');
      return;
    }

    const now = new Date();
    const start = mode === 'immediate' ? now : new Date(startDateTime);
    const end = new Date(endDateTime);

    if (isNaN(end.getTime()) || (mode === 'scheduled' && isNaN(start.getTime()))) {
      setClientError('Please enter valid dates and times.');
      return;
    }

    if (end.getTime() <= start.getTime()) {
      setClientError('End date and time must be strictly after the start date and time.');
      return;
    }

    onSubmit({
      startAt: mode === 'immediate' ? undefined : start.toISOString(),
      endAt: end.toISOString(),
      reason: reason.trim()
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="maintenance-modal-title"
    >
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h3 id="maintenance-modal-title" className="text-base font-semibold text-slate-900">
                Configure Maintenance Mode
              </h3>
              <p className="text-xs text-slate-500">
                Suppress alerts and track planned maintenance windows
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {(clientError || serverError) && (
            <AlertBanner
              type="error"
              message={clientError || serverError?.response?.data?.message || serverError?.message || 'Failed to configure maintenance'}
            />
          )}

          {/* Mode Selection Tabs */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Activation Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('immediate')}
                className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium rounded-lg border transition-all ${
                  mode === 'immediate'
                    ? 'border-blue-600 bg-blue-50/60 text-blue-800 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start Immediately</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('scheduled')}
                className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium rounded-lg border transition-all ${
                  mode === 'scheduled'
                    ? 'border-blue-600 bg-blue-50/60 text-blue-800 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CalendarClock className="w-3.5 h-3.5" />
                <span>Schedule for Later</span>
              </button>
            </div>
          </div>

          {/* Scheduled Start Time (only visible when mode === 'scheduled') */}
          {mode === 'scheduled' && (
            <div>
              <label htmlFor="startDateTime" className="block text-xs font-semibold text-slate-700 mb-1">
                Start Date & Time <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="datetime-local"
                  id="startDateTime"
                  value={startDateTime}
                  onChange={(e) => setStartDateTime(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 py-2 px-3 pl-9 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  required
                />
                <Calendar className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              </div>
            </div>
          )}

          {/* End Date & Time */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="endDateTime" className="block text-xs font-semibold text-slate-700">
                Scheduled End Date & Time <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] text-slate-400">Quick presets:</span>
            </div>

            <div className="flex items-center gap-1.5 mb-2">
              {[
                { label: '+30m', hours: 0.5 },
                { label: '+1h', hours: 1 },
                { label: '+2h', hours: 2 },
                { label: '+4h', hours: 4 },
                { label: '+24h', hours: 24 }
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handlePresetDuration(preset.hours)}
                  className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-200 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <input
                type="datetime-local"
                id="endDateTime"
                value={endDateTime}
                onChange={(e) => setEndDateTime(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-300 py-2 px-3 pl-9 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                required
              />
              <Clock className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Reason Field */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="maintenanceReason" className="block text-xs font-semibold text-slate-700">
                Reason / Description <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] text-slate-400">{reason.length}/500</span>
            </div>
            <textarea
              id="maintenanceReason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="e.g., Upgrading primary PostgreSQL cluster to v16 and executing schema migrations"
              className="w-full text-xs rounded-lg border border-slate-300 py-2 px-3 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              required
            />
          </div>

          <div className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600 border border-slate-200/60 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
            <span>
              Health checks will continue recording response time and availability. Configured incident alerts are suppressed during this window.
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="text-xs py-2 px-4"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isLoading}
              className="text-xs py-2 px-4 font-semibold"
            >
              {isLoading ? (
                <>
                  <Spinner size="sm" className="mr-1.5 text-white" />
                  <span>Saving...</span>
                </>
              ) : mode === 'immediate' ? (
                'Enable Maintenance Now'
              ) : (
                'Schedule Maintenance Window'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

