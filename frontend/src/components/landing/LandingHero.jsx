import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ShieldCheck, Zap, Activity } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';

export function LandingHero() {
  const { user } = useAuth();

  return (
    <section className="relative pt-28 pb-20 md:pt-36 md:pb-28 overflow-hidden bg-[#070d0d] text-white">
      {/* Background radial gradient glow */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] sm:w-[850px] h-[350px] sm:h-[450px] rounded-full bg-radial from-[#ff6700]/15 via-[#00f2fe]/5 to-transparent blur-3xl pointer-events-none -z-0"
        aria-hidden="true"
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/15 bg-white/5 text-slate-200 text-xs sm:text-sm font-medium mb-8 backdrop-blur-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
            <span>DevOpsPulse 2.0 • Production Reliability Platform</span>
          </div>

          {/* Single h1 split around a live status visual card */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
            <span className="block mb-6">Production Uptime Monitoring</span>

            {/* Central live status card visual */}
            <span className="block my-6 sm:my-8 text-left max-w-xl mx-auto font-normal text-base not-italic">
              <span className="block bg-[#0f172a]/95 border border-white/15 rounded-2xl p-5 shadow-2xl backdrop-blur-md relative overflow-hidden">
                {/* Header inside card */}
                <span className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-400" aria-hidden="true" />
                    <span className="font-mono text-sm font-semibold text-slate-100">api.production.internal</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Status: Up</span>
                  </span>
                </span>

                {/* Metrics row */}
                <span className="grid grid-cols-3 gap-2 py-1 text-center">
                  <span className="bg-white/5 rounded-lg p-2">
                    <span className="block text-[11px] uppercase tracking-wider text-slate-300 font-medium">Availability</span>
                    <span className="block text-base sm:text-lg font-bold text-white mt-0.5">99.98%</span>
                  </span>
                  <span className="bg-white/5 rounded-lg p-2">
                    <span className="block text-[11px] uppercase tracking-wider text-slate-300 font-medium">Latency</span>
                    <span className="block text-base sm:text-lg font-bold text-emerald-400 mt-0.5">42 ms</span>
                  </span>
                  <span className="bg-white/5 rounded-lg p-2">
                    <span className="block text-[11px] uppercase tracking-wider text-slate-300 font-medium">Error Budget</span>
                    <span className="block text-base sm:text-lg font-bold text-slate-200 mt-0.5">94.2% rem</span>
                  </span>
                </span>

                {/* Live SVG Sparkline */}
                <span className="block mt-4 mb-2">
                  <span className="flex items-center justify-between text-xs text-slate-300 mb-1 px-1">
                    <span>Rolling Response Time (24h)</span>
                    <span className="font-mono text-emerald-400">p95: 48ms</span>
                  </span>
                  <svg
                    className="w-full h-12 overflow-visible"
                    viewBox="0 0 300 48"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-label="Latency sparkline chart"
                    role="img"
                  >
                    <defs>
                      <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0 32 Q 25 30, 50 34 T 100 24 T 150 28 T 200 18 T 250 22 T 300 16 L 300 48 L 0 48 Z"
                      fill="url(#sparklineGrad)"
                    />
                    <path
                      d="M0 32 Q 25 30, 50 34 T 100 24 T 150 28 T 200 18 T 250 22 T 300 16"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      fill="none"
                      className="sparkline-path"
                    />
                  </svg>
                </span>

                {/* Auto-resolving incident badge */}
                <span className="block mt-2 pt-2.5 border-t border-white/10 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />
                    <span>Incident #204: Elevated Latency</span>
                  </span>
                  <span className="text-emerald-400 font-medium">Auto-resolved in 2m 14s</span>
                </span>
              </span>
            </span>

            <span className="block text-slate-200">Engineered for Resilient SRE Teams</span>
          </h1>

          {/* Sub-headline */}
          <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Automated multi-region health checks, multi-window SLO error budgets, cryptographically signed webhook alerts, and incident triage in a unified control plane.
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            {user ? (
              <Link
                to="/dashboard"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl font-bold text-base bg-[#ff802b] text-[#070d0d] hover:bg-[#ff9347] transition-all shadow-lg shadow-orange-500/20 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
              >
                <span>Open dashboard</span>
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </Link>
            ) : (
              <>
                <Link
                  to="/register"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl font-bold text-base bg-[#ff802b] text-[#070d0d] hover:bg-[#ff9347] transition-all shadow-lg shadow-orange-500/20 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
                >
                  <span>Get started free</span>
                  <ArrowRight className="w-5 h-5" aria-hidden="true" />
                </Link>
                <a
                  href="#features"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-base text-slate-200 bg-white/5 hover:bg-white/10 border border-white/15 transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#ff802b]"
                >
                  Explore features
                </a>
              </>
            )}
          </div>

          {/* Micro trust indicators */}
          <div className="mt-12 pt-8 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-300">
            <div className="flex items-center justify-center gap-2">
              <Zap className="w-4 h-4 text-[#ff802b]" aria-hidden="true" />
              <span>Sub-minute health probing</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              <span>HMAC-SHA256 signed webhooks</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              <span>30-day rolling SLO error budgets</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

