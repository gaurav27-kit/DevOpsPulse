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
      className="inline-flex items-center rounded-xl border border-[#e2e8f0] bg-[#f2f3ff] p-1 shadow-sm"
    >
      {RANGES.map((r) => {
        const isSelected = activeRange === r.value;
        return (
          <button
            key={r.value}
            type="button"
            onClick={() => handleSelect(r.value)}
            aria-pressed={isSelected}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-all focus:outline-hidden focus:ring-2 focus:ring-[#ff6700] ${
              isSelected
                ? 'bg-white text-[#131b2e] shadow-xs font-semibold'
                : 'text-[#5a4136] hover:bg-white/60 hover:text-[#131b2e]'
            }`}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

