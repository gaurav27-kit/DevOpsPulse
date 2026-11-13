import React from 'react';
import { LandingNav } from '../components/landing/LandingNav.jsx';
import { LandingHero } from '../components/landing/LandingHero.jsx';
import { LandingFeatures } from '../components/landing/LandingFeatures.jsx';
import { LandingHowItWorks } from '../components/landing/LandingHowItWorks.jsx';
import { LandingSecurity } from '../components/landing/LandingSecurity.jsx';
import { LandingContact } from '../components/landing/LandingContact.jsx';
import { LandingFooter } from '../components/landing/LandingFooter.jsx';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#070d0d] text-white selection:bg-[#ff802b] selection:text-[#070d0d] overflow-x-hidden">
      {/* Accessible skip link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#ff802b] focus:text-[#070d0d] focus:font-bold focus:rounded-lg focus:shadow-lg focus:outline-hidden"
      >
        Skip to main content
      </a>

      {/* Sticky Navigation */}
      <LandingNav />

      {/* Main Content */}
      <main id="main-content" tabIndex={-1} className="focus:outline-hidden">
        <LandingHero />
        <LandingFeatures />
        <LandingHowItWorks />
        <LandingSecurity />
        <LandingContact />
      </main>

      {/* Footer */}
      <LandingFooter />
    </div>
  );
}

