import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import {
  Rocket,
  Plus,
  ArrowUpDown,
  FilterX,
  GitBranch,
  GitCommit,
  Clock,
  Layers,
  Info
} from 'lucide-react';
import { useDeploymentsList } from '../hooks/useDeployments.js';
import { useApplicationOptions } from '../hooks/useApplicationOptions.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { DeploymentStatusBadge } from '../components/DeploymentStatusBadge.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { Skeleton } from '../components/Skeleton.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { Button } from '../components/Button.jsx';
import { AlertBanner } from '../components/AlertBanner.jsx';
import { formatDateTime, formatRelative } from '../utils/formatDate.js';
import { formatElapsedDuration } from '../utils/formatDuration.js';

export function DeploymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  // Success message passed from create page navigation state
  const [bannerMessage, setBannerMessage] = useState(location.state?.message || null);

  // URL state
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const applicationId = searchParams.get('applicationId') || '';
  const status = searchParams.get('status') || '';
  const environment = searchParams.get('environment') || '';
  const branchParam = searchParams.get('branch') || '';
  const sortBy = searchParams.get('sortBy') || 'startedAt';
  const order = searchParams.get('order') || 'desc';

  // Local branch input state for debounce
  const [branchInput, setBranchInput] = useState(branchParam);
  const debouncedBranch = useDebounce(branchInput, 400);

  const { data: applications = [] } = useApplicationOptions();

  // Sync debounced branch with URL
  useEffect(() => {
    if (debouncedBranch !== branchParam) {
      const next = new URLSearchParams(searchParams);
      if (debouncedBranch.trim()) {
        next.set('branch', debouncedBranch.trim());
      } else {
        next.delete('branch');
      }
      next.set('page', '1');
      setSearchParams(next);
    }
  }, [debouncedBranch, branchParam, searchParams, setSearchParams]);

  const queryParams = {
    page,
    limit: 10,
    sortBy,
    order,
    ...(applicationId ? { applicationId } : {}),
    ...(status ? { status } : {}),
    ...(environment ? { environment } : {}),
    ...(branchParam ? { branch: branchParam } : {})
  };

  const { data, isLoading, isError, error, refetch } = useDeploymentsList(queryParams);

  const deployments = data?.deployments || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  const hasActiveFilters = Boolean(
    applicationId || status || environment || branchParam || sortBy !== 'startedAt' || order !== 'desc'
  );

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (!value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    next.set('page', '1');
    setSearchParams(next);
  };

  const clearFilters = () => {
    setBranchInput('');
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
      {/* Success banner if redirected after recording deployment */}
      {bannerMessage && (
        <AlertBanner
          type="success"
          message={bannerMessage}
          onDismiss={() => setBannerMessage(null)}
        />
      )}

      {/* Header & CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Deployments</h1>
          <p className="mt-1 text-sm text-slate-500">
            Track release versions, Git commits, and deployment execution logs across services.
          </p>
        </div>

        <Link to="/deployments/new">
          <Button variant="primary" className="inline-flex items-center gap-1.5 self-start sm:self-auto">
            <Plus className="h-4 w-4" />
            <span>Record deployment</span>
          </Button>
        </Link>
      </div>

      {/* Filters Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Application */}
          <div>
            <label htmlFor="dep-app-filter" className="block text-xs font-semibold text-slate-600 mb-1">
              Application
            </label>
            <select
              id="dep-app-filter"
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

          {/* Status */}
          <div>
            <label htmlFor="dep-status-filter" className="block text-xs font-semibold text-slate-600 mb-1">
              Status
            </label>
            <select
              id="dep-status-filter"
              value={status}
              onChange={(e) => updateParam('status', e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="">All Statuses</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="in_progress">In Progress</option>
              <option value="pending">Pending</option>
              <option value="rolled_back">Rolled Back</option>
            </select>
          </div>

          {/* Environment */}
          <div>
            <label htmlFor="dep-env-filter" className="block text-xs font-semibold text-slate-600 mb-1">
              Environment
            </label>
            <select
              id="dep-env-filter"
              value={environment}
              onChange={(e) => updateParam('environment', e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="">All Environments</option>
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
            </select>
          </div>

          {/* Branch */}
          <div>
            <label htmlFor="dep-branch-filter" className="block text-xs font-semibold text-slate-600 mb-1">
              Branch Name
            </label>
            <input
              type="text"
              id="dep-branch-filter"
              value={branchInput}
              onChange={(e) => setBranchInput(e.target.value)}
              placeholder="e.g. main"
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          {/* Sort By */}
          <div>
            <label htmlFor="dep-sort-filter" className="block text-xs font-semibold text-slate-600 mb-1">
              Sort By
            </label>
            <div className="flex items-center gap-1.5">
              <select
                id="dep-sort-filter"
                value={sortBy}
                onChange={(e) => updateParam('sortBy', e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
              >
                <option value="startedAt">Started Time</option>
                <option value="createdAt">Recorded Time</option>
              </select>

              <button
                type="button"
                onClick={toggleSortOrder}
                className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600 cursor-pointer"
                title={`Order: ${order === 'asc' ? 'Oldest first' : 'Newest first'}`}
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

      {/* Content */}
      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : isError ? (
        <ErrorState
          title="Failed to load deployments"
          message={error?.message || 'Could not retrieve deployment logs.'}
          onRetry={refetch}
        />
      ) : deployments.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 shadow-xs">
          {hasActiveFilters ? (
            <EmptyState
              icon={Rocket}
              title="No deployments match your filters"
              description="Try adjusting or clearing your filters to see historical deployment records."
              action={
                <Button variant="outline" onClick={clearFilters}>
                  Clear all filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Rocket}
              title="No deployments recorded yet"
              description="Record your software releases and configuration changes to correlate them with uptime and latency."
              action={
                <Link to="/deployments/new">
                  <Button variant="primary">Record your first deployment</Button>
                </Link>
              }
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
                  <th className="px-6 py-3">Version & Service</th>
                  <th className="px-6 py-3">Branch & Commit</th>
                  <th className="px-6 py-3">Environment</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Started</th>
                  <th className="px-6 py-3">Duration</th>
                  <th className="px-6 py-3">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deployments.map((dep) => {
                  const durationStr = dep.completedAt
                    ? formatElapsedDuration(dep.startedAt, dep.completedAt)
                    : dep.status === 'in_progress'
                    ? 'In progress'
                    : '—';

                  const shortSha = dep.commitSha ? dep.commitSha.slice(0, 7) : null;

                  return (
                    <tr key={dep._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md inline-block">
                          {dep.version}
                        </div>
                        {dep.applicationId && (
                          <div className="text-xs text-slate-500 mt-1">
                            {dep.applicationId.name}
                          </div>
                        )}
                        {dep.description && (
                          <p className="text-2xs text-slate-400 mt-0.5 truncate max-w-xs" title={dep.description}>
                            {dep.description}
                          </p>
                        )}
                      </td>

                      <td className="px-6 py-4 text-xs text-slate-600">
                        {dep.branch ? (
                          <div className="inline-flex items-center gap-1 font-mono text-slate-700">
                            <GitBranch className="h-3.5 w-3.5 text-slate-400" />
                            <span>{dep.branch}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}

                        {shortSha && (
                          <div className="inline-flex items-center gap-1 font-mono text-2xs text-slate-400 mt-0.5 block">
                            <GitCommit className="h-3 w-3" />
                            <span>{shortSha}</span>
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <span className="capitalize text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full">
                          {dep.environment}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <DeploymentStatusBadge status={dep.status} />
                      </td>

                      <td className="px-6 py-4 text-xs text-slate-600 whitespace-nowrap">
                        <div title={formatDateTime(dep.startedAt)}>
                          {formatRelative(dep.startedAt)}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-xs font-medium text-slate-700 whitespace-nowrap">
                        {durationStr}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-medium bg-slate-100 text-slate-600 cursor-help"
                          title="Entered by you, not verified by an automated integration"
                        >
                          <Info className="h-3 w-3 text-slate-400" />
                          <span>Manual entry</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden space-y-3">
            {deployments.map((dep) => {
              const durationStr = dep.completedAt
                ? formatElapsedDuration(dep.startedAt, dep.completedAt)
                : dep.status === 'in_progress'
                ? 'In progress'
                : '—';

              return (
                <div
                  key={dep._id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                        {dep.version}
                      </span>
                      <p className="text-xs text-slate-500 mt-1">{dep.applicationId?.name}</p>
                    </div>
                    <DeploymentStatusBadge status={dep.status} />
                  </div>

                  {dep.description && (
                    <p className="text-xs text-slate-600">{dep.description}</p>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                    <span>{dep.branch || 'no branch'}</span>
                    <span>Started {formatRelative(dep.startedAt)}</span>
                    <span>{durationStr}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            itemLabel="deployment"
            onPageChange={(p) => updateParam('page', String(p))}
          />
        </div>
      )}
    </div>
  );
}
