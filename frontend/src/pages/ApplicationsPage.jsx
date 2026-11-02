import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Plus,
  Search,
  ArrowUpDown,
  ExternalLink,
  Eye,
  Edit2,
  Trash2,
  Server,
  FilterX
} from 'lucide-react';
import { useApplicationsList, useDeleteApplication } from '../hooks/useApplications.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { AlertBanner } from '../components/AlertBanner.jsx';
import { Spinner } from '../components/Spinner.jsx';
import { Button } from '../components/Button.jsx';
import { formatRelative, formatDateTime } from '../utils/formatDate.js';

export function ApplicationsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read URL search params with sensible defaults
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const sortBy = searchParams.get('sortBy') || 'createdAt';
  const order = searchParams.get('order') || 'desc';
  const status = searchParams.get('status') || '';
  const environment = searchParams.get('environment') || '';
  const initialQ = searchParams.get('q') || '';

  // Local state for immediate typing feedback
  const [searchTerm, setSearchTerm] = useState(initialQ);
  const debouncedSearch = useDebounce(searchTerm, 400);

  // Success flash message passed from navigation redirects
  const [flashMessage, setFlashMessage] = useState(location.state?.message || '');

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const deleteMutation = useDeleteApplication();

  // Synchronize debounced search input with URL search parameters
  useEffect(() => {
    const currentQ = searchParams.get('q') || '';
    if (debouncedSearch !== currentQ) {
      updateUrlParams({ q: debouncedSearch || undefined, page: 1 });
    }
  }, [debouncedSearch]);

  // Keep search input in sync if user clicks browser back/forward
  useEffect(() => {
    setSearchTerm(searchParams.get('q') || '');
  }, [searchParams]);

  // Helper to update query parameters in URL (resets page on filter changes)
  const updateUrlParams = (newParams) => {
    const nextParams = new URLSearchParams(searchParams);
    Object.entries(newParams).forEach(([key, val]) => {
      if (val === undefined || val === '') {
        nextParams.delete(key);
      } else {
        nextParams.set(key, String(val));
      }
    });
    setSearchParams(nextParams);
  };

  const handleFilterChange = (key, value) => {
    updateUrlParams({
      [key]: value || undefined,
      page: 1 // Filter updates reset page back to 1
    });
  };

  const handleSortChange = (newSortBy) => {
    updateUrlParams({ sortBy: newSortBy, page: 1 });
  };

  const toggleSortOrder = () => {
    updateUrlParams({ order: order === 'asc' ? 'desc' : 'asc', page: 1 });
  };

  const clearAllFilters = () => {
    setSearchTerm('');
    setSearchParams(new URLSearchParams({ page: '1', limit: '10', sortBy: 'createdAt', order: 'desc' }));
  };

  // Build query parameter object for TanStack Query hook
  const queryParams = {
    page,
    limit,
    sortBy,
    order,
    ...(status && { status }),
    ...(environment && { environment }),
    ...(debouncedSearch && { q: debouncedSearch })
  };

  const { data, isLoading, isError, error, refetch } = useApplicationsList(queryParams);
  const applications = data?.applications || [];
  const pagination = data?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 };

  const hasActiveFilters = Boolean(status || environment || debouncedSearch);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget._id);
      setDeleteTarget(null);
      setFlashMessage(`Application '${deleteTarget.name}' was successfully deleted.`);
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Flash Feedback Banner */}
      {flashMessage && (
        <AlertBanner
          message={flashMessage}
          type="success"
          onDismiss={() => setFlashMessage('')}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Monitored Applications</h1>
          <p className="mt-1 text-sm text-slate-500">
            Track availability, configuration, and endpoint status across your environments.
          </p>
        </div>
        <Link to="/applications/new">
          <Button variant="primary" className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            <span>Add application</span>
          </Button>
        </Link>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Box */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name or URL..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              aria-label="Search applications"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              aria-label="Filter by status"
            >
              <option value="">All Statuses</option>
              <option value="up">Operational (Up)</option>
              <option value="degraded">Degraded</option>
              <option value="down">Down</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>

          {/* Environment Filter */}
          <div>
            <select
              value={environment}
              onChange={(e) => handleFilterChange('environment', e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              aria-label="Filter by environment"
            >
              <option value="">All Environments</option>
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
            </select>
          </div>

          {/* Sort & Order Controls */}
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              aria-label="Sort by field"
            >
              <option value="createdAt">Newest</option>
              <option value="name">Name A-Z</option>
              <option value="status">Status</option>
              <option value="lastCheckedAt">Last checked</option>
            </select>

            <button
              type="button"
              onClick={toggleSortOrder}
              className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shrink-0"
              title={`Sort order: ${order.toUpperCase()}`}
              aria-label={`Toggle sort order, currently ${order}`}
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <ErrorState
          title="Could not load applications"
          message={error?.message || 'Failed to communicate with API server.'}
          onRetry={refetch}
        />
      ) : applications.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            icon={FilterX}
            title="No matching applications"
            description="No monitored applications match your current filter and search criteria."
            action={
              <Button variant="outline" onClick={clearAllFilters} className="text-xs py-2 px-4">
                Clear all filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Server}
            title="No applications registered"
            description="Start monitoring endpoint reliability and uptime by adding your first application."
            action={
              <Link to="/applications/new">
                <Button variant="primary" className="text-xs py-2 px-4 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  <span>Add your first application</span>
                </Button>
              </Link>
            }
          />
        )
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500 tracking-wider">
                <tr>
                  <th scope="col" className="px-6 py-3.5">Name & URL</th>
                  <th scope="col" className="px-6 py-3.5">Environment</th>
                  <th scope="col" className="px-6 py-3.5">Status</th>
                  <th scope="col" className="px-6 py-3.5">Check Interval</th>
                  <th scope="col" className="px-6 py-3.5">Last Checked</th>
                  <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.map((app) => (
                  <tr key={app._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{app.name}</div>
                      <a
                        href={app.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1 mt-0.5 truncate max-w-xs"
                      >
                        <span className="truncate">{app.url}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                      </a>
                    </td>
                    <td className="px-6 py-4">
                      <span className="capitalize text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {app.environment}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-600">
                      {app.checkIntervalSeconds}s
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500" title={formatDateTime(app.lastCheckedAt)}>
                      {formatRelative(app.lastCheckedAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          to={`/applications/${app._id}`}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="View details"
                          aria-label={`View details for ${app.name}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <Link
                          to={`/applications/${app._id}/edit`}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Edit application"
                          aria-label={`Edit ${app.name}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(app)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete application"
                          aria-label={`Delete ${app.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Card View */}
          <div className="md:hidden divide-y divide-slate-100">
            {applications.map((app) => (
              <div key={app._id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">{app.name}</h3>
                    <a
                      href={app.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 inline-flex items-center gap-1 mt-0.5 truncate max-w-[240px]"
                    >
                      <span className="truncate">{app.url}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                    </a>
                  </div>
                  <StatusBadge status={app.status} />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                  <span>Env: <strong className="font-medium text-slate-700 capitalize">{app.environment}</strong></span>
                  <span>Checked: <strong className="font-medium text-slate-700">{formatRelative(app.lastCheckedAt)}</strong></span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-50">
                  <Link to={`/applications/${app._id}`}>
                    <Button variant="outline" className="text-xs py-1 px-2.5 flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      <span>View</span>
                    </Button>
                  </Link>
                  <Link to={`/applications/${app._id}/edit`}>
                    <Button variant="outline" className="text-xs py-1 px-2.5 flex items-center gap-1">
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    onClick={() => setDeleteTarget(app)}
                    className="text-xs py-1 px-2.5 text-rose-600 hover:bg-rose-50 border-rose-200 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          <div className="p-4 bg-slate-50/50">
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              onPageChange={(newPage) => updateUrlParams({ page: newPage })}
            />
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Cascade Deletion */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title={`Delete '${deleteTarget?.name}'?`}
        description="This action will permanently delete this application endpoint and all of its future health check results, outage incidents, and recorded deployments. This cannot be undone."
        confirmText="Yes, delete application"
        cancelText="Cancel"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

