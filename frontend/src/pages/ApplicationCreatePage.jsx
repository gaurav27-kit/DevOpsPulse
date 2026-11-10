import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Server } from 'lucide-react';
import { useCreateApplication } from '../hooks/useApplications.js';
import { ApplicationForm } from '../components/ApplicationForm.jsx';

/**
 * View to configure and register a new monitored application.
 * Styled with DevOpsPulse design tokens.
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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb / Back button */}
      <div className="flex items-center justify-between">
        <Link
          to="/applications"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5a4136] hover:text-[#131b2e] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Applications</span>
        </Link>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#f2f3ff] text-[#59605f] border border-[#dae2fd] text-2xs font-semibold font-mono uppercase">
          New Service
        </span>
      </div>

      {/* Header Banner */}
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-[#070d0d] text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
          <Server className="w-5 h-5 text-[#ff6700]" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#131b2e]">Add New Application</h1>
          <p className="text-sm text-[#5a4136] mt-0.5">
            Configure health check probing, timeouts, and notification thresholds for a new service.
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
  );
}
