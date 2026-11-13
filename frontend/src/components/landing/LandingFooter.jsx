import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, ShieldCheck, Heart } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';

export function LandingFooter() {
  const { user } = useAuth();

  return (
    <footer className="bg-[#05080a] text-slate-300 border-t border-white/10 py-12 md:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="md:col-span-2 space-y-4">
            <a
              href="#"
              className="inline-flex items-center gap-2.5 text-white font-bold text-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#ff802b] rounded-lg p-0.5"
            >
              <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/15 text-[#ff802b] flex items-center justify-center">
                <Activity className="w-4 h-4 text-[#ff802b]" aria-hidden="true" />
              </div>
              <span className="text-white font-semibold tracking-tight">DevOpsPulse</span>
            </a>
            <p className="text-sm text-slate-300 max-w-sm leading-relaxed">
              Production uptime monitoring, automated incident response, and SLO error budget tracking engineered for modern engineering teams.
            </p>
            <div className="inline-flex items-center gap-2 text-xs text-slate-300 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
              <ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              <span>Full-stack automated verification & zero downtime design</span>
            </div>
          </div>

          {/* Navigation Links */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-4">
              Platform
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a
                  href="#features"
                  className="hover:text-white transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#ff802b] rounded-xs"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="#how-it-works"
                  className="hover:text-white transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#ff802b] rounded-xs"
                >
                  How It Works
                </a>
              </li>
              <li>
                <a
                  href="#security"
                  className="hover:text-white transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#ff802b] rounded-xs"
                >
                  Security Architecture
                </a>
              </li>
              <li>
                <a
                  href="#contact"
                  className="hover:text-white transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#ff802b] rounded-xs"
                >
                  Contact Support
                </a>
              </li>
            </ul>
          </div>

          {/* Access Links */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-4">
              Access
            </h3>
            <ul className="space-y-2.5 text-sm">
              {user ? (
                <li>
                  <Link
                    to="/dashboard"
                    className="hover:text-white text-[#ff802b] font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#ff802b] rounded-xs"
                  >
                    Open Dashboard
                  </Link>
                </li>
              ) : (
                <>
                  <li>
                    <Link
                      to="/login"
                      className="hover:text-white transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#ff802b] rounded-xs"
                    >
                      Sign In
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/register"
                      className="hover:text-white transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#ff802b] rounded-xs"
                    >
                      Create Account
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>© {new Date().getFullYear()} DevOpsPulse. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            <span>Built with MERN Stack</span>
            <span>•</span>
            <span>React & Node.js</span>
          </p>
        </div>
      </div>
    </footer>
  );
}

