import React, { useState, useEffect } from 'react';
import { useApplicationOptions } from '../hooks/useApplicationOptions.js';
import { Input } from './Input.jsx';
import { Button } from './Button.jsx';
import { FormError } from './FormError.jsx';
import { Spinner } from './Spinner.jsx';

/**
 * Helper to convert local Date to format accepted by <input type="datetime-local" />
 * Format: YYYY-MM-DDTHH:mm
 */
const toDatetimeLocal = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function DeploymentForm({
  initialAppId = '',
  onSubmit,
  isLoading = false,
  serverErrors = {},
  generalError = '',
  onCancel
}) {
  const { data: applications = [], isLoading: isLoadingApps } = useApplicationOptions();

  const [applicationId, setApplicationId] = useState(initialAppId);
  const [formData, setFormData] = useState({
    version: '',
    commitSha: '',
    branch: '',
    environment: 'production',
    status: 'success',
    startedAt: toDatetimeLocal(new Date()),
    completedAt: toDatetimeLocal(new Date()),
    description: ''
  });

  const [clientErrors, setClientErrors] = useState({});

  // If initialAppId changes or applications load, sync environment default
  useEffect(() => {
    if (initialAppId) {
      setApplicationId(initialAppId);
    } else if (applications.length > 0 && !applicationId) {
      setApplicationId(applications[0]._id);
    }
  }, [initialAppId, applications, applicationId]);

  // When selected app changes, adopt its environment
  useEffect(() => {
    const selected = applications.find((a) => a._id === applicationId);
    if (selected?.environment) {
      setFormData((prev) => ({ ...prev, environment: selected.environment }));
    }
  }, [applicationId, applications]);

  const isPendingOrInProgress = formData.status === 'pending' || formData.status === 'in_progress';

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      // Clear completedAt if switching to pending/in_progress
      if (name === 'status' && (value === 'pending' || value === 'in_progress')) {
        updated.completedAt = '';
      }
      return updated;
    });

    if (clientErrors[name]) {
      setClientErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const validate = () => {
    const errors = {};

    if (!applicationId) {
      errors.applicationId = 'Please select a monitored application.';
    }

    const versionTrim = formData.version.trim();
    if (!versionTrim) {
      errors.version = 'Version tag or release name is required.';
    } else if (versionTrim.length > 50) {
      errors.version = 'Version must not exceed 50 characters.';
    }

    if (formData.branch) {
      const branchTrim = formData.branch.trim();
      if (!/^[a-zA-Z0-9._\-\/]+$/.test(branchTrim)) {
        errors.branch = 'Branch may only contain letters, numbers, and . _ - /';
      }
    }

    if (formData.commitSha) {
      const shaTrim = formData.commitSha.trim();
      if (!/^[0-9a-fA-F]{7,40}$/.test(shaTrim)) {
        errors.commitSha = 'Commit SHA must be between 7 and 40 hexadecimal characters.';
      }
    }

    // Time validation
    if (formData.startedAt) {
      const started = new Date(formData.startedAt);
      const maxAllowed = new Date(Date.now() + 5 * 60 * 1000);
      if (started > maxAllowed) {
        errors.startedAt = 'Start time cannot be more than 5 minutes in the future.';
      }

      if (formData.completedAt && !isPendingOrInProgress) {
        const completed = new Date(formData.completedAt);
        if (completed < started) {
          errors.completedAt = 'Completion time must not be before start time.';
        }
      }
    }

    if (formData.description && formData.description.length > 500) {
      errors.description = 'Description cannot exceed 500 characters.';
    }

    setClientErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      version: formData.version.trim(),
      environment: formData.environment,
      status: formData.status
    };

    if (formData.commitSha.trim()) payload.commitSha = formData.commitSha.trim();
    if (formData.branch.trim()) payload.branch = formData.branch.trim();
    if (formData.description.trim()) payload.description = formData.description.trim();

    if (formData.startedAt) {
      payload.startedAt = new Date(formData.startedAt).toISOString();
    }
    if (formData.completedAt && !isPendingOrInProgress) {
      payload.completedAt = new Date(formData.completedAt).toISOString();
    }

    onSubmit(applicationId, payload);
  };

  const descRemaining = 500 - (formData.description?.length || 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {generalError && <FormError message={generalError} />}

      {/* Application Selector */}
      <div>
        <label htmlFor="deployment-app-select" className="block text-sm font-semibold text-slate-800 mb-1">
          Monitored Application <span className="text-rose-500">*</span>
        </label>
        {isLoadingApps ? (
          <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
            <Spinner size="sm" />
            <span>Loading applications...</span>
          </div>
        ) : (
          <select
            id="deployment-app-select"
            value={applicationId}
            onChange={(e) => setApplicationId(e.target.value)}
            disabled={Boolean(initialAppId) || isLoading}
            className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:cursor-not-allowed"
          >
            {applications.map((app) => (
              <option key={app._id} value={app._id}>
                {app.name} ({app.environment})
              </option>
            ))}
          </select>
        )}
        {(clientErrors.applicationId || serverErrors.applicationId) && (
          <FormError message={clientErrors.applicationId || serverErrors.applicationId} />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Version */}
        <div>
          <Input
            label="Version / Release Tag"
            name="version"
            value={formData.version}
            onChange={handleChange}
            placeholder="e.g. v2.4.1 or release-2026.11"
            required
            disabled={isLoading}
            error={clientErrors.version || serverErrors.version}
          />
        </div>

        {/* Environment */}
        <div>
          <label htmlFor="deployment-env-select" className="block text-sm font-semibold text-slate-800 mb-1">
            Environment <span className="text-rose-500">*</span>
          </label>
          <select
            id="deployment-env-select"
            name="environment"
            value={formData.environment}
            onChange={handleChange}
            disabled={isLoading}
            className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-100"
          >
            <option value="production">Production</option>
            <option value="staging">Staging</option>
            <option value="development">Development</option>
          </select>
          {(clientErrors.environment || serverErrors.environment) && (
            <FormError message={clientErrors.environment || serverErrors.environment} />
          )}
        </div>

        {/* Branch */}
        <div>
          <Input
            label="Git Branch (Optional)"
            name="branch"
            value={formData.branch}
            onChange={handleChange}
            placeholder="e.g. main or release/v2.4"
            disabled={isLoading}
            error={clientErrors.branch || serverErrors.branch}
          />
        </div>

        {/* Commit SHA */}
        <div>
          <Input
            label="Commit SHA (Optional)"
            name="commitSha"
            value={formData.commitSha}
            onChange={handleChange}
            placeholder="e.g. 7f9a1b2c"
            disabled={isLoading}
            error={clientErrors.commitSha || serverErrors.commitSha}
          />
        </div>

        {/* Status */}
        <div>
          <label htmlFor="deployment-status-select" className="block text-sm font-semibold text-slate-800 mb-1">
            Deployment Status <span className="text-rose-500">*</span>
          </label>
          <select
            id="deployment-status-select"
            name="status"
            value={formData.status}
            onChange={handleChange}
            disabled={isLoading}
            className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-100"
          >
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="in_progress">In Progress</option>
            <option value="pending">Pending</option>
            <option value="rolled_back">Rolled Back</option>
          </select>
          {(clientErrors.status || serverErrors.status) && (
            <FormError message={clientErrors.status || serverErrors.status} />
          )}
        </div>

        {/* Started At */}
        <div>
          <label htmlFor="deployment-started-input" className="block text-sm font-semibold text-slate-800 mb-1">
            Started At
          </label>
          <input
            type="datetime-local"
            id="deployment-started-input"
            name="startedAt"
            value={formData.startedAt}
            onChange={handleChange}
            disabled={isLoading}
            className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-100"
          />
          {(clientErrors.startedAt || serverErrors.startedAt) && (
            <FormError message={clientErrors.startedAt || serverErrors.startedAt} />
          )}
        </div>
      </div>

      {/* Completed At (disabled when pending or in_progress) */}
      {!isPendingOrInProgress && (
        <div>
          <label htmlFor="deployment-completed-input" className="block text-sm font-semibold text-slate-800 mb-1">
            Completed At (Optional)
          </label>
          <input
            type="datetime-local"
            id="deployment-completed-input"
            name="completedAt"
            value={formData.completedAt}
            onChange={handleChange}
            disabled={isLoading}
            className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-100"
          />
          <p className="text-xs text-slate-400 mt-1">Must be equal to or later than the start time.</p>
          {(clientErrors.completedAt || serverErrors.completedAt) && (
            <FormError message={clientErrors.completedAt || serverErrors.completedAt} />
          )}
        </div>
      )}

      {/* Description */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="deployment-desc-input" className="block text-sm font-semibold text-slate-800">
            Release Notes / Description (Optional)
          </label>
          <span className="text-xs text-slate-400 font-mono">
            {descRemaining} chars left
          </span>
        </div>
        <textarea
          id="deployment-desc-input"
          name="description"
          value={formData.description}
          onChange={handleChange}
          disabled={isLoading}
          rows={3}
          maxLength={500}
          placeholder="Summary of bug fixes, features, or database migrations included in this release..."
          className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-100"
        />
        {(clientErrors.description || serverErrors.description) && (
          <FormError message={clientErrors.description || serverErrors.description} />
        )}
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={isLoading} className="flex items-center gap-2">
          {isLoading && <Spinner size="sm" className="text-white" />}
          <span>Record Deployment</span>
        </Button>
      </div>
    </form>
  );
}
