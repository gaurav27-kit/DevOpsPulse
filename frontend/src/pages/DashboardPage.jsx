import React from 'react';
import { Activity, ShieldCheck, Clock, Server } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';

/**
 * Dashboard landing view showcasing active user greeting and foundational layout.
 * Data features (apps, metrics, incidents) will be attached in subsequent steps.
 */
export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      {/* Welcome Hero Card */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Welcome, {user?.name || 'Developer'}!
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Your DevOpsPulse monitoring workspace is configured and ready.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold self-start sm:self-auto">
            <ShieldCheck className="w-4 h-4 text-emerald-600" aria-hidden="true" />
            <span>Session Active</span>
          </div>
        </div>
      </div>

      {/* Metrics Placeholders for Upcoming Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Server className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Monitored Services</p>
            <p className="text-xl font-bold text-slate-900">0</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Activity className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Average Uptime</p>
            <p className="text-xl font-bold text-slate-900">--%</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Open Incidents</p>
            <p className="text-xl font-bold text-slate-900">0</p>
          </div>
        </div>
      </div>

      {/* Empty State Card */}
      <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center">
        <Server className="w-10 h-10 text-slate-400 mx-auto mb-3" aria-hidden="true" />
        <h3 className="text-base font-semibold text-slate-800">No applications registered yet</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
          Application management and health checks will be unlocked in the next step.
        </p>
      </div>
    </div>
  );
}

