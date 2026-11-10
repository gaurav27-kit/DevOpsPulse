import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { formatDateTime, formatRelative } from '../utils/formatDate.js';
import { formatDuration } from '../utils/formatDuration.js';

/**
 * Table displaying chronological health check history records.
 * Ensures status is communicated via icons and text, never color alone.
 * Styled with DevOpsPulse design tokens.
 */
export function HealthCheckTable({ healthChecks = [] }) {
  if (!healthChecks || healthChecks.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[#5a4136]">
        No health check records found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-[#e2e8f0] bg-[#f2f3ff]/60 text-xs uppercase font-semibold text-[#5a4136]">
          <tr>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Result</th>
            <th className="px-4 py-3">Status Code</th>
            <th className="px-4 py-3">Latency</th>
            <th className="px-4 py-3">Error Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eaedff]">
          {healthChecks.map((check) => {
            const isSuccess = check.success;
            return (
              <tr key={check._id || check.checkedAt} className="hover:bg-[#f2f3ff]/40 transition-colors">
                <td className="px-4 py-3 text-[#131b2e] whitespace-nowrap">
                  <div className="font-medium text-[#131b2e]">
                    {formatRelative(check.checkedAt)}
                  </div>
                  <div className="text-xs text-[#5a4136]">
                    {formatDateTime(check.checkedAt)}
                  </div>
                </td>

                <td className="px-4 py-3 whitespace-nowrap">
                  {isSuccess ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf5] border border-[#a7f3d0] px-2.5 py-0.5 text-xs font-semibold text-[#065f46]">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#10b981]" aria-hidden="true" />
                      Success
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ffdad6] border border-[#ffb4ab] px-2.5 py-0.5 text-xs font-semibold text-[#93000a]">
                      <XCircle className="h-3.5 w-3.5 text-[#ba1a1a]" aria-hidden="true" />
                      Failed
                    </span>
                  )}
                </td>

                <td className="px-4 py-3 whitespace-nowrap">
                  {check.statusCode ? (
                    <span
                      className={`font-mono text-xs font-semibold px-2 py-0.5 rounded border ${
                        check.statusCode >= 200 && check.statusCode < 300
                          ? 'bg-[#f2f3ff] text-[#131b2e] border-[#dae2fd]'
                          : 'bg-[#ffdad6] text-[#93000a] border-[#ffb4ab]'
                      }`}
                    >
                      {check.statusCode}
                    </span>
                  ) : (
                    <span className="text-[#59605f]">—</span>
                  )}
                </td>

                <td className="px-4 py-3 whitespace-nowrap font-medium text-[#131b2e]">
                  {formatDuration(check.responseTimeMs)}
                </td>

                <td className="px-4 py-3 text-xs text-[#5a4136] max-w-xs truncate">
                  {check.errorType ? (
                    <div>
                      <span className="font-semibold text-[#93000a] capitalize">
                        {check.errorType.replace(/_/g, ' ')}
                      </span>
                      {check.errorMessage && (
                        <p className="text-[#5a4136] truncate mt-0.5" title={check.errorMessage}>
                          {check.errorMessage}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-[#59605f]">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
