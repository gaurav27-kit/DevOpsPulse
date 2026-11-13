import React from 'react';
import { PlusCircle, Cpu, BellRing } from 'lucide-react';
import { useScrollReveal } from '../../hooks/useScrollReveal.js';

export function LandingHowItWorks() {
  const [sectionRef, isVisible] = useScrollReveal();

  const steps = [
    {
      step: '01',
      icon: PlusCircle,
      title: 'Register Target Endpoints',
      description:
        'Input your service URLs, customize health-check intervals from 10s to 5m, set timeout thresholds, and configure expected HTTP status criteria.',
      badgeColor: 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
    },
    {
      step: '02',
      icon: Cpu,
      title: 'Autonomous Probing & Analytics',
      description:
        'DevOpsPulse executes scheduled probes, aggregates p95 response times, evaluates rolling SLO error budgets, and flags multi-window burn rate anomalies.',
      badgeColor: 'border-orange-500/30 text-orange-300 bg-orange-500/10'
    },
    {
      step: '03',
      icon: BellRing,
      title: 'Signed Alerts & Rapid Triage',
      description:
        'When failure thresholds breach, automated incidents trigger with immediate notification dispatch via authenticated webhooks and email notifications.',
      badgeColor: 'border-cyan-500/30 text-cyan-300 bg-cyan-500/10'
    }
  ];

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="py-20 md:py-28 bg-[#070d0d] text-white border-t border-white/10 relative scroll-mt-20"
      aria-labelledby="how-it-works-heading"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
          <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#ff802b] mb-3">
            Simple 3-Step Setup
          </p>
          <h2
            id="how-it-works-heading"
            className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight"
          >
            From Setup to Production Visibility in Minutes
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            No heavyweight agent binaries to install on your hosts. Point DevOpsPulse at your endpoints and begin monitoring immediately.
          </p>
        </div>

        <div className="relative">
          {/* Connecting line on desktop */}
          <div
            className="hidden lg:block absolute top-1/2 left-[12%] right-[12%] h-0.5 bg-gradient-to-r from-emerald-500/40 via-orange-500/40 to-cyan-500/40 -translate-y-1/2 -z-0 pointer-events-none"
            aria-hidden="true"
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 sm:gap-10 relative z-10">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.step}
                  className={`bg-[#0e171e] rounded-2xl p-7 border border-white/10 hover:border-white/20 transition-all duration-300 flex flex-col justify-between ${
                    isVisible
                      ? 'opacity-100 translate-y-0'
                      : 'opacity-0 translate-y-6'
                  }`}
                  style={{
                    transitionDelay: `${idx * 120}ms`
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <span className="font-mono text-3xl font-extrabold text-[#ff802b]">
                        {step.step}
                      </span>
                      <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <Icon className="w-6 h-6 text-slate-200" aria-hidden="true" />
                      </div>
                    </div>

                    <h3 className="text-xl font-bold text-white mb-3">
                      {step.title}
                    </h3>

                    <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

