import React from 'react';
import { Info } from 'lucide-react';

/**
 * PartialWindowNotice component informing user that telemetry history does not yet cover the full window.
 */
export function PartialWindowNotice({
  windowDays = 30,
  coveragePct = 0,
  className = ''
}) {
  const numericCoverage = Number(coveragePct ?? 0).toFixed(1);

  return (
    <div
      role="note"
      className={`p-3 bg-blue-50 border border-blue-200 rounded-md flex items-start gap-2.5 text-blue-900 ${className}`}
      data-testid="partial-window-notice"
    >
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" aria-hidden="true" />
      <div className="text-xs">
        <span className="font-semibold">Partial Window: </span>
        This application has less than {windowDays} days of recorded history ({numericCoverage}% window coverage). Calculations reflect all recorded checks in the rolling window.
      </div>
    </div>
  );
}
