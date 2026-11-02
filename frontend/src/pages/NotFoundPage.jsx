import React from 'react';
import { Link } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import { Button } from '../components/Button.jsx';

/**
 * 404 Not Found view for unmatched routes.
 */
export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xs">
        <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <FileQuestion className="w-7 h-7" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">404</h1>
        <p className="text-base font-semibold text-slate-800 mt-2">Page not found</p>
        <p className="text-sm text-slate-500 mt-1">
          Sorry, we could not find the page you are looking for.
        </p>

        <div className="mt-6">
          <Link to="/dashboard">
            <Button variant="primary" className="w-full inline-flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

