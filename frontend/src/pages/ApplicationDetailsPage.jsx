import React, { useState } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  Edit2,
  Trash2,
  Clock,
  Shield,
  Activity,
  Calendar,
  Layers,
  Play,
  Filter,
  CheckCircle2
} from 'lucide-react';
import { useApplication, useDeleteApplication } from '../hooks/useApplications.js';
import {
  useApplicationUptime,
  useApplicationHealthChecks,
  useRunCheck
} from '../hooks/useApplicationHealth.js';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { RangeSelector } from '../components/RangeSelector.jsx';
import { StatCard } from '../components/StatCard.jsx';
import { ResponseTimeChart } from '../components/ResponseTimeChart.jsx';
import { HealthCheckTable } from '../components/HealthCheckTable.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { Spinner } from '../components/Spinner.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { Skeleton } from '../components/Skeleton.jsx';
import { Button } from '../components/Button.jsx';
import { AlertBanner } from '../components/AlertBanner.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { formatDateTime, formatRelative } from '../utils/formatDate.js';
import { formatDuration } from '../utils/formatDuration.js';
import { formatPercent } from '../utils/formatPercent.js';

export function ApplicationDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL state
  const range = searchParams.get('range') || '24h';
  const hcPage = Math.max(1, Number(searchParams.get('hcPage')) || 1);
  const hcFailed = searchParams.get('hcFailed') === 'true';

  // API Queries & Mutations
  const { data: application, isLoading: isAppLoading, isError: isAppError, error: appError, refetch: refetchApp } = useApplication(id);
  const { data: uptimeData, isLoading: isUptimeLoading } = useApplicationUptime(id, range);

  const hcParams = {
    page: hcPage,
    limit: 10,
    ...(hcFailed ? { success: false } : {})
  };
  const {
    data: checksData,
    isLoading: isChecksLoading,
    isError: isChecksError,
    error: checksError,
    refetch: refetchChecks
  } = useApplicationHealthChecks(id, hcParams);

  const runCheckMutation = useRunCheck(id);
  const deleteMutation = useDeleteApplication();

  // Local state
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [checkBanner, setCheckBanner] = useState(null); // { type: 'success' | 'error' | 'warning', message: string }

  // Manual Check trigger handler
  const handleRunCheck = async () => {
    setCheckBanner(null);
    try {
      const response = await runCheckMutation.mutateAsync();
      const hc = response?.data?.healthCheck;
      if (hc?.success) {
        setCheckBanner({
          type: 'success',
          message: `Check completed: up, ${formatDuration(hc.responseTimeMs)} (HTTP ${hc.statusCode || 200})`
        });
      } else {
        const errDetail = hc?.errorType ? `(${hc.errorType.replace(/_/g, ' ')})` : '';
        setCheckBanner({
          type: 'warning',
          message: `Check completed: down ${errDetail} ${hc?.errorMessage ? `— ${hc.errorMessage}` : ''}`
        });
      }
    } catch (err) {
      if (err.statusCode === 409) {
        setCheckBanner({
          type: 'warning',
          message: 'A check is already running'
        });
      } else if (err.statusCode === 429) {
        setCheckBanner({
          type: 'error',
          message: 'Too many manual checks. Try again in a minute.'
        });
      } else {
        setCheckBanner({
          type: 'error',
          message: err.message || 'Failed to execute manual health check.'
        });
      }
    }
  };

  // Toggle "Failures only"
  const handleToggleFailuresOnly = () => {
    const next = new URLSearchParams(searchParams);
    if (!hcFailed) {
      next.set('hcFailed', 'true');
    } else {
      next.delete('hcFailed');
    }
    next.set('hcPage', '1'); // reset to page 1 on filter change
    setSearchParams(next);
  };

  // Page change
  const handlePageChange = (newPage) => {
    const next = new URLSearchParams(searchParams);
    if (newPage <= 1) {
      next.delete('hcPage');
    } else {
      next.set('hcPage', String(newPage));
    }
    setSearchParams(next);
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      navigate('/applications', {
        state: { message: `Application '${application?.name}' was permanently deleted.` }
      });
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  if (isAppLoading) {
    return (
      <div className="max-w-5xl mx-auto p-12 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isAppError || !application) {
    return (
      <div className="max-w-md mx-auto py-12">
        <ErrorState
          title="Application not found"
          message={appError?.message || 'The application you are searching for does not exist or belongs to another user.'}
          action={
            <Link to="/applications">
              <Button variant="primary" className="text-xs py-2 px-4">
                Back to Applications
              </Button>
            </Link>
          }
          onRetry={refetchApp}
        />
      </div>
    );
  }

  const summary = uptimeData?.summary || {
    totalChecks: 0,
    successfulChecks: 0,
    failedChecks: 0,
    uptimePercent: null,
    avgResponseTimeMs: null,
    minResponseTimeMs: null,
    maxResponseTimeMs: null
  };

  const healthChecks = checksData?.healthChecks || [];
  const pagination = checksData?.pagination || { page: 1, totalPages: 1, total: 0 };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Navigation & Actions Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          to="/applications"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Applications</span>
        </Link>

        <div className="flex items-center gap-2">
          {/* Check Now button */}
          <Button
            variant="primary"
            onClick={handleRunCheck}
            disabled={runCheckMutation.isPending}
            className="text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            {runCheckMutation.isPending ? (
              <>
                <Spinner size="sm" className="text-white" />
                <span>Checking...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Check now</span>
              </>
            )}
          </Button>

          <Link to={`/applications/${id}/edit`}>
            <Button variant="outline" className="text-xs py-1.5 px-3 flex items-center gap-1.5">
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </Button>
          </Link>

          <Button
            variant="outline"
            onClick={() => setIsDeleteOpen(true)}
            className="text-xs py-1.5 px-3 text-rose-600 hover:bg-rose-50 border-rose-200 flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </Button>
        </div>
      </div>

      {/* Manual Check Result Banner */}
      {checkBanner && (
        <AlertBanner
          type={checkBanner.type}
          message={checkBanner.message}
          onDismiss={() => setCheckBanner(null)}
        />
      )}

      {/* Header Info Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {application.name}
              </h1>
              <StatusBadge status={application.status} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <a
                href={application.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1.5 font-medium break-all"
              >
                <span>{application.url}</span>
                <ExternalLink className="w-4 h-4 shrink-0" aria-hidden="true" />
              </a>
            </div>
          </div>

          <span className="capitalize text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-800 self-start sm:self-auto border border-slate-200">
            {application.environment}
          </span>
        </div>

        {/* Configuration & Schedule Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 pt-6">
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>Check Interval</span>
            </span>
            <p className="text-base font-semibold text-slate-900">{application.checkIntervalSeconds} seconds</p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-slate-400" />
              <span>Request Timeout</span>
            </span>
            <p className="text-base font-semibold text-slate-900">{application.timeoutMs} ms</p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-slate-400" />
              <span>Last Checked</span>
            </span>
            <p className="text-base font-semibold text-slate-900" title={formatDateTime(application.lastCheckedAt)}>
              {formatRelative(application.lastCheckedAt)}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Last Successful</span>
            </span>
            <p className="text-base font-semibold text-slate-900" title={formatDateTime(application.lastSuccessfulAt)}>
              {formatRelative(application.lastSuccessfulAt)}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>Next Check Scheduled</span>
            </span>
            <p className="text-base font-semibold text-slate-900" title={formatDateTime(application.nextCheckAt)}>
              {formatRelative(application.nextCheckAt)}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-slate-400" />
              <span>Registered On</span>
            </span>
            <p className="text-base font-semibold text-slate-900">{formatDateTime(application.createdAt)}</p>
          </div>
        </div>
      </div>

      {/* Analytics & Metrics Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Uptime & Latency Telemetry</h2>
          <p className="text-xs text-slate-500">Aggregated historical performance metrics</p>
        </div>
        <RangeSelector />
      </div>

      {/* StatCards Row */}
      {isUptimeLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            label="Uptime"
            value={formatPercent(summary.uptimePercent)}
            hint={`Over ${range}`}
          />
          <StatCard
            label="Avg Latency"
            value={formatDuration(summary.avgResponseTimeMs)}
            hint="Successes only"
          />
          <StatCard
            label="Min Latency"
            value={formatDuration(summary.minResponseTimeMs)}
            hint="Fastest check"
          />
          <StatCard
            label="Max Latency"
            value={formatDuration(summary.maxResponseTimeMs)}
            hint="Slowest check"
          />
          <StatCard
            label="Total Checks"
            value={summary.totalChecks}
            hint="All recorded"
          />
          <StatCard
            label="Failed Checks"
            value={summary.failedChecks}
            valueClassName={summary.failedChecks > 0 ? 'text-rose-600' : 'text-slate-900'}
            hint={summary.failedChecks === 0 ? 'No failures' : 'Errors/timeouts'}
          />
        </div>
      )}

      {/* Latency Response Time Chart */}
      {isUptimeLoading ? (
        <Skeleton className="h-72" />
      ) : (
        <ResponseTimeChart
          series={uptimeData?.series || []}
          range={range}
        />
      )}

      {/* Recent Health Checks Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Recent Health Checks</h3>
            <p className="text-xs text-slate-500">
              Detailed chronological log of outgoing probes and responses
            </p>
          </div>

          {/* Filter toggle: Failures only */}
          <button
            type="button"
            onClick={handleToggleFailuresOnly}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer self-start sm:self-auto ${
              hcFailed
                ? 'bg-rose-50 border-rose-300 text-rose-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            aria-pressed={hcFailed}
          >
            <Filter className="h-3.5 w-3.5" />
            <span>{hcFailed ? 'Failures only (Active)' : 'Show failures only'}</span>
          </button>
        </div>

        {isChecksLoading ? (
          <div className="py-12 flex justify-center">
            <Spinner />
          </div>
        ) : isChecksError ? (
          <ErrorState
            title="Failed to load health check history"
            message={checksError?.message || 'Could not retrieve recent checks.'}
            onRetry={refetchChecks}
          />
        ) : healthChecks.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            {hcFailed ? 'No failed health checks recorded for this filter.' : 'No checks recorded yet.'}
          </div>
        ) : (
          <>
            <HealthCheckTable healthChecks={healthChecks} />
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              itemLabel="check"
              onPageChange={handlePageChange}
            />
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        title={`Delete '${application.name}'?`}
        description="Permanently remove this application endpoint and all of its associated health check metrics, incidents, and deployment events. This action is irreversible."
        confirmText="Yes, delete application"
        cancelText="Cancel"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onClose={() => setIsDeleteOpen(false)}
      />
    </div>
  );
}
