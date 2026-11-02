import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { formatDateTime, formatRelative } from '../utils/formatDate.js';
import { formatDuration } from '../utils/formatDuration.js';

/**
 * Table displaying chronological health check history records.
 * Ensures status is communicated via icons and text, never color alone.
 */
export function HealthCheckTable({ healthChecks = [] }) {
  if (!healthChecks || healthChecks.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-slate-500">
        No health check records found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/75 text-xs uppercase font-semibold text-slate-500">
          <tr>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Result</th>
            <th className="px-4 py-3">Status Code</th>
            <th className="px-4 py-3">Latency</th>
            <th className="px-4 py-3">Error Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {healthChecks.map((check) => {
            const isSuccess = check.success;
            return (
              <tr key={check._id || check.checkedAt} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                  <div className="font-medium text-slate-800">
                    {formatRelative(check.checkedAt)}
                  </div>
                  <div className="text-xs text-slate-400">
                    {formatDateTime(check.checkedAt)}
                  </div>
                </td>

                <td className="px-4 py-3 whitespace-nowrap">
                  {isSuccess ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                      Success
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">
                      <XCircle className="h-3.5 w-3.5 text-rose-600" aria-hidden="true" />
                      Failed
                    </span>
                  )}
                </td>

                <td className="px-4 py-3 whitespace-nowrap">
                  {check.statusCode ? (
                    <span
                      className={`font-mono text-xs font-semibold px-2 py-0.5 rounded ${
                        check.statusCode >= 200 && check.statusCode < 300
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {check.statusCode}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>

                <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-700">
                  {formatDuration(check.responseTimeMs)}
                </td>

                <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">
                  {check.errorType ? (
                    <div>
                      <span className="font-medium text-rose-700 capitalize">
                        {check.errorType.replace(/_/g, ' ')}
                      </span>
                      {check.errorMessage && (
                        <p className="text-slate-500 truncate mt-0.5" title={check.errorMessage}>
                          {check.errorMessage}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-400">—</span>
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
