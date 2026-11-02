import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Server } from 'lucide-react';
import { useCreateApplication } from '../hooks/useApplications.js';
import { ApplicationForm } from '../components/ApplicationForm.jsx';

/**
 * View to configure and register a new monitored application.
 */
export function ApplicationCreatePage() {
  const navigate = useNavigate();
  const createMutation = useCreateApplication();

  const [serverErrors, setServerErrors] = useState({});
  const [generalError, setGeneralError] = useState('');

  const handleCreate = async (formData) => {
    setServerErrors({});
    setGeneralError('');

    try {
      const res = await createMutation.mutateAsync(formData);
      const appName = res.data?.application?.name || formData.name;
      navigate('/applications', {
        state: { message: `Application '${appName}' was successfully registered for monitoring.` }
      });
    } catch (err) {
      if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setServerErrors(err.fieldErrors);
      }
      setGeneralError(err.message || 'Failed to register application.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back button link */}
      <div>
        <Link
          to="/applications"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Applications</span>
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <div className="flex items-center gap-3 pb-6 border-b border-slate-100 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
            <Server className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Add New Application</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter the HTTP/HTTPS endpoint and timing parameters to begin monitoring.
            </p>
          </div>
        </div>

        <ApplicationForm
          onSubmit={handleCreate}
          isLoading={createMutation.isPending}
          serverErrors={serverErrors}
          generalError={generalError}
          submitLabel="Register Application"
        />
      </div>
    </div>
  );
}

