import React from 'react';
import { ShieldCheck, Lock, Network, KeyRound, UserCheck } from 'lucide-react';
import { useScrollReveal } from '../../hooks/useScrollReveal.js';

export function LandingSecurity() {
  const [sectionRef, isVisible] = useScrollReveal();

  const securityPoints = [
    {
      icon: Lock,
      title: 'httpOnly Secure Cookies',
      description:
        'Authentication tokens are transmitted strictly via SameSite, httpOnly secure cookies, ensuring zero exposure to client-side script execution or XSS attacks.'
    },
    {
      icon: Network,
      title: 'SSRF Protection Engine',
      description:
        'Outbound HTTP health checks and webhook dispatches validate targets against private IP filters, blocking access to loopback, link-local, RFC 1918 subnets, and cloud metadata.'
    },
    {
      icon: KeyRound,
      title: 'AES-256-GCM Encryption',
      description:
        'Sensitive channel secrets and authentication credentials are encrypted at rest using industry-standard AES-256-GCM with authenticated tags and unique initialization vectors.'
    },
    {
      icon: ShieldCheck,
      title: 'HMAC-SHA256 Payload Signing',
      description:
        'Every outbound webhook delivery includes a cryptographically signed header generated using your secret key, allowing endpoints to verify authenticity before processing.'
    },
    {
      icon: UserCheck,
      title: 'Multi-Tenant Data Isolation',
      description:
        'Strict database query scoping and tenant boundary enforcement ensure that applications, metrics, incidents, and alert history remain completely isolated.'
    }
  ];

  return (
    <section
      id="security"
      ref={sectionRef}
      className="py-20 md:py-28 bg-[#091114] text-white border-t border-white/10 relative scroll-mt-20"
      aria-labelledby="security-heading"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#ff802b] mb-3">
            Security & Defense in Depth
          </p>
          <h2
            id="security-heading"
            className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight"
          >
            Built With Zero Compromises on Security
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            Real architectural safeguards protecting your monitoring infrastructure, secrets, and outbound network traffic.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {securityPoints.map((point, idx) => {
            const Icon = point.icon;
            return (
              <div
                key={point.title}
                className={`bg-[#0e171e] rounded-2xl p-6 sm:p-7 border border-white/10 hover:border-white/20 transition-all duration-300 ${
                  isVisible
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-6'
                }`}
                style={{
                  transitionDelay: `${idx * 80}ms`
                }}
              >
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-5">
                  <Icon className="w-6 h-6 text-emerald-400" aria-hidden="true" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-white mb-2.5">
                  {point.title}
                </h3>
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                  {point.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

