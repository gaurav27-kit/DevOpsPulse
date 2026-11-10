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
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-[#131b2e]">
              Welcome, {user?.name || 'Developer'}
            </h1>
            <p className="mt-1 text-sm text-[#5a4136]">
              Get started by adding your first web service or API endpoint for automated monitoring.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[#e2e8f0] bg-white p-8 sm:p-12 shadow-sm text-center">
          <EmptyState
            icon={Server}
            title="No applications monitored yet"
            description="Add an application endpoint to track uptime, analyze response times, and receive automated incident alerts."
            action={
              <Link to="/applications/new">
                <Button className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Add your first application</span>
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
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header with Greeting & Range Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-[#131b2e]">
            Welcome, {user?.name || 'Developer'}
          </h1>
          <p className="mt-1 text-sm text-[#5a4136]">
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
              <span className="inline-flex items-center gap-1 text-[#065f46]">
                <CheckCircle2 className="h-3 w-3 text-[#10b981]" />
                {byStatus.up || 0}
              </span>
              <span className="text-[#e2e8f0]">·</span>
              <span className="inline-flex items-center gap-1 text-[#92400e]">
                <AlertTriangle className="h-3 w-3 text-[#f59e0b]" />
                {byStatus.degraded || 0}
              </span>
              <span className="text-[#e2e8f0]">·</span>
              <span className="inline-flex items-center gap-1 text-[#991b1b]">
                <AlertCircle className="h-3 w-3 text-[#ef4444]" />
                {byStatus.down || 0}
              </span>
              <span className="text-[#e2e8f0]">·</span>
              <span className="inline-flex items-center gap-1 text-[#59605f]">
                <HelpCircle className="h-3 w-3 text-[#64748b]" />
                {byStatus.unknown || 0}
              </span>
            </div>
          }
        />

        <StatCard
          label="Active Incidents"
          value={incidents.activeCount}
          icon={AlertTriangle}
          valueClassName={incidents.activeCount > 0 ? 'text-[#ba1a1a]' : 'text-[#131b2e]'}
          hint={
            incidents.activeCount === 0 ? (
              <span className="text-[#065f46] font-medium inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-[#10b981]" />
                <span>All systems operational</span>
              </span>
            ) : (
              <span className="text-[#ba1a1a] font-medium">
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

      {/* Applications Health Section (Responsive: Table on Desktop, Cards on Mobile) */}
      <div className="rounded-xl border border-[#e2e8f0] bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#e2e8f0] px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#131b2e]">Application Health</h2>
            <p className="text-xs text-[#5a4136]">
              Sorted by operational priority (outages first)
            </p>
          </div>
          <Link
            to="/applications"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#a23f00] hover:underline"
          >
            <span>View all applications</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f2f3ff]/60 border-b border-[#e2e8f0] text-xs uppercase font-semibold text-[#5a4136] tracking-wider">
              <tr>
                <th className="px-6 py-3">Application</th>
                <th className="px-6 py-3">Environment</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Uptime ({range})</th>
                <th className="px-6 py-3">Last Checked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eaedff]">
              {applicationsTable.map((app) => (
                <tr key={app.id} className="hover:bg-[#f2f3ff]/40 transition-colors">
                  <td className="px-6 py-3.5">
                    <Link
                      to={`/applications/${app.id}`}
                      className="font-semibold text-[#131b2e] hover:text-[#a23f00] focus:outline-hidden"
                    >
                      {app.name}
                    </Link>
                    <div className="text-xs text-[#59605f] font-mono truncate max-w-xs mt-0.5">
                      {app.url}
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className="capitalize text-xs font-medium text-[#59605f] bg-[#f2f3ff] px-2.5 py-0.5 rounded-full border border-[#dae2fd]">
                      {app.environment}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <StatusBadge status={app.status} />
                  </td>
                  <td className="px-6 py-3.5 font-medium text-[#131b2e]">
                    {formatPercent(app.uptimePercent)}
                  </td>
                  <td className="px-6 py-3.5 text-xs text-[#59605f] whitespace-nowrap">
                    {formatRelative(app.lastCheckedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card Layout (Visible only on screens < md) */}
        <div className="md:hidden divide-y divide-[#eaedff]">
          {applicationsTable.map((app) => (
            <div key={app.id} className="p-4 flex flex-col gap-2.5 hover:bg-[#f2f3ff]/30 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    to={`/applications/${app.id}`}
                    className="font-semibold text-sm text-[#131b2e] hover:text-[#a23f00] block truncate"
                  >
                    {app.name}
                  </Link>
                  <p className="text-xs text-[#59605f] font-mono truncate mt-0.5">
                    {app.url}
                  </p>
                </div>
                <StatusBadge status={app.status} className="shrink-0" />
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-[#eaedff]/60">
                <span className="capitalize font-medium text-[#59605f] bg-[#f2f3ff] px-2 py-0.5 rounded-full border border-[#dae2fd]">
                  {app.environment}
                </span>
                <span className="font-semibold text-[#131b2e]">
                  Uptime: {formatPercent(app.uptimePercent)}
                </span>
                <span className="text-[#5a4136]">
                  {formatRelative(app.lastCheckedAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Two Column Grid: Recent Incidents & Recent Deployments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Incidents */}
        <div className="rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[#131b2e] flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#59605f]" aria-hidden="true" />
              <span>Recent Incidents</span>
            </h2>
            <Link
              to="/incidents"
              className="text-xs font-semibold text-[#a23f00] hover:underline inline-flex items-center gap-1"
            >
              <span>View all incidents</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {incidents.recent && incidents.recent.length > 0 ? (
            <ul className="divide-y divide-[#eaedff]">
              {incidents.recent.map((inc) => (
                <li key={inc._id} className="py-2.5 first:pt-0 last:pb-0">
                  <Link
                    to={`/incidents/${inc._id}`}
                    className="block p-2 -mx-2 rounded-lg hover:bg-[#f2f3ff]/60 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#131b2e] truncate hover:text-[#a23f00]">
                          {inc.title}
                        </p>
                        <p className="text-xs text-[#5a4136] mt-0.5">
                          {inc.applicationId?.name || 'Application'} &bull; Started {formatRelative(inc.startedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`text-2xs font-semibold px-2 py-0.5 rounded uppercase tracking-wider ${
                            inc.severity === 'critical'
                              ? 'bg-[#ffdad6] text-[#93000a]'
                              : inc.severity === 'high'
                              ? 'bg-[#ffdbcd] text-[#7c2e00]'
                              : inc.severity === 'medium'
                              ? 'bg-[#fffbeb] text-[#92400e]'
                              : 'bg-[#f2f3ff] text-[#59605f]'
                          }`}
                        >
                          {inc.severity}
                        </span>
                        <span
                          className={`text-2xs font-semibold px-2 py-0.5 rounded capitalize ${
                            inc.status === 'resolved'
                              ? 'bg-[#ecfdf5] text-[#065f46]'
                              : 'bg-[#ffdad6] text-[#93000a]'
                          }`}
                        >
                          {inc.status}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#59605f] py-6 text-center">
              No recent incidents recorded.
            </p>
          )}
        </div>

        {/* Recent Deployments */}
        <div className="rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[#131b2e] flex items-center gap-2">
              <Rocket className="h-4 w-4 text-[#59605f]" aria-hidden="true" />
              <span>Recent Deployments</span>
            </h2>
            <Link
              to="/deployments"
              className="text-xs font-semibold text-[#a23f00] hover:underline inline-flex items-center gap-1"
            >
              <span>View all deployments</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {deployments.recent && deployments.recent.length > 0 ? (
            <ul className="divide-y divide-[#eaedff]">
              {deployments.recent.map((dep) => {
                const targetUrl = dep.applicationId?._id
                  ? `/deployments?applicationId=${dep.applicationId._id}`
                  : '/deployments';

                return (
                  <li key={dep._id} className="py-2.5 first:pt-0 last:pb-0">
                    <Link
                      to={targetUrl}
                      className="block p-2 -mx-2 rounded-lg hover:bg-[#f2f3ff]/60 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-[#131b2e] bg-[#f2f3ff] border border-[#dae2fd] px-2 py-0.5 rounded">
                              {dep.version}
                            </span>
                            <span className="text-xs text-[#59605f] truncate font-medium">
                              {dep.applicationId?.name || 'Application'}
                            </span>
                          </div>
                          <p className="text-xs text-[#5a4136] mt-1">
                            Deployed {formatRelative(dep.startedAt)}
                          </p>
                        </div>
                        <span
                          className={`text-2xs font-semibold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                            dep.status === 'success'
                              ? 'bg-[#ecfdf5] text-[#065f46]'
                              : dep.status === 'failed'
                              ? 'bg-[#ffdad6] text-[#93000a]'
                              : 'bg-[#f2f3ff] text-[#59605f]'
                          }`}
                        >
                          {dep.status}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-[#59605f] py-6 text-center">
              No recent deployments logged.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
