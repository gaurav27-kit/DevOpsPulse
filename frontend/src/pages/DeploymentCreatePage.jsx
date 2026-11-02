import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Rocket } from 'lucide-react';
import { useCreateDeployment } from '../hooks/useDeployments.js';
import { DeploymentForm } from '../components/DeploymentForm.jsx';

export function DeploymentCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialAppId = searchParams.get('applicationId') || '';

  const createMutation = useCreateDeployment();
  const [serverErrors, setServerErrors] = useState({});
  const [generalError, setGeneralError] = useState('');

  const handleSubmit = async (applicationId, data) => {
    setServerErrors({});
    setGeneralError('');

    try {
      await createMutation.mutateAsync({ applicationId, data });
      navigate('/deployments', {
        state: {
          message: `Deployment '${data.version}' was successfully recorded.`
        }
      });
    } catch (err) {
      if (err.fieldErrors) {
        setServerErrors(err.fieldErrors);
      }
      setGeneralError(err.message || 'Failed to record deployment.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back button */}
      <div>
        <Link
          to="/deployments"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Deployments</span>
        </Link>
      </div>

      {/* Form Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center gap-3 pb-6 border-b border-slate-100">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Rocket className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Record a Deployment
            </h1>
            <p className="text-xs text-slate-500">
              Log release metadata to track system changes and correlate them with telemetry.
            </p>
          </div>
        </div>

        <DeploymentForm
          initialAppId={initialAppId}
          onSubmit={handleSubmit}
          isLoading={createMutation.isPending}
          serverErrors={serverErrors}
          generalError={generalError}
          onCancel={() => navigate(-1)}
        />
      </div>
    </div>
  );
}
