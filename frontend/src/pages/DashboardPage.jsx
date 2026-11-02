import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Server,
  Activity,
  AlertTriangle,
  Clock,
  ArrowRight,
  Plus,
  Rocket,
  CheckCircle2,
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { useDashboard } from '../hooks/useDashboard.js';
import { RangeSelector } from '../components/RangeSelector.jsx';
import { StatCard } from '../components/StatCard.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { Skeleton } from '../components/Skeleton.jsx';
import { Button } from '../components/Button.jsx';
import { formatRelative } from '../utils/formatDate.js';
import { formatDuration } from '../utils/formatDuration.js';
import { formatPercent } from '../utils/formatPercent.js';

export function DashboardPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const range = searchParams.get('range') || '24h';

  const { data, isLoading, isError, error, refetch } = useDashboard(range);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-9 w-48" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>

        <Skeleton className="h-72" />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Failed to load dashboard metrics"
        message={error?.message || 'An error occurred while fetching system metrics.'}
        onRetry={refetch}
      />
    );
  }

  const applications = data?.applications || { total: 0, byStatus: { unknown: 0, up: 0, degraded: 0, down: 0 } };
  const incidents = data?.incidents || { activeCount: 0, activeBySeverity: { low: 0, medium: 0, high: 0, critical: 0 }, recent: [] };
  const deployments = data?.deployments || { recent: [] };
  const health = data?.health || { totalChecks: 0, uptimePercent: null, avgResponseTimeMs: null };
  const applicationsTable = data?.applicationsTable || [];

  // Zero-state onboarding: User has no monitored applications yet
  if (applications.total === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Welcome, {user?.name || 'Developer'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Get started by adding your first web service or API endpoint for automated monitoring.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-12 shadow-xs">
          <EmptyState
            icon={Server}
            title="No applications monitored yet"
            description="Add an application endpoint to track uptime, analyze response times, and receive automated incident alerts."
            action={
              <Link to="/applications/new">
                <Button className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add your first application
                </Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const byStatus = applications.byStatus || {};
  const activeBySeverity = incidents.activeBySeverity || {};

  return (
    <div className="space-y-6">
      {/* Header with Greeting & Range Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome, {user?.name || 'Developer'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Real-time monitoring telemetry and incident status overview.
          </p>
        </div>
        <div>
          <RangeSelector />
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          label="Applications"
          value={applications.total}
          icon={Server}
          hint={
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                {byStatus.up || 0}
              </span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1 text-amber-700">
                <AlertTriangle className="h-3 w-3 text-amber-600" />
                {byStatus.degraded || 0}
              </span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1 text-rose-700">
                <AlertCircle className="h-3 w-3 text-rose-600" />
                {byStatus.down || 0}
              </span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1 text-slate-500">
                <HelpCircle className="h-3 w-3 text-slate-400" />
                {byStatus.unknown || 0}
              </span>
            </div>
          }
        />

        <StatCard
          label="Active Incidents"
          value={incidents.activeCount}
          icon={AlertTriangle}
          valueClassName={incidents.activeCount > 0 ? 'text-rose-600' : 'text-slate-900'}
          hint={
            incidents.activeCount === 0 ? (
              <span className="text-emerald-600 font-medium">All systems operational</span>
            ) : (
              <span className="text-rose-600 font-medium">
                {[
                  activeBySeverity.critical ? `${activeBySeverity.critical} critical` : null,
                  activeBySeverity.high ? `${activeBySeverity.high} high` : null,
                  activeBySeverity.medium ? `${activeBySeverity.medium} med` : null,
                  activeBySeverity.low ? `${activeBySeverity.low} low` : null
                ].filter(Boolean).join(' · ')}
              </span>
            )
          }
        />

        <StatCard
          label="System Uptime"
          value={formatPercent(health.uptimePercent)}
          icon={Activity}
          hint={`${health.totalChecks || 0} checks recorded`}
        />

        <StatCard
          label="Avg Response Time"
          value={formatDuration(health.avgResponseTimeMs)}
          icon={Clock}
          hint="Successful checks only"
        />
      </div>

      {/* Applications Health Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Application Health</h2>
            <p className="text-xs text-slate-500">
              Sorted by operational priority (outages first)
            </p>
          </div>
          <Link
            to="/applications"
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            View all applications
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/75 border-b border-slate-200 text-xs uppercase font-semibold text-slate-500">
              <tr>
                <th className="px-6 py-3">Application</th>
                <th className="px-6 py-3">Environment</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Uptime ({range})</th>
                <th className="px-6 py-3">Last Checked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {applicationsTable.map((app) => (
                <tr key={app.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-3.5">
                    <Link
                      to={`/applications/${app.id}`}
                      className="font-medium text-slate-900 hover:text-blue-600 focus:outline-hidden"
                    >
                      {app.name}
                    </Link>
                    <div className="text-xs text-slate-400 font-mono truncate max-w-xs">
                      {app.url}
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className="capitalize text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full">
                      {app.environment}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <StatusBadge status={app.status} />
                  </td>
                  <td className="px-6 py-3.5 font-medium text-slate-700">
                    {formatPercent(app.uptimePercent)}
                  </td>
                  <td className="px-6 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                    {formatRelative(app.lastCheckedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Two Column Grid: Recent Incidents & Recent Deployments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Incidents */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-slate-500" aria-hidden="true" />
              Recent Incidents
            </h2>
          </div>

          {incidents.recent && incidents.recent.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {incidents.recent.map((inc) => (
                <li key={inc._id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {inc.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {inc.applicationId?.name || 'Application'} · Started {formatRelative(inc.startedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`text-2xs font-semibold px-2 py-0.5 rounded uppercase tracking-wider ${
                          inc.severity === 'critical'
                            ? 'bg-rose-100 text-rose-800'
                            : inc.severity === 'high'
                            ? 'bg-orange-100 text-orange-800'
                            : inc.severity === 'medium'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {inc.severity}
                      </span>
                      <span
                        className={`text-2xs font-semibold px-2 py-0.5 rounded capitalize ${
                          inc.status === 'resolved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {inc.status}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 py-6 text-center">
              No recent incidents recorded.
            </p>
          )}
        </div>

        {/* Recent Deployments */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Rocket className="h-4 w-4 text-slate-500" aria-hidden="true" />
              Recent Deployments
            </h2>
          </div>

          {deployments.recent && deployments.recent.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {deployments.recent.map((dep) => (
                <li key={dep._id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                          {dep.version}
                        </span>
                        <span className="text-xs text-slate-500 truncate">
                          {dep.applicationId?.name || 'Application'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Deployed {formatRelative(dep.startedAt)}
                      </p>
                    </div>
                    <span
                      className={`text-2xs font-semibold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                        dep.status === 'success'
                          ? 'bg-emerald-100 text-emerald-800'
                          : dep.status === 'failed'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {dep.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 py-6 text-center">
              No recent deployments logged.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
