import React, { useState, useEffect } from 'react';
import { Target, AlertCircle } from 'lucide-react';

/**
 * Computes human-friendly allowed downtime text for an SLO target and window.
 */
export function computeAllowedDowntime(targetPercent, windowDays) {
  const target = parseFloat(targetPercent);
  const days = parseInt(windowDays, 10);
  if (isNaN(target) || isNaN(days) || target <= 0 || target >= 100) {
    return '';
  }

  const totalMinutes = days * 24 * 60;
  const allowedMinutes = totalMinutes * (1 - target / 100);
  const totalSeconds = Math.round(allowedMinutes * 60);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(' ');
}

/**
 * Form for creating or editing an application's Service Level Objective (SLO).
 */
export function SloForm({
  initialData = null,
  onSubmit,
  onCancel,
  isSubmitting = false,
  serverError = null
}) {
  const [name, setName] = useState(initialData?.name || 'Availability SLO');
  const [targetPercent, setTargetPercent] = useState(
    initialData?.targetPercent !== undefined ? String(initialData.targetPercent) : '99.9'
  );
  const [windowDays, setWindowDays] = useState(
    initialData?.windowDays ? Number(initialData.windowDays) : 30
  );
  const [errors, setErrors] = useState({});

  // Sync initialData changes
  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '');
      setTargetPercent(initialData.targetPercent !== undefined ? String(initialData.targetPercent) : '99.9');
      setWindowDays(initialData.windowDays || 30);
    }
  }, [initialData]);

  // Merge server field errors
  useEffect(() => {
    if (serverError?.fieldErrors) {
      setErrors((prev) => ({ ...prev, ...serverError.fieldErrors }));
    }
  }, [serverError]);

  const validate = () => {
    const newErrors = {};
    if (!name.trim()) {
      newErrors.name = 'SLO name is required';
    }

    const numTarget = parseFloat(targetPercent);
    if (isNaN(numTarget)) {
      newErrors.targetPercent = 'Target percent must be a valid number';
    } else if (numTarget < 90.0 || numTarget > 99.999) {
      newErrors.targetPercent = 'Target must be between 90.000% and 99.999%';
    }

    if (windowDays !== 7 && windowDays !== 30) {
      newErrors.windowDays = 'Window must be either 7 or 30 days';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    onSubmit({
      name: name.trim(),
      targetPercent: parseFloat(targetPercent),
      windowDays: Number(windowDays)
    });
  };

  const allowedDowntimeText = computeAllowedDowntime(targetPercent, windowDays);

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate data-testid="slo-form">
      {serverError?.message && (
        <div
          role="alert"
          className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-start gap-2"
          data-testid="slo-form-server-error"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" aria-hidden="true" />
          <span>{serverError.message}</span>
        </div>
      )}

      {/* SLO Name */}
      <div>
        <label htmlFor="slo-name" className="block text-xs font-semibold text-slate-700 mb-1">
          SLO Name <span className="text-rose-500">*</span>
        </label>
        <input
          id="slo-name"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (errors.name) setErrors((prev) => ({ ...prev, name: null }));
          }}
          className={`w-full px-3 py-2 text-sm bg-white border rounded-md shadow-sm min-h-[40px] focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
            errors.name ? 'border-rose-300 focus:border-rose-500' : 'border-slate-300 focus:border-indigo-500'
          }`}
          placeholder="e.g. Core API 99.9% Target"
          required
        />
        {errors.name && (
          <p className="mt-1 text-xs text-rose-600" data-testid="error-name">
            {errors.name}
          </p>
        )}
      </div>

      {/* Target Percentage */}
      <div>
        <div className="flex justify-between items-baseline mb-1">
          <label htmlFor="slo-target" className="block text-xs font-semibold text-slate-700">
            Target Reliability (%) <span className="text-rose-500">*</span>
          </label>
          <span className="text-xs text-slate-500">Allowed range: 90.000% – 99.999%</span>
        </div>
        <div className="relative">
          <input
            id="slo-target"
            type="number"
            step="0.001"
            min="90"
            max="99.999"
            value={targetPercent}
            onChange={(e) => {
              setTargetPercent(e.target.value);
              if (errors.targetPercent) setErrors((prev) => ({ ...prev, targetPercent: null }));
            }}
            className={`w-full px-3 py-2 text-sm font-mono bg-white border rounded-md shadow-sm min-h-[40px] focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              errors.targetPercent ? 'border-rose-300 focus:border-rose-500' : 'border-slate-300 focus:border-indigo-500'
            }`}
            placeholder="99.900"
            required
          />
          <span className="absolute right-3 top-2.5 text-xs font-semibold text-slate-400 pointer-events-none">
            %
          </span>
        </div>
        {errors.targetPercent && (
          <p className="mt-1 text-xs text-rose-600" data-testid="error-targetPercent">
            {errors.targetPercent}
          </p>
        )}

        {/* Live Allowed Downtime Helper */}
        {allowedDowntimeText && !errors.targetPercent && (
          <p className="mt-1.5 text-xs text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded inline-block font-medium" data-testid="allowed-downtime-helper">
            Allowed error downtime: <strong className="font-mono">{allowedDowntimeText}</strong> over {windowDays} days
          </p>
        )}
      </div>

      {/* Rolling Window */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-2">
          Rolling Measurement Window <span className="text-rose-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label
            className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all min-h-[44px] ${
              windowDays === 30
                ? 'border-indigo-500 bg-indigo-50/50 text-indigo-900 ring-1 ring-indigo-500'
                : 'border-slate-200 hover:bg-slate-50 text-slate-700'
            }`}
          >
            <input
              type="radio"
              name="windowDays"
              value={30}
              checked={windowDays === 30}
              onChange={() => setWindowDays(30)}
              className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-xs font-bold block">30 Days</span>
              <span className="text-[11px] text-slate-500 block">Monthly rolling window</span>
            </div>
          </label>

          <label
            className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all min-h-[44px] ${
              windowDays === 7
                ? 'border-indigo-500 bg-indigo-50/50 text-indigo-900 ring-1 ring-indigo-500'
                : 'border-slate-200 hover:bg-slate-50 text-slate-700'
            }`}
          >
            <input
              type="radio"
              name="windowDays"
              value={7}
              checked={windowDays === 7}
              onChange={() => setWindowDays(7)}
              className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-xs font-bold block">7 Days</span>
              <span className="text-[11px] text-slate-500 block">Weekly rolling window</span>
            </div>
          </label>
        </div>
        {errors.windowDays && (
          <p className="mt-1 text-xs text-rose-600" data-testid="error-windowDays">
            {errors.windowDays}
          </p>
        )}
      </div>

      {/* Action Buttons with >= 40px Touch Targets */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 min-h-[40px] text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-5 py-2 min-h-[40px] text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
          data-testid="slo-form-submit"
        >
          {isSubmitting ? (
            <span>Saving...</span>
          ) : (
            <>
              <Target className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{initialData ? 'Update SLO' : 'Save SLO'}</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
