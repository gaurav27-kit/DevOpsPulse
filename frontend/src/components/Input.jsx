import React from 'react';

/**
 * Accessible form input component with labeled layout,
 * error state highlighting, and descriptive error messaging.
 */
export function Input({
  label,
  id,
  name,
  type = 'text',
  value,
  onChange,
  error,
  helperText,
  placeholder,
  disabled = false,
  required = false,
  autoComplete,
  className = '',
  ...rest
}) {
  const inputId = id || name;
  const errorId = error ? `${inputId}-error` : undefined;
  const helperId = helperText ? `${inputId}-helper` : undefined;

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-1">
          {label} {required && <span className="text-rose-500" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          id={inputId}
          name={name || inputId}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId || helperId}
          className={`block w-full rounded-lg border px-3 py-2 text-sm text-slate-900 shadow-xs transition-colors placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-offset-1 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed ${
            error
              ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500 bg-rose-50/30'
              : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-500 bg-white'
          }`}
          {...rest}
        />
      </div>

      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-xs text-rose-600 font-medium">
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="mt-1 text-xs text-slate-500">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

