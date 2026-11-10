import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Rocket, Info } from 'lucide-react';
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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back button */}
      <div className="flex items-center justify-between">
        <Link
          to="/deployments"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5a4136] hover:text-[#131b2e] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Deployments</span>
        </Link>
        <span className="font-mono text-2xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-[#f2f3ff] text-[#59605f] border border-[#dae2fd]">
          Audit Event Log
        </span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-[#070d0d] text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
          <Rocket className="w-5 h-5 text-[#ff6700]" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#131b2e]">
            Record a Deployment
          </h1>
          <p className="text-sm text-[#5a4136] mt-0.5">
            Manually log release metadata to track system changes and correlate them with telemetry.
          </p>
        </div>
      </div>

      {/* Notice Banner */}
      <div className="rounded-xl bg-[#f2f3ff] border border-[#dae2fd] p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-[#0061a2] shrink-0 mt-0.5" />
        <div className="text-xs text-[#5a4136] leading-relaxed">
          <strong className="text-[#131b2e] font-semibold block mb-0.5">Audit trail enforcement active</strong>
          Manual deployments are tagged with a <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-white text-[#131b2e] border border-[#dae2fd] font-mono font-medium mx-1">Manual entry</span> badge to distinguish them from automated CI/CD pipeline webhooks.
        </div>
      </div>

      {/* Form Card */}
      <div className="rounded-xl border border-[#e2e8f0] bg-white p-6 sm:p-8 shadow-sm">
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
