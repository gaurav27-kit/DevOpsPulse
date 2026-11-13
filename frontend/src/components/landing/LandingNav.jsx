import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Menu, X, ArrowRight, LayoutDashboard, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';

export function LandingNav() {
  const { user } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle ESC key to close mobile menu
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const navLinks = [
    { name: 'Features', href: '#features' },
    { name: 'How It Works', href: '#how-it-works' },
    { name: 'Security', href: '#security' },
    { name: 'Contact', href: '#contact' }
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-colors duration-200 ${
        isScrolled
          ? 'bg-[#070d0d]/90 backdrop-blur-md border-b border-white/10 shadow-sm'
          : 'bg-transparent border-b border-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <a
            href="#"
            className="flex items-center gap-2.5 text-white font-bold text-lg sm:text-xl tracking-tight focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#ff6700] rounded-lg p-1"
          >
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 text-[#ff802b] flex items-center justify-center shadow-xs">
              <Activity className="w-5 h-5 text-[#ff802b]" />
            </div>
            <span className="text-white font-semibold tracking-tight">DevOpsPulse</span>
          </a>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-8" aria-label="Main Navigation">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="text-sm font-medium text-slate-300 hover:text-white transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#ff6700] rounded-md px-1 py-0.5"
              >
                {link.name}
              </a>
            ))}
          </nav>

          {/* Desktop Auth CTAs */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#c2410c] hover:bg-[#9a3412] text-white font-medium text-sm transition-colors duration-150 shadow-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#ff6700]"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Open dashboard</span>
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-3.5 py-2 rounded-xl text-slate-200 hover:text-white text-sm font-medium transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#ff6700]"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#c2410c] hover:bg-[#9a3412] text-white font-medium text-sm transition-colors duration-150 shadow-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#ff6700]"
                >
                  <span>Get started free</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#ff6700]"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-dialog"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Accessible Dialog */}
      {mobileMenuOpen && (
        <div
          id="mobile-nav-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
          className="md:hidden bg-[#070d0d]/95 backdrop-blur-xl border-b border-white/10 px-4 pt-3 pb-6 animate-fadeIn"
        >
          <div className="space-y-1">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-base font-medium text-slate-200 hover:text-white hover:bg-white/5 transition-colors"
              >
                {link.name}
              </a>
            ))}
          </div>

          <div className="mt-5 pt-5 border-t border-white/10 space-y-2.5">
            {user ? (
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-[#c2410c] text-white font-medium text-sm transition-colors"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Open dashboard</span>
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border border-white/20 text-white font-medium text-sm hover:bg-white/5 transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign in</span>
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-[#c2410c] text-white font-medium text-sm transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Get started free</span>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

