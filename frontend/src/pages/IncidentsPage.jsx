import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  FilterX,
  ExternalLink,
  Clock,
  Layers,
  ChevronRight
} from 'lucide-react';
import { useIncidentsList } from '../hooks/useIncidents.js';
import { useApplicationOptions } from '../hooks/useApplicationOptions.js';
import { SeverityBadge } from '../components/SeverityBadge.jsx';
import { IncidentStatusBadge } from '../components/IncidentStatusBadge.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { Skeleton } from '../components/Skeleton.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { Button } from '../components/Button.jsx';
import { formatDateTime, formatRelative } from '../utils/formatDate.js';
import { formatElapsedDuration } from '../utils/formatDuration.js';

export function IncidentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Query params
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const status = searchParams.get('status') || '';
  const severity = searchParams.get('severity') || '';
  const applicationId = searchParams.get('applicationId') || '';
  const sortBy = searchParams.get('sortBy') || 'startedAt';
  const order = searchParams.get('order') || 'desc';

  const { data: applications = [] } = useApplicationOptions();

  const queryParams = {
    page,
    limit: 10,
    sortBy,
    order,
    ...(status ? { status } : {}),
    ...(severity ? { severity } : {}),
    ...(applicationId ? { applicationId } : {})
  };

  const { data, isLoading, isError, error, refetch } = useIncidentsList(queryParams);

  const incidents = data?.incidents || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  const hasActiveFilters = Boolean(status || severity || applicationId || (sortBy !== 'startedAt') || (order !== 'desc'));

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (!value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    next.set('page', '1'); // Reset to page 1 on filter/sort change
    setSearchParams(next);
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  const toggleSortOrder = () => {
    const newOrder = order === 'asc' ? 'desc' : 'asc';
    const next = new URLSearchParams(searchParams);
    next.set('order', newOrder);
    next.set('page', '1');
    setSearchParams(next);
  };

  return (
    <div className="space-y-6">
      {/* Page Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Incidents</h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor and resolve service outages, degradations, and downtime events.
          </p>
        </div>
      </div>

      {/* Filter & Sort Controls */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Status Filter */}
          <div>
            <label htmlFor="incident-status-filter" className="block text-xs font-semibold text-slate-600 mb-1">
              Status
            </label>
            <select
              id="incident-status-filter"
              value={status}
              onChange={(e) => updateParam('status', e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          {/* Severity Filter */}
          <div>
            <label htmlFor="incident-severity-filter" className="block text-xs font-semibold text-slate-600 mb-1">
              Severity
            </label>
            <select
              id="incident-severity-filter"
              value={severity}
              onChange={(e) => updateParam('severity', e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Application Filter */}
          <div>
            <label htmlFor="incident-app-filter" className="block text-xs font-semibold text-slate-600 mb-1">
              Application
            </label>
            <select
              id="incident-app-filter"
              value={applicationId}
              onChange={(e) => updateParam('applicationId', e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="">All Applications</option>
              {applications.map((app) => (
                <option key={app._id} value={app._id}>
                  {app.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By & Order */}
          <div>
            <label htmlFor="incident-sort-filter" className="block text-xs font-semibold text-slate-600 mb-1">
              Sort By
            </label>
            <div className="flex items-center gap-1.5">
              <select
                id="incident-sort-filter"
                value={sortBy}
                onChange={(e) => updateParam('sortBy', e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
              >
                <option value="startedAt">Started Time</option>
                <option value="lastFailureAt">Last Failure</option>
                <option value="failureCount">Failure Count</option>
                <option value="severity">Severity</option>
              </select>

              <button
                type="button"
                onClick={toggleSortOrder}
                className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600 cursor-pointer"
                title={`Order: ${order === 'asc' ? 'Ascending' : 'Descending'}`}
                aria-label={`Order: ${order === 'asc' ? 'Ascending' : 'Descending'}`}
              >
                <ArrowUpDown className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-500">Filtered view active</span>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              <FilterX className="h-3.5 w-3.5" />
              <span>Clear filters</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : isError ? (
        <ErrorState
          title="Failed to load incidents"
          message={error?.message || 'Could not retrieve incident records.'}
          onRetry={refetch}
        />
      ) : incidents.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 shadow-xs">
          {hasActiveFilters ? (
            <EmptyState
              icon={AlertTriangle}
              title="No incidents match your filters"
              description="Try adjusting or clearing your filters to see historical incident logs."
              action={
                <Button variant="outline" onClick={clearFilters}>
                  Clear all filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="No incidents yet. That is good news."
              description="Automated incidents will appear here if 2 consecutive health checks fail on any of your monitored services."
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table */}
          <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-xs uppercase font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-3">Incident & Service</th>
                  <th className="px-6 py-3">Severity</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Started</th>
                  <th className="px-6 py-3">Duration</th>
                  <th className="px-6 py-3">Failures</th>
                  <th className="px-6 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {incidents.map((inc) => {
                  const isResolved = inc.status === 'resolved';
                  const durationStr = isResolved
                    ? formatElapsedDuration(inc.startedAt, inc.resolvedAt)
                    : `Ongoing (${formatElapsedDuration(inc.startedAt)})`;

                  return (
                    <tr key={inc._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <Link
                          to={`/incidents/${inc._id}`}
                          className="font-semibold text-slate-900 hover:text-blue-600 block"
                        >
                          {inc.title}
                        </Link>
                        {inc.applicationId && (
                          <div className="text-xs text-slate-400 mt-0.5">
                            {inc.applicationId.name}
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <SeverityBadge severity={inc.severity} />
                      </td>

                      <td className="px-6 py-4">
                        <IncidentStatusBadge status={inc.status} />
                      </td>

                      <td className="px-6 py-4 text-xs text-slate-600 whitespace-nowrap">
                        <div title={formatDateTime(inc.startedAt)}>
                          {formatRelative(inc.startedAt)}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-xs font-medium text-slate-700 whitespace-nowrap">
                        {durationStr}
                      </td>

                      <td className="px-6 py-4 text-xs font-semibold text-slate-800">
                        {inc.failureCount}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <Link
                          to={`/incidents/${inc._id}`}
                          className="inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800"
                        >
                          <span>View</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden space-y-3">
            {incidents.map((inc) => {
              const isResolved = inc.status === 'resolved';
              const durationStr = isResolved
                ? formatElapsedDuration(inc.startedAt, inc.resolvedAt)
                : `Ongoing (${formatElapsedDuration(inc.startedAt)})`;

              return (
                <Link
                  key={inc._id}
                  to={`/incidents/${inc._id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-sm text-slate-900">{inc.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{inc.applicationId?.name}</p>
                    </div>
                    <IncidentStatusBadge status={inc.status} />
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-600 pt-3 border-t border-slate-100">
                    <SeverityBadge severity={inc.severity} />
                    <span>Duration: <strong className="text-slate-800">{durationStr}</strong></span>
                    <span>Failures: <strong className="text-slate-800">{inc.failureCount}</strong></span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            itemLabel="incident"
            onPageChange={(p) => updateParam('page', String(p))}
          />
        </div>
      )}
    </div>
  );
}
