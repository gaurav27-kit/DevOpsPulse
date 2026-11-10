import React from 'react';

/**
 * Accessible form input component with labeled layout,
 * error state highlighting, and descriptive error messaging.
 * Uses DevOpsPulse design tokens.
 */
export const Input = React.forwardRef(function Input(
  {
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
  },
  ref
) {
  const inputId = id || name;
  const errorId = error ? `${inputId}-error` : undefined;
  const helperId = helperText ? `${inputId}-helper` : undefined;

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor={inputId} className="block text-sm font-semibold text-[#131b2e]">
            {label} {required && <span className="text-[#ba1a1a]" aria-hidden="true">*</span>}
          </label>
        </div>
      )}
      <div className="relative">
        <input
          ref={ref}
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
          className={`block w-full min-h-[40px] rounded-lg border px-3 py-2 text-sm text-[#131b2e] shadow-2xs transition-colors placeholder:text-[#59605f] focus:outline-hidden focus:ring-2 focus:ring-offset-1 disabled:bg-[#f2f3ff] disabled:text-[#59605f] disabled:cursor-not-allowed ${
            error
              ? 'border-[#ba1a1a] bg-[#ffdad6]/20 focus:border-[#ba1a1a] focus:ring-[#ba1a1a]/30'
              : 'border-[#dae2fd] bg-white focus:border-[#ff6700] focus:ring-[#ff6700]/25'
          }`}
          {...rest}
        />
      </div>

      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-[#ba1a1a] font-medium flex items-center gap-1">
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="mt-1.5 text-xs text-[#5a4136]">
          {helperText}
        </p>
      ) : null}
    </div>
  );
});
