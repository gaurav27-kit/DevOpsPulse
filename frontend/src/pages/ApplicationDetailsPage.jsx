import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
  LineChart
} from 'lucide-react';
import { useApplication, useDeleteApplication } from '../hooks/useApplications.js';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { Spinner } from '../components/Spinner.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { Button } from '../components/Button.jsx';
import { formatDateTime, formatRelative } from '../utils/formatDate.js';

/**
 * Detailed view presenting configuration, metadata, and placeholder telemetry for a single application.
 */
export function ApplicationDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: application, isLoading, isError, error, refetch } = useApplication(id);
  const deleteMutation = useDeleteApplication();

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

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

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-12 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !application) {
    return (
      <div className="max-w-md mx-auto py-12">
        <ErrorState
          title="Application not found"
          message={error?.message || 'The application you are searching for does not exist or belongs to another user.'}
          action={
            <Link to="/applications">
              <Button variant="primary" className="text-xs py-2 px-4">
                Back to Applications
              </Button>
            </Link>
          }
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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

      {/* Main Details Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        {/* Header Header Info */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{application.name}</h1>
              <StatusBadge status={application.status} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <a
                href={application.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1.5 font-medium break-all"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
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
              <Activity className="w-4 h-4 text-slate-400" />
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

      {/* Telemetry Placeholder Section */}
      <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto">
          <LineChart className="w-6 h-6" aria-hidden="true" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">Health checks and charts coming soon</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Automated background monitoring, latency histograms, and uptime percentage metrics will be connected in Step 5.
        </p>
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

