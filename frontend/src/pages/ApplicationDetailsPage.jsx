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
  CheckCircle2,
  AlertTriangle,
  Rocket,
  Plus,
  ArrowRight,
  Target,
  X
} from 'lucide-react';
import { useApplication, useDeleteApplication } from '../hooks/useApplications.js';
import {
  useApplicationUptime,
  useApplicationHealthChecks,
  useRunCheck
} from '../hooks/useApplicationHealth.js';
import {
  useApplicationSlo,
  useCreateSlo,
  useUpdateSlo,
  useDeleteSlo
} from '../hooks/useSlo.js';
import { SloStatusBadge } from '../components/SloStatusBadge.jsx';
import { ErrorBudgetGauge } from '../components/ErrorBudgetGauge.jsx';
import { BurnRateCard } from '../components/BurnRateCard.jsx';
import { BurnDownChart } from '../components/BurnDownChart.jsx';
import { SloForm } from '../components/SloForm.jsx';
import { PartialWindowNotice } from '../components/PartialWindowNotice.jsx';
import { useIncidentsList } from '../hooks/useIncidents.js';
import { useDeploymentsList } from '../hooks/useDeployments.js';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { SeverityBadge } from '../components/SeverityBadge.jsx';
import { IncidentStatusBadge } from '../components/IncidentStatusBadge.jsx';
import { DeploymentStatusBadge } from '../components/DeploymentStatusBadge.jsx';
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

  // App-specific incidents & deployments
  const { data: appIncidentsData } = useIncidentsList({ applicationId: id, limit: 5 });
  const { data: appDeploymentsData } = useDeploymentsList({ applicationId: id, limit: 5 });

  const runCheckMutation = useRunCheck(id);
  const deleteMutation = useDeleteApplication();

  // SLO Query & Mutations
  const {
    data: sloData,
    isLoading: isSloLoading,
    isError: isSloError,
    error: sloError
  } = useApplicationSlo(id);
  const createSloMutation = useCreateSlo(id);
  const updateSloMutation = useUpdateSlo(id);
  const deleteSloMutation = useDeleteSlo(id);

  // Local state
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [checkBanner, setCheckBanner] = useState(null);
  const [isSloModalOpen, setIsSloModalOpen] = useState(false);
  const [isDeleteSloOpen, setIsDeleteSloOpen] = useState(false);
  const [sloServerError, setSloServerError] = useState(null);
  const [sloBanner, setSloBanner] = useState(null);

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

  const handleToggleFailuresOnly = () => {
    const next = new URLSearchParams(searchParams);
    if (!hcFailed) {
      next.set('hcFailed', 'true');
    } else {
      next.delete('hcFailed');
    }
    next.set('hcPage', '1');
    setSearchParams(next);
  };

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

  const handleOpenCreateSlo = () => {
    setSloServerError(null);
    setIsSloModalOpen(true);
  };

  const handleOpenEditSlo = () => {
    setSloServerError(null);
    setIsSloModalOpen(true);
  };

  const handleSloSubmit = async (formData) => {
    setSloServerError(null);
    try {
      if (sloData?.slo) {
        await updateSloMutation.mutateAsync(formData);
        setSloBanner({ type: 'success', message: 'SLO configuration updated successfully.' });
      } else {
        await createSloMutation.mutateAsync(formData);
        setSloBanner({ type: 'success', message: 'SLO configured successfully.' });
      }
      setIsSloModalOpen(false);
    } catch (err) {
      setSloServerError(err);
    }
  };

  const handleDeleteSlo = async () => {
    try {
      await deleteSloMutation.mutateAsync();
      setIsDeleteSloOpen(false);
      setSloBanner({ type: 'success', message: 'SLO removed successfully.' });
    } catch (err) {
      console.error('Delete SLO error:', err);
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
  const appIncidents = appIncidentsData?.incidents || [];
  const appDeployments = appDeploymentsData?.deployments || [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Navigation & Actions Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          to="/applications"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5a4136] hover:text-[#131b2e] transition-colors"
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
            className="text-xs py-1.5 px-3.5 flex items-center gap-1.5 min-h-[38px] font-semibold"
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
            <Button variant="outline" className="text-xs py-1.5 px-3 flex items-center gap-1.5 min-h-[38px]">
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </Button>
          </Link>

          <Button
            variant="outline"
            onClick={() => setIsDeleteOpen(true)}
            className="text-xs py-1.5 px-3 text-[#ba1a1a] hover:bg-[#ffdad6]/40 border-[#ffb4ab] flex items-center gap-1.5 min-h-[38px]"
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
      <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-[#eaedff]">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-[#131b2e] tracking-tight">
                {application.name}
              </h1>
              <StatusBadge status={application.status} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <a
                href={application.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#a23f00] hover:text-[#ff6700] hover:underline inline-flex items-center gap-1.5 font-medium font-mono break-all"
              >
                <span>{application.url}</span>
                <ExternalLink className="w-4 h-4 shrink-0" aria-hidden="true" />
              </a>
            </div>
          </div>

          <span className="capitalize text-xs font-semibold px-3 py-1 rounded-full bg-[#f2f3ff] text-[#59605f] self-start sm:self-auto border border-[#dae2fd]">
            {application.environment}
          </span>
        </div>

        {/* Configuration & Schedule Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 pt-6">
          <div className="space-y-1">
            <span className="text-xs font-medium text-[#5a4136] flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#59605f]" />
              <span>Check Interval</span>
            </span>
            <p className="text-base font-semibold text-[#131b2e] font-mono">{application.checkIntervalSeconds} seconds</p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-[#5a4136] flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-[#59605f]" />
              <span>Request Timeout</span>
            </span>
            <p className="text-base font-semibold text-[#131b2e] font-mono">{application.timeoutMs} ms</p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-[#5a4136] flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-[#59605f]" />
              <span>Last Checked</span>
            </span>
            <p className="text-base font-semibold text-[#131b2e]" title={formatDateTime(application.lastCheckedAt)}>
              {formatRelative(application.lastCheckedAt)}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-[#5a4136] flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#10b981]" />
              <span>Last Successful</span>
            </span>
            <p className="text-base font-semibold text-[#131b2e]" title={formatDateTime(application.lastSuccessfulAt)}>
              {formatRelative(application.lastSuccessfulAt)}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-[#5a4136] flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#59605f]" />
              <span>Next Check Scheduled</span>
            </span>
            <p className="text-base font-semibold text-[#131b2e]" title={formatDateTime(application.nextCheckAt)}>
              {formatRelative(application.nextCheckAt)}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-[#5a4136] flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[#59605f]" />
              <span>Registered On</span>
            </span>
            <p className="text-base font-semibold text-[#131b2e]">{formatDateTime(application.createdAt)}</p>
          </div>
        </div>
      </div>

      {/* SLO Notification Banner */}
      {sloBanner && (
        <AlertBanner
          type={sloBanner.type}
          message={sloBanner.message}
          onDismiss={() => setSloBanner(null)}
        />
      )}

      {/* Service Level Objective (SLO) Section Card */}
      <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm" data-testid="slo-section">
        <div className="flex items-center justify-between pb-4 border-b border-[#eaedff]">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-[#a23f00]" />
            <h2 className="text-lg font-bold text-[#131b2e]">Service Level Objective (SLO)</h2>
          </div>
          {sloData?.slo && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenEditSlo}
                className="text-xs py-1 px-3 flex items-center gap-1.5 min-h-[32px]"
                data-testid="edit-slo-btn"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit SLO</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDeleteSloOpen(true)}
                className="text-xs py-1 px-3 text-[#ba1a1a] hover:bg-[#ffdad6]/40 border-[#ffb4ab] flex items-center gap-1.5 min-h-[32px]"
                data-testid="delete-slo-btn"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete SLO</span>
              </Button>
            </div>
          )}
        </div>

        {isSloLoading ? (
          <div className="py-8">
            <Skeleton className="h-32" />
          </div>
        ) : !sloData?.slo ? (
          <div className="py-8 text-center max-w-md mx-auto space-y-3" data-testid="slo-empty-state">
            <div className="w-12 h-12 rounded-full bg-[#f2f3ff] text-[#59605f] flex items-center justify-center mx-auto">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#131b2e]">No SLO configured for this service</h3>
              <p className="text-xs text-[#5a4136] mt-1">
                Track availability against an error budget, calculate burn rate, and get alerts before budget exhaustion.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenCreateSlo}
              className="text-xs font-semibold py-2 px-4"
              data-testid="set-slo-btn"
            >
              Set an SLO
            </Button>
          </div>
        ) : (
          <div className="pt-5 space-y-6" data-testid="slo-configured-state">
            {/* Headline info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-bold text-[#131b2e]">{sloData.slo.name}</h3>
                  <SloStatusBadge status={sloData.status} />
                </div>
                <p className="text-xs text-[#5a4136] mt-0.5">
                  {sloData.slo.targetPercent}% target over {sloData.slo.windowDays} days rolling window
                </p>
              </div>
              {sloData.partialWindow && (
                <PartialWindowNotice
                  coveragePct={sloData.coveragePct}
                  windowDays={sloData.slo.windowDays}
                  totalChecks={sloData.totals?.total}
                />
              )}
            </div>

            {/* Visuals Grid: Gauge & Burn Rate */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <ErrorBudgetGauge
                budgetRemainingPct={sloData.budgetRemainingPct}
                budgetConsumedPct={sloData.budgetConsumedPct}
                totalChecks={sloData.totals?.total}
              />
              <BurnRateCard
                burnRate1h={sloData.burnRate1h}
                burnRate6h={sloData.burnRate6h}
                fastBurn={sloData.fastBurn}
                slowBurn={sloData.slowBurn}
              />
            </div>

            {/* Burn Down Chart */}
            <BurnDownChart
              series={sloData.series}
              windowDays={sloData.slo.windowDays}
            />
          </div>
        )}
      </div>

      {/* Analytics & Metrics Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div>
          <h2 className="text-lg font-bold text-[#131b2e]">Uptime & Latency Telemetry</h2>
          <p className="text-xs text-[#5a4136]">Aggregated historical performance metrics</p>
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
            valueClassName={summary.failedChecks > 0 ? 'text-[#ba1a1a]' : 'text-[#131b2e]'}
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
      <div className="rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[#131b2e]">Recent Health Checks</h3>
            <p className="text-xs text-[#5a4136]">
              Detailed chronological log of outgoing probes and responses
            </p>
          </div>

          <button
            type="button"
            onClick={handleToggleFailuresOnly}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer self-start sm:self-auto min-h-[36px] ${
              hcFailed
                ? 'bg-[#ffdad6] border-[#ffb4ab] text-[#93000a]'
                : 'bg-white border-[#dae2fd] text-[#59605f] hover:bg-[#f2f3ff]'
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
          <div className="py-12 text-center text-sm text-[#5a4136]">
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

      {/* Two Column Grid: App Incidents & App Deployments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Incidents for this application */}
        <div className="rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-[#131b2e] flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#59605f]" />
              <span>Incidents for this application</span>
            </h3>
            <Link
              to={`/incidents?applicationId=${id}`}
              className="text-xs font-semibold text-[#a23f00] hover:text-[#ff6700] hover:underline inline-flex items-center gap-1"
            >
              <span>View all</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {appIncidents.length > 0 ? (
            <ul className="divide-y divide-[#eaedff]">
              {appIncidents.map((inc) => (
                <li key={inc._id} className="py-2.5 first:pt-0 last:pb-0">
                  <Link
                    to={`/incidents/${inc._id}`}
                    className="block p-1.5 -mx-1.5 rounded-lg hover:bg-[#f2f3ff]/60 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#131b2e] truncate hover:text-[#a23f00]">
                          {inc.title}
                        </p>
                        <p className="text-xs text-[#5a4136] mt-0.5">
                          Started {formatRelative(inc.startedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <SeverityBadge severity={inc.severity} />
                        <IncidentStatusBadge status={inc.status} />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#5a4136] py-6 text-center">
              No incidents recorded for this application.
            </p>
          )}
        </div>

        {/* Deployments for this application */}
        <div className="rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-[#131b2e] flex items-center gap-2">
              <Rocket className="h-4 w-4 text-[#59605f]" />
              <span>Recent deployments</span>
            </h3>
            <div className="flex items-center gap-3">
              <Link
                to={`/deployments/new?applicationId=${id}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#a23f00] hover:text-[#ff6700] hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Record deployment</span>
              </Link>
              <span className="text-[#eaedff]">&bull;</span>
              <Link
                to={`/deployments?applicationId=${id}`}
                className="text-xs font-semibold text-[#5a4136] hover:text-[#131b2e] inline-flex items-center gap-1"
              >
                <span>View all</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          {appDeployments.length > 0 ? (
            <ul className="divide-y divide-[#eaedff]">
              {appDeployments.map((dep) => (
                <li key={dep._id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-[#131b2e] bg-[#f2f3ff] border border-[#dae2fd] px-2 py-0.5 rounded">
                          {dep.version}
                        </span>
                        {dep.branch && (
                          <span className="text-xs text-[#59605f] font-mono">
                            {dep.branch}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#5a4136] mt-1">
                        Deployed {formatRelative(dep.startedAt)}
                      </p>
                    </div>
                    <DeploymentStatusBadge status={dep.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#5a4136] py-6 text-center">
              No deployments recorded yet.
            </p>
          )}
        </div>
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

      {/* SLO Create/Edit Modal */}
      {isSloModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#283044]/50 backdrop-blur-xs overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="slo-modal-title"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-xl border border-[#e2e8f0] relative my-8">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#eaedff]">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-[#a23f00]" />
                <h3 id="slo-modal-title" className="text-lg font-bold text-[#131b2e]">
                  {sloData?.slo ? 'Edit Service Level Objective' : 'Configure Service Level Objective'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSloModalOpen(false)}
                className="text-[#5a4136] hover:text-[#131b2e] p-1 rounded-lg hover:bg-[#f2f3ff] transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <SloForm
              initialData={sloData?.slo || null}
              onSubmit={handleSloSubmit}
              onCancel={() => setIsSloModalOpen(false)}
              isSubmitting={createSloMutation.isPending || updateSloMutation.isPending}
              serverError={sloServerError}
            />
          </div>
        </div>
      )}

      {/* Delete SLO Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isDeleteSloOpen}
        title="Delete SLO?"
        description={`Are you sure you want to remove the Service Level Objective '${sloData?.slo?.name || ''}' from this application? Historical health check data will not be deleted, but budget tracking will stop.`}
        confirmText="Yes, delete SLO"
        cancelText="Cancel"
        variant="danger"
        isLoading={deleteSloMutation.isPending}
        onConfirm={handleDeleteSlo}
        onClose={() => setIsDeleteSloOpen(false)}
      />
    </div>
  );
}
