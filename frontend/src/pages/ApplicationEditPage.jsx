import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Edit3 } from 'lucide-react';
import { useApplication, useUpdateApplication } from '../hooks/useApplications.js';
import { ApplicationForm } from '../components/ApplicationForm.jsx';
import { Spinner } from '../components/Spinner.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { Button } from '../components/Button.jsx';

/**
 * View to edit configuration parameters of an existing monitored application.
 * Styled with DevOpsPulse design tokens.
 */
export function ApplicationEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: application, isLoading, isError, error, refetch } = useApplication(id);
  const updateMutation = useUpdateApplication(id);

  const [serverErrors, setServerErrors] = useState({});
  const [generalError, setGeneralError] = useState('');

  const handleUpdate = async (formData) => {
    setServerErrors({});
    setGeneralError('');

    try {
      await updateMutation.mutateAsync(formData);
      navigate('/applications', {
        state: { message: `Application '${formData.name}' was successfully updated.` }
      });
    } catch (err) {
      if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setServerErrors(err.fieldErrors);
      }
      setGeneralError(err.message || 'Failed to update application.');
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-12 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !application) {
    return (
      <div className="max-w-md mx-auto py-12">
        <ErrorState
          title="Application not found"
          message={error?.message || 'The requested application could not be located or belongs to another account.'}
          action={
            <Link to="/applications">
              <Button variant="primary" className="text-xs py-2 px-4">
                Back to Applications
              </Button>
            </Link>
          }
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to={`/applications/${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5a4136] hover:text-[#131b2e] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Application Details</span>
        </Link>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#f2f3ff] text-[#59605f] border border-[#dae2fd] text-2xs font-semibold font-mono uppercase">
          Editing Service
        </span>
      </div>

      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-[#070d0d] text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
          <Edit3 className="w-5 h-5 text-[#ff6700]" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#131b2e]">Edit Application</h1>
          <p className="text-sm text-[#5a4136] mt-0.5">
            Updating endpoint URL will reset health status to Unknown until the next automated probe.
          </p>
        </div>
      </div>

      <ApplicationForm
        initialValues={{
          name: application.name,
          url: application.url,
          environment: application.environment,
          checkIntervalSeconds: application.checkIntervalSeconds,
          timeoutMs: application.timeoutMs
        }}
        onSubmit={handleUpdate}
        isLoading={updateMutation.isPending}
        serverErrors={serverErrors}
        generalError={generalError}
        submitLabel="Save Changes"
      />
    </div>
  );
}
