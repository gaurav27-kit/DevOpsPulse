import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Target, Filter, ExternalLink, ArrowRight, ShieldCheck } from 'lucide-react';
import { useSloList } from '../hooks/useSlo.js';
import { SloStatusBadge } from '../components/SloStatusBadge.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { Skeleton } from '../components/Skeleton.jsx';
import { formatPercent } from '../utils/formatPercent.js';
import { formatPercentage, getExhaustedBudgetNote } from '../utils/sloFormatters.js';

export function SlosPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const statusFilter = searchParams.get('status') || 'all';
  const sortBy = searchParams.get('sortBy') || 'createdAt';
  const sortOrder = searchParams.get('sortOrder') || 'desc';

  const queryParams = {
    page,
    limit: 10,
    sortBy,
    sortOrder,
    ...(statusFilter !== 'all' ? { status: statusFilter } : {})
  };

  const { data, isLoading, isError, error, refetch } = useSloList(queryParams);

  const slos = data?.slos || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  const handleStatusChange = (e) => {
    const val = e.target.value;
    const next = new URLSearchParams(searchParams);
    if (val === 'all') {
      next.delete('status');
    } else {
      next.set('status', val);
    }
    next.set('page', '1');
    setSearchParams(next);
  };

  const handleSortChange = (e) => {
    const val = e.target.value;
    const next = new URLSearchParams(searchParams);
    next.set('sortBy', val);
    next.set('page', '1');
    setSearchParams(next);
  };

  const handlePageChange = (newPage) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(newPage));
    setSearchParams(next);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6" data-testid="slos-page">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#131b2e] tracking-tight flex items-center gap-2">
            <Target className="w-6 h-6 text-indigo-600" aria-hidden="true" />
            <span>Service Level Objectives</span>
          </h1>
          <p className="text-xs text-[#5a4136] mt-1">
            Monitor reliability targets, remaining error budgets, and multi-window burn rates across all monitored services.
          </p>
        </div>
      </div>

      {/* Filter and Sort Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <label htmlFor="status-filter" className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            <span>Status:</span>
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={handleStatusChange}
            className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-md px-3 py-1.5 min-h-[40px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            data-testid="slo-status-filter"
          >
            <option value="all">All Statuses</option>
            <option value="healthy">Healthy</option>
            <option value="at_risk">At risk</option>
            <option value="breached">Breached</option>
            <option value="insufficient_data">Not enough data</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="sort-by" className="text-xs font-semibold text-slate-600">
            Sort by:
          </label>
          <select
            id="sort-by"
            value={sortBy}
            onChange={handleSortChange}
            className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-md px-3 py-1.5 min-h-[40px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            data-testid="slo-sort-select"
          >
            <option value="createdAt">Date Created</option>
            <option value="name">SLO Name</option>
          </select>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="p-8 text-center bg-white rounded-xl border border-rose-200 shadow-sm">
          <p className="text-sm font-semibold text-rose-800">Failed to load Service Level Objectives.</p>
          <p className="text-xs text-rose-600 mt-1">{error?.message || 'Please check your connection and try again.'}</p>
          <button
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-rose-600 rounded-md hover:bg-rose-700 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : slos.length === 0 ? (
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm" data-testid="slos-empty-state">
          <EmptyState
            icon={Target}
            title={statusFilter !== 'all' ? `No ${statusFilter.replace('_', ' ')} SLOs found` : 'No SLOs configured'}
            description={
              statusFilter !== 'all'
                ? 'Try selecting a different status filter or clearing filters.'
                : 'Define reliability targets and monitor error budgets by visiting an application details page.'
            }
            action={
              statusFilter !== 'all' ? (
                <button
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.delete('status');
                    next.set('page', '1');
                    setSearchParams(next);
                  }}
                  className="px-4 py-2 min-h-[40px] text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-md"
                >
                  Clear Status Filter
                </button>
              ) : (
                <Link
                  to="/applications"
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm"
                >
                  <span>Go to Applications</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              )
            }
          />
        </div>
      ) : (
        <>
          {/* Desktop Table View (>= 768px) */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="py-3.5 px-4">Application</th>
                    <th scope="col" className="py-3.5 px-4">SLO Target</th>
                    <th scope="col" className="py-3.5 px-4">Current SLI</th>
                    <th scope="col" className="py-3.5 px-4">Budget Consumed</th>
                    <th scope="col" className="py-3.5 px-4">Status</th>
                    <th scope="col" className="py-3.5 px-4">1h Burn</th>
                    <th scope="col" className="py-3.5 px-4">6h Burn</th>
                    <th scope="col" className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {slos.map((item) => {
                    const appId = item.application?._id || item.applicationId?._id || item.applicationId || item.slo?.applicationId;
                    const appName = item.application?.name || item.applicationId?.name || item.slo?.name || 'Application';
                    const targetPct = item.slo?.targetPercent ?? item.targetPercent;
                    const windowDays = item.slo?.windowDays ?? item.windowDays ?? 30;

                    return (
                      <tr key={item._id || appId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          <Link
                            to={`/applications/${appId}`}
                            className="hover:text-indigo-600 hover:underline flex items-center gap-1.5"
                          >
                            <span>{appName}</span>
                          </Link>
                        </td>
                        <td className="py-3.5 px-4">
                          <div>
                            <span className="font-mono font-medium text-slate-800">{targetPct}%</span>
                            <span className="text-[11px] text-slate-500 block">{windowDays}d window</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-medium text-slate-800">
                          {item.sli !== null && item.sli !== undefined ? `${item.sli.toFixed(2)}%` : '—'}
                        </td>
                        <td className="py-3.5 px-4">
                          {item.budgetConsumedPct !== null && item.budgetConsumedPct !== undefined ? (
                            <div>
                              <span
                                className={`font-mono font-bold ${
                                  item.budgetConsumedPct >= 100
                                    ? 'text-rose-600'
                                    : item.budgetConsumedPct >= 75
                                    ? 'text-amber-700'
                                    : 'text-slate-800'
                                }`}
                              >
                                {formatPercentage(item.budgetConsumedPct, 1)}
                              </span>
                              {item.budgetConsumedPct > 1000 && (
                                <span className="block text-[11px] text-rose-600 font-medium mt-0.5">
                                  {getExhaustedBudgetNote(item.budgetConsumedPct)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <SloStatusBadge status={item.status} />
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          {item.burnRate1h !== null && item.burnRate1h !== undefined ? (
                            <span className={item.fastBurn ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                              {item.burnRate1h.toFixed(1)}x
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          {item.burnRate6h !== null && item.burnRate6h !== undefined ? (
                            <span className={item.slowBurn ? 'text-amber-700 font-bold' : 'text-slate-700'}>
                              {item.burnRate6h.toFixed(1)}x
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Link
                            to={`/applications/${appId}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline min-h-[40px] px-2 py-1"
                          >
                            <span>View</span>
                            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View (< 768px, no horizontal scroll at 360px) */}
          <div className="md:hidden space-y-3">
            {slos.map((item) => {
              const appId = item.application?._id || item.applicationId?._id || item.applicationId || item.slo?.applicationId;
              const appName = item.application?.name || item.applicationId?.name || item.slo?.name || 'Application';
              const targetPct = item.slo?.targetPercent ?? item.targetPercent;
              const windowDays = item.slo?.windowDays ?? item.windowDays ?? 30;

              return (
                <div key={item._id || appId} className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link to={`/applications/${appId}`} className="font-bold text-sm text-slate-900 hover:underline">
                        {appName}
                      </Link>
                      <span className="text-xs text-slate-500 block">
                        Target: <strong className="font-mono">{targetPct}%</strong> ({windowDays}d)
                      </span>
                    </div>
                    <SloStatusBadge status={item.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
                    <div>
                      <span className="text-slate-500 block">Current SLI:</span>
                      <span className="font-mono font-semibold text-slate-800">
                        {item.sli !== null && item.sli !== undefined ? `${item.sli.toFixed(2)}%` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Budget Consumed:</span>
                      <span
                        className={`font-mono font-bold ${
                          item.budgetConsumedPct >= 100
                            ? 'text-rose-600'
                            : item.budgetConsumedPct >= 75
                            ? 'text-amber-700'
                            : 'text-slate-800'
                        }`}
                      >
                        {item.budgetConsumedPct !== null && item.budgetConsumedPct !== undefined
                          ? formatPercentage(item.budgetConsumedPct, 1)
                          : '—'}
                      </span>
                      {item.budgetConsumedPct > 1000 && (
                        <span className="block text-[11px] text-rose-600 font-medium mt-0.5">
                          {getExhaustedBudgetNote(item.budgetConsumedPct)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                    <span className="text-slate-500 font-mono">
                      1h: {item.burnRate1h != null ? `${item.burnRate1h.toFixed(1)}x` : '—'} | 6h: {item.burnRate6h != null ? `${item.burnRate6h.toFixed(1)}x` : '—'}
                    </span>
                    <Link
                      to={`/applications/${appId}`}
                      className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline min-h-[40px] px-2"
                    >
                      <span>Manage</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="pt-2">
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={handlePageChange}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
