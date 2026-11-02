import React from 'react';
import { useSearchParams } from 'react-router-dom';

const RANGES = [
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7d' },
  { value: '30d', label: 'Last 30d' }
];

/**
 * Accessible button group for switching time ranges.
 * Syncs selection with URL query parameter (?range=) and defaults to 24h.
 */
export function RangeSelector({ paramName = 'range', value: controlledValue, onChange }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeRange = controlledValue ?? (searchParams.get(paramName) || '24h');

  const handleSelect = (val) => {
    if (onChange) {
      onChange(val);
      return;
    }
    const next = new URLSearchParams(searchParams);
    if (val === '24h') {
      next.delete(paramName); // Clean URL on default
    } else {
      next.set(paramName, val);
    }
    setSearchParams(next);
  };

  return (
    <div
      role="group"
      aria-label="Time range selector"
      className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-xs"
    >
      {RANGES.map((r) => {
        const isSelected = activeRange === r.value;
        return (
          <button
            key={r.value}
            type="button"
            onClick={() => handleSelect(r.value)}
            aria-pressed={isSelected}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              isSelected
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

