import React, { useState } from 'react';
import { Input } from './Input.jsx';
import { Button } from './Button.jsx';
import { FormError } from './FormError.jsx';

/**
 * Reusable form component for registering and editing monitored applications.
 */
export function ApplicationForm({
  initialValues = {},
  onSubmit,
  isLoading = false,
  serverErrors = {},
  generalError = '',
  submitLabel = 'Save Application'
}) {
  const [formData, setFormData] = useState({
    name: initialValues.name || '',
    url: initialValues.url || '',
    environment: initialValues.environment || 'production',
    checkIntervalSeconds: initialValues.checkIntervalSeconds ?? 300,
    timeoutMs: initialValues.timeoutMs ?? 10000
  });

  const [clientErrors, setClientErrors] = useState({});

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    const parsedValue = type === 'number' ? (value === '' ? '' : Number(value)) : value;

    setFormData((prev) => ({
      ...prev,
      [name]: parsedValue
    }));

    if (clientErrors[name]) {
      setClientErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const validate = () => {
    const errors = {};

    // Name constraint
    if (!formData.name.trim()) {
      errors.name = 'Application name is required';
    } else if (formData.name.trim().length < 2 || formData.name.trim().length > 60) {
      errors.name = 'Name must be between 2 and 60 characters';
    }

    // URL constraint
    const trimmedUrl = formData.url.trim();
    if (!trimmedUrl) {
      errors.url = 'Monitored URL is required';
    } else if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      errors.url = 'URL must start with http:// or https://';
    }

    // Interval constraint (30s - 3600s)
    const interval = Number(formData.checkIntervalSeconds);
    if (isNaN(interval) || interval < 30 || interval > 3600) {
      errors.checkIntervalSeconds = 'Check interval must be between 30 and 3600 seconds';
    }

    // Timeout constraint (1000ms - 30000ms)
    const timeout = Number(formData.timeoutMs);
    if (isNaN(timeout) || timeout < 1000 || timeout > 30000) {
      errors.timeoutMs = 'Timeout must be between 1000 and 30000 ms';
    }

    setClientErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    onSubmit({
      name: formData.name.trim(),
      url: formData.url.trim(),
      environment: formData.environment,
      checkIntervalSeconds: Number(formData.checkIntervalSeconds),
      timeoutMs: Number(formData.timeoutMs)
    });
  };

  // Merge client and server-side field-level errors (server takes precedence if present)
  const getFieldError = (field) => serverErrors[field] || clientErrors[field];

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <FormError message={generalError} />

      <Input
        label="Application Name"
        id="name"
        name="name"
        placeholder="e.g. Production API, Auth Service"
        value={formData.name}
        onChange={handleChange}
        error={getFieldError('name')}
        required
        disabled={isLoading}
      />

      <Input
        label="Endpoint URL"
        id="url"
        name="url"
        type="url"
        placeholder="https://api.example.com/health"
        helperText="Must be a publicly accessible HTTP or HTTPS endpoint (SSRF protected)."
        value={formData.url}
        onChange={handleChange}
        error={getFieldError('url')}
        required
        disabled={isLoading}
      />

      {/* Environment Select */}
      <div>
        <label htmlFor="environment" className="block text-sm font-medium text-slate-700 mb-1">
          Environment <span className="text-rose-500">*</span>
        </label>
        <select
          id="environment"
          name="environment"
          value={formData.environment}
          onChange={handleChange}
          disabled={isLoading}
          className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs focus:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
        >
          <option value="production">Production</option>
          <option value="staging">Staging</option>
          <option value="development">Development</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Input
          label="Check Interval (seconds)"
          id="checkIntervalSeconds"
          name="checkIntervalSeconds"
          type="number"
          min="30"
          max="3600"
          helperText="Range: 30 to 3600s (default: 300s / 5 min)"
          value={formData.checkIntervalSeconds}
          onChange={handleChange}
          error={getFieldError('checkIntervalSeconds')}
          required
          disabled={isLoading}
        />

        <Input
          label="Request Timeout (ms)"
          id="timeoutMs"
          name="timeoutMs"
          type="number"
          min="1000"
          max="30000"
          step="500"
          helperText="Range: 1000 to 30000 ms (default: 10000 ms)"
          value={formData.timeoutMs}
          onChange={handleChange}
          error={getFieldError('timeoutMs')}
          required
          disabled={isLoading}
        />
      </div>

      <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
        <Button type="submit" variant="primary" isLoading={isLoading} className="py-2.5 px-6">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

