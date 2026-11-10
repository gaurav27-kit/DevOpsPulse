import React from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Activity,
  ExternalLink
} from 'lucide-react';
import { useIncident } from '../hooks/useIncidents.js';
import { SeverityBadge } from '../components/SeverityBadge.jsx';
import { IncidentStatusBadge } from '../components/IncidentStatusBadge.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { StatusActions } from '../components/StatusActions.jsx';
import { IncidentTimeline } from '../components/IncidentTimeline.jsx';
import { AddNoteForm } from '../components/AddNoteForm.jsx';
import { Spinner } from '../components/Spinner.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { Button } from '../components/Button.jsx';
import { formatDateTime, formatRelative } from '../utils/formatDate.js';
import { formatElapsedDuration } from '../utils/formatDuration.js';

export function IncidentDetailsPage() {
  const { id } = useParams();
  const { data: incident, isLoading, isError, error, refetch } = useIncident(id);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-12 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !incident) {
    return (
      <div className="max-w-md mx-auto py-12">
        <ErrorState
          title="Incident not found"
          message={error?.message || 'The incident you requested does not exist or belongs to another user.'}
          action={
            <Link to="/incidents">
              <Button variant="primary">Back to Incidents</Button>
            </Link>
          }
          onRetry={refetch}
        />
      </div>
    );
  }

  const isResolved = incident.status === 'resolved';
  const durationStr = isResolved
    ? formatElapsedDuration(incident.startedAt, incident.resolvedAt)
    : `Ongoing (${formatElapsedDuration(incident.startedAt)})`;

  const application = incident.applicationId;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link
          to="/incidents"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5a4136] hover:text-[#131b2e] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Incidents</span>
        </Link>
        <span className="font-mono text-2xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-[#f2f3ff] text-[#59605f] border border-[#dae2fd]">
          Incident {incident._id.slice(-6)}
        </span>
      </div>

      {/* Incident Header Card */}
      <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-[#eaedff]">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <SeverityBadge severity={incident.severity} />
              <IncidentStatusBadge status={incident.status} />
            </div>

            <h1 className="text-2xl font-bold text-[#131b2e] tracking-tight">
              {incident.title}
            </h1>

            {application && (
              <div className="flex items-center gap-2 pt-1 text-xs text-[#5a4136]">
                <span>Affected Service:</span>
                <Link
                  to={`/applications/${application._id}`}
                  className="font-semibold text-[#a23f00] hover:text-[#ff6700] hover:underline inline-flex items-center gap-1"
                >
                  <span>{application.name}</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
                {application.status && <StatusBadge status={application.status} />}
              </div>
            )}
          </div>

          {/* Status Action Buttons */}
          <div className="self-start sm:self-auto shrink-0">
            <StatusActions incident={incident} onRefetch={refetch} />
          </div>
        </div>

        {/* Incident Facts Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          <div className="space-y-1">
            <span className="text-xs font-medium text-[#5a4136] flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#59605f]" />
              <span>Started</span>
            </span>
            <p className="text-sm font-semibold text-[#131b2e]" title={formatDateTime(incident.startedAt)}>
              {formatRelative(incident.startedAt)}
            </p>
            <p className="text-2xs text-[#5a4136]">{formatDateTime(incident.startedAt)}</p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-[#5a4136] flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-[#59605f]" />
              <span>Last Failure</span>
            </span>
            <p className="text-sm font-semibold text-[#131b2e]" title={formatDateTime(incident.lastFailureAt)}>
              {formatRelative(incident.lastFailureAt)}
            </p>
            <p className="text-2xs text-[#5a4136]">{formatDateTime(incident.lastFailureAt)}</p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-[#5a4136] flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-[#59605f]" />
              <span>Failure Probes</span>
            </span>
            <p className="text-sm font-semibold text-[#131b2e] font-mono">
              {incident.failureCount} failed checks
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-[#5a4136] flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#10b981]" />
              <span>Duration</span>
            </span>
            <p className="text-sm font-semibold text-[#131b2e]">
              {durationStr}
            </p>
            {isResolved && incident.resolvedAt && (
              <p className="text-2xs text-[#5a4136]">Resolved {formatRelative(incident.resolvedAt)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Incident Timeline Section */}
      <div className="rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-semibold text-[#131b2e]">Timeline & Activity Log</h2>
          <p className="text-xs text-[#5a4136]">
            Chronological audit log of automated system checks, notes, and status transitions.
          </p>
        </div>

        <IncidentTimeline updates={incident.updates || []} />
      </div>

      {/* Append Note Form (Available even for resolved incidents for post-incident review) */}
      <AddNoteForm incidentId={id} />
    </div>
  );
}
