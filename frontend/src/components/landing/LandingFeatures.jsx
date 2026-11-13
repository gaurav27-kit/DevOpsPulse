import React from 'react';
import {
  Activity,
  AlertTriangle,
  PieChart,
  Radio,
  ShieldCheck,
  CalendarClock
} from 'lucide-react';
import { useScrollReveal } from '../../hooks/useScrollReveal.js';

export function LandingFeatures() {
  const [sectionRef, isVisible] = useScrollReveal();

  const features = [
    {
      icon: Activity,
      title: 'Uptime & Endpoint Monitoring',
      description:
        'Continuous automated health checks across your critical HTTP/HTTPS endpoints with configurable intervals, response timeouts, and status code verification.',
      color: 'text-emerald-400',
      bgGlow: 'from-emerald-500/10 to-transparent'
    },
    {
      icon: AlertTriangle,
      title: 'Automated Incident Lifecycle',
      description:
        'Consecutive failure thresholds automatically trigger incidents, transition states, capture error stacks, and auto-resolve upon verified endpoint recovery.',
      color: 'text-amber-400',
      bgGlow: 'from-amber-500/10 to-transparent'
    },
    {
      icon: PieChart,
      title: 'SLOs & Error Budget Analytics',
      description:
        'Define 30-day rolling Service Level Objectives. Track cumulative consumption, 1-hour and 6-hour burn rates, and forecast exhaustion before customer impact.',
      color: 'text-[#ff802b]',
      bgGlow: 'from-orange-500/10 to-transparent'
    },
    {
      icon: Radio,
      title: 'Real-Time WebSocket Streams',
      description:
        'Live bi-directional WebSocket events push health status transitions, latency spikes, and incident updates to connected dashboards without polling.',
      color: 'text-cyan-400',
      bgGlow: 'from-cyan-500/10 to-transparent'
    },
    {
      icon: ShieldCheck,
      title: 'Cryptographically Signed Alerts',
      description:
        'Webhook dispatches are signed with HMAC-SHA256 headers for tamper resistance, backed by private IP SSRF guards and resilient retry backoff.',
      color: 'text-purple-400',
      bgGlow: 'from-purple-500/10 to-transparent'
    },
    {
      icon: CalendarClock,
      title: 'Production Maintenance Mode',
      description:
        'Schedule future maintenance windows or activate manual maintenance. Mute alert noise while continuing background data collection and historical audit logs.',
      color: 'text-blue-400',
      bgGlow: 'from-blue-500/10 to-transparent'
    }
  ];

  return (
    <section
      id="features"
      ref={sectionRef}
      className="py-20 md:py-28 bg-[#091114] text-white border-t border-white/10 relative scroll-mt-20"
      aria-labelledby="features-heading"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#ff802b] mb-3">
            Core Platform Capabilities
          </p>
          <h2
            id="features-heading"
            className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight"
          >
            Engineered for Observability and SRE Rigor
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            Everything your team needs to monitor production availability, enforce reliability budgets, and triage incidents with zero guesswork.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className={`relative group bg-[#0e171e] rounded-2xl p-6 sm:p-7 border border-white/10 hover:border-white/20 transition-all duration-300 flex flex-col justify-between ${
                  isVisible
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-6'
                }`}
                style={{
                  transitionDelay: `${idx * 75}ms`
                }}
              >
                <div
                  className={`absolute inset-0 rounded-2xl bg-radial ${feature.bgGlow} opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`}
                  aria-hidden="true"
                />

                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                    <Icon className={`w-6 h-6 ${feature.color}`} aria-hidden="true" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-100 mb-2.5">
                    {feature.title}
                  </h3>
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

