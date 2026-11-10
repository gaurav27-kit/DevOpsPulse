import React from 'react';
import { Link } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import { Button } from '../components/Button.jsx';

/**
 * 404 Not Found view for unmatched routes.
 */
export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#faf8ff] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-[#dae2fd] p-8 text-center shadow-xs">
        <div className="w-14 h-14 bg-[#070d0d] text-[#ff6700] rounded-xl flex items-center justify-center mx-auto mb-5 shadow-xs">
          <FileQuestion className="w-7 h-7" aria-hidden="true" />
        </div>
        <h1 className="font-mono text-3xl font-bold text-[#131b2e] tracking-tight">404</h1>
        <p className="text-base font-semibold text-[#131b2e] mt-2">Page not found</p>
        <p className="text-sm text-[#59605f] mt-1">
          Sorry, we could not find the page you are looking for.
        </p>

        <div className="mt-6">
          <Link to="/dashboard" className="inline-block w-full">
            <Button variant="primary" className="w-full inline-flex items-center justify-center gap-2 min-h-[40px]">
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

