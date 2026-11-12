import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Plus,
  Mail,
  Webhook,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  Key,
  Copy,
  Check,
  RefreshCw,
  Clock
} from 'lucide-react';
import { notificationsApi } from '../api/notificationsApi.js';
import { Button } from '../components/Button.jsx';
import { Input } from '../components/Input.jsx';
import { AlertBanner } from '../components/AlertBanner.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { Skeleton } from '../components/Skeleton.jsx';

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState({ message: '', variant: 'success' });
  const [modalError, setModalError] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState(null);
  const [deleteChannelConfirm, setDeleteChannelConfirm] = useState(null);
  const [createdSecretDialog, setCreatedSecretDialog] = useState(null); // { secret, channelName }
  const [hasCopiedSecret, setHasCopiedSecret] = useState(false);
  const [secretConfirmed, setSecretConfirmed] = useState(false);
  const [testResult, setTestResult] = useState({}); // { [channelId]: { status, message } }

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    type: 'webhook',
    url: '',
    format: 'generic',
    events: ['incident_opened', 'incident_resolved'],
    minSeverity: 'low',
    enabled: true
  });
  const [formErrors, setFormErrors] = useState({});

  // Focus trap / restore ref
  const createButtonRef = useRef(null);
  const modalRef = useRef(null);
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (isCreateOpen || editingChannel) {
      nameInputRef.current?.focus();
    }
  }, [isCreateOpen, editingChannel]);

  // Queries
  const { data: channelsData, isLoading: channelsLoading, isError: channelsError } = useQuery({
    queryKey: ['notifications', 'channels'],
    queryFn: () => notificationsApi.getChannels()
  });

  const { data: deliveriesData, isLoading: deliveriesLoading } = useQuery({
    queryKey: ['notifications', 'deliveries'],
    queryFn: () => notificationsApi.getDeliveries({ limit: 10 }),
    refetchInterval: 5000
  });

  const channels = channelsData?.data?.channels || [];
  const deliveries = deliveriesData?.data?.deliveries || [];

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      type: 'webhook',
      url: '',
      format: 'generic',
      events: ['incident_opened', 'incident_resolved'],
      minSeverity: 'low',
      enabled: true
    });
    setFormErrors({});
    setModalError('');
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const handleCloseCreate = () => {
    setIsCreateOpen(false);
    resetForm();
    setTimeout(() => {
      createButtonRef.current?.focus();
    }, 50);
  };

  // Keyboard accessibility: Escape closes modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isCreateOpen) handleCloseCreate();
        if (editingChannel) setEditingChannel(null);
        if (deleteChannelConfirm) setDeleteChannelConfirm(null);
        // Do not close secret dialog on Escape if not confirmed
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreateOpen, editingChannel, deleteChannelConfirm]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data) => notificationsApi.createChannel(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'channels'] });
      setIsCreateOpen(false);
      resetForm();
      const returnedSecret = res?.data?.signingSecret;
      if (returnedSecret) {
        setCreatedSecretDialog({
          secret: returnedSecret,
          channelName: res?.data?.channel?.name || 'Webhook Channel'
        });
        setHasCopiedSecret(false);
        setSecretConfirmed(false);
      } else {
        setFeedback({ message: 'Notification channel created successfully.', variant: 'success' });
      }
    },
    onError: (err) => {
      const isUrlError = /url|destination|private|forbidden|protocol|hostname/i.test(err.message || '');
      const hasFieldErrors = err.fieldErrors && Object.keys(err.fieldErrors).length > 0;

      if (hasFieldErrors) {
        setFormErrors(err.fieldErrors);
      } else if (isUrlError) {
        setFormErrors((prev) => ({ ...prev, url: err.message }));
      }

      if (!hasFieldErrors && !isUrlError) {
        setModalError(err.message || 'Failed to create channel.');
      } else {
        setModalError('');
      }
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => notificationsApi.updateChannel(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'channels'] });
      setEditingChannel(null);
      setFeedback({ message: 'Channel updated successfully.', variant: 'success' });
    },
    onError: (err) => {
      const isUrlError = /url|destination|private|forbidden|protocol|hostname/i.test(err.message || '');
      const hasFieldErrors = err.fieldErrors && Object.keys(err.fieldErrors).length > 0;

      if (hasFieldErrors) {
        setFormErrors(err.fieldErrors);
      } else if (isUrlError) {
        setFormErrors((prev) => ({ ...prev, url: err.message }));
      }

      if (!hasFieldErrors && !isUrlError) {
        setModalError(err.message || 'Failed to update channel.');
      } else {
        setModalError('');
      }
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => notificationsApi.deleteChannel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'channels'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'deliveries'] });
      setDeleteChannelConfirm(null);
      setFeedback({ message: 'Channel deleted successfully.', variant: 'success' });
    },
    onError: (err) => {
      setFeedback({ message: err.message || 'Failed to delete channel.', variant: 'error' });
    }
  });

  const testMutation = useMutation({
    mutationFn: (id) => notificationsApi.testChannel(id),
    onSuccess: (res, channelId) => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'deliveries'] });
      setTestResult((prev) => ({
        ...prev,
        [channelId]: { status: 'success', message: `Test sent (${res?.data?.status || 'ok'})` }
      }));
    },
    onError: (err, channelId) => {
      setTestResult((prev) => ({
        ...prev,
        [channelId]: { status: 'error', message: err.message || 'Test failed' }
      }));
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormErrors({});
    setModalError('');

    const payload = {
      name: formData.name.trim(),
      events: formData.events,
      minSeverity: formData.minSeverity,
      enabled: formData.enabled
    };

    if (!editingChannel) {
      payload.type = formData.type;
    }

    if (formData.type === 'webhook') {
      if (!editingChannel) {
        payload.url = formData.url.trim();
      } else if (formData.url && !formData.url.includes('***') && formData.url.trim() !== '') {
        payload.url = formData.url.trim();
      }
      payload.format = formData.format;
    }

    if (editingChannel) {
      updateMutation.mutate({ id: editingChannel._id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleToggleEvent = (ev) => {
    setFormData((prev) => {
      const exists = prev.events.includes(ev);
      const next = exists ? prev.events.filter((item) => item !== ev) : [...prev.events, ev];
      return { ...prev, events: next.length > 0 ? next : prev.events };
    });
  };

  const copySecret = () => {
    if (createdSecretDialog?.secret) {
      navigator.clipboard.writeText(createdSecretDialog.secret);
      setHasCopiedSecret(true);
    }
  };

  const closeSecretDialog = () => {
    if (!secretConfirmed) return;
    setCreatedSecretDialog(null);
    setHasCopiedSecret(false);
    setSecretConfirmed(false);
    setFeedback({ message: 'Webhook channel activated with signing secret.', variant: 'success' });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#131b2e] tracking-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-[#2563eb]" />
            Notification Channels
          </h1>
          <p className="text-sm text-[#414755] mt-1">
            Configure automated outbound email alerts and webhook notifications when incidents open or resolve.
          </p>
        </div>
        <Button
          ref={createButtonRef}
          onClick={handleOpenCreate}
          variant="primary"
          className="flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Channel
        </Button>
      </div>

      {feedback.message && (
        <AlertBanner
          message={feedback.message}
          variant={feedback.variant}
          onDismiss={() => setFeedback({ message: '', variant: 'success' })}
        />
      )}

      {/* Channel List Card */}
      <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#e2e8f0] flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#131b2e]">Configured Channels ({channels.length}/5)</h2>
        </div>

        {channelsLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : channelsError ? (
          <div className="p-6 text-center text-[#ba1a1a]">Failed to load notification channels.</div>
        ) : channels.length === 0 ? (
          <div className="p-8 text-center">
            <Bell className="w-10 h-10 text-[#717786] mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium text-[#131b2e]">No notification channels configured</p>
            <p className="text-xs text-[#717786] mt-1">Add an email or webhook channel to receive real-time alerts.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#e2e8f0]">
            {channels.map((chan) => (
              <div
                key={chan._id}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#faf8ff] transition-colors"
                data-testid={`channel-row-${chan._id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-[#eaedff] text-[#2563eb] mt-0.5">
                    {chan.type === 'email' ? <Mail className="w-5 h-5" /> : <Webhook className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[#131b2e]">{chan.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#f1f5f9] text-[#475569] font-medium capitalize">
                        {chan.type} {chan.format === 'slack' ? '(Slack)' : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateMutation.mutate({ id: chan._id, data: { enabled: !chan.enabled } })}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                          chan.enabled ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#f1f5f9] text-[#64748b]'
                        }`}
                        aria-label={`Toggle enabled for ${chan.name}`}
                      >
                        {chan.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>

                    <div className="text-xs text-[#717786] mt-1 space-x-3">
                      <span>Min: <strong className="text-[#414755] capitalize">{chan.minSeverity}</strong></span>
                      <span>Events: <strong className="text-[#414755]">{chan.events?.join(', ')}</strong></span>
                      {chan.url && (
                        <span>Endpoint: <code className="bg-[#f1f5f9] px-1 py-0.5 rounded">{chan.url}</code></span>
                      )}
                    </div>

                    {testResult[chan._id] && (
                      <div
                        className={`text-xs mt-2 font-medium flex items-center gap-1 ${
                          testResult[chan._id].status === 'success' ? 'text-[#166534]' : 'text-[#ba1a1a]'
                        }`}
                        data-testid={`test-result-${chan._id}`}
                      >
                        {testResult[chan._id].status === 'success' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        <span>{testResult[chan._id].message}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testMutation.mutate(chan._id)}
                    disabled={testMutation.isPending}
                    className="flex items-center gap-1 text-xs"
                    aria-label={`Send test notification to ${chan.name}`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    Test
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingChannel(chan);
                      setModalError('');
                      setFormErrors({});
                      setFormData({
                        name: chan.name,
                        type: chan.type,
                        url: chan.url || '',
                        format: chan.format || 'generic',
                        events: chan.events || ['incident_opened'],
                        minSeverity: chan.minSeverity || 'low',
                        enabled: chan.enabled
                      });
                    }}
                    className="flex items-center gap-1 text-xs"
                    aria-label={`Edit ${chan.name}`}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setDeleteChannelConfirm(chan)}
                    className="flex items-center gap-1 text-xs"
                    aria-label={`Delete ${chan.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delivery Logs Audit Card */}
      <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#e2e8f0]">
          <h2 className="text-base font-semibold text-[#131b2e] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#717786]" />
            Recent Delivery History
          </h2>
        </div>

        {deliveriesLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : deliveries.length === 0 ? (
          <div className="p-6 text-center text-sm text-[#717786]">No recent alert deliveries recorded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#414755]">
              <thead className="bg-[#f8fafc] text-[#717786] border-b border-[#e2e8f0]">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Event</th>
                  <th className="py-2.5 px-4 font-semibold">Channel</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold">Reason / Error</th>
                  <th className="py-2.5 px-4 font-semibold">Attempts</th>
                  <th className="py-2.5 px-4 font-semibold">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {deliveries.map((deliv) => (
                  <tr key={deliv._id} className="hover:bg-[#faf8ff] transition-colors" data-testid="delivery-row">
                    <td className="py-2.5 px-4 font-mono font-medium text-[#131b2e]">{deliv.event}</td>
                    <td className="py-2.5 px-4">{deliv.channelId?.name || 'Channel'}</td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                          deliv.status === 'sent'
                            ? 'bg-[#dcfce7] text-[#166534]'
                            : deliv.status === 'skipped'
                            ? 'bg-[#fef9c3] text-[#854d0e]'
                            : 'bg-[#fee2e2] text-[#991b1b]'
                        }`}
                      >
                        {deliv.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      {deliv.skipReason ? (
                        <span className="font-mono text-[#854d0e]">skip: {deliv.skipReason}</span>
                      ) : deliv.errorType ? (
                        <span className="font-mono text-[#991b1b]">{deliv.errorType}</span>
                      ) : (
                        <span className="text-[#94a3b8]">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono">{deliv.attempts}</td>
                    <td className="py-2.5 px-4 text-[#717786]">
                      {new Date(deliv.createdAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create or Edit Channel */}
      {(isCreateOpen || editingChannel) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
        >
          <div
            ref={modalRef}
            className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-[#e2e8f0] space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-3">
              <h2 id="modal-title" className="text-lg font-bold text-[#131b2e]">
                {editingChannel ? 'Edit Channel' : 'Create Notification Channel'}
              </h2>
              <button
                type="button"
                onClick={editingChannel ? () => setEditingChannel(null) : handleCloseCreate}
                className="text-[#717786] hover:text-[#131b2e] p-1 rounded-md"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div
                role="alert"
                className="p-3 bg-[#fdf2f2] border border-[#f87171] rounded-lg text-xs text-[#ba1a1a] flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 text-[#ba1a1a] mt-0.5" />
                <span className="font-medium">{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="channel-name" className="block text-xs font-semibold text-[#131b2e] mb-1">
                  Channel Name
                </label>
                <Input
                  ref={nameInputRef}
                  id="channel-name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. SRE Slack Alerts"
                />
                {formErrors.name && <p className="text-xs text-[#ba1a1a] mt-1">{formErrors.name}</p>}
              </div>

              {!editingChannel && (
                <div>
                  <label className="block text-xs font-semibold text-[#131b2e] mb-1">Channel Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'webhook' })}
                      className={`p-3 rounded-lg border text-left flex items-center gap-2 transition-colors ${
                        formData.type === 'webhook'
                          ? 'border-[#2563eb] bg-[#eff6ff] text-[#2563eb]'
                          : 'border-[#e2e8f0] hover:bg-[#f8fafc]'
                      }`}
                    >
                      <Webhook className="w-4 h-4" />
                      <span className="text-sm font-semibold">Webhook</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'email' })}
                      className={`p-3 rounded-lg border text-left flex items-center gap-2 transition-colors ${
                        formData.type === 'email'
                          ? 'border-[#2563eb] bg-[#eff6ff] text-[#2563eb]'
                          : 'border-[#e2e8f0] hover:bg-[#f8fafc]'
                      }`}
                    >
                      <Mail className="w-4 h-4" />
                      <span className="text-sm font-semibold">Email</span>
                    </button>
                  </div>
                </div>
              )}

              {formData.type === 'webhook' && (
                <>
                  <div>
                    <label htmlFor="channel-url" className="block text-xs font-semibold text-[#131b2e] mb-1">
                      Webhook URL
                    </label>
                    <Input
                      id="channel-url"
                      type={editingChannel ? 'text' : 'url'}
                      required={!editingChannel}
                      value={formData.url}
                      onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                      placeholder={editingChannel ? 'Leave masked to keep current URL' : 'https://webhook.example.com/services/...'}
                    />
                    {formErrors.url && (
                      <p id="channel-url-error" className="text-xs text-[#ba1a1a] mt-1 font-medium">
                        {formErrors.url}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="channel-format" className="block text-xs font-semibold text-[#131b2e] mb-1">
                      Payload Format
                    </label>
                    <select
                      id="channel-format"
                      value={formData.format}
                      onChange={(e) => setFormData({ ...formData, format: e.target.value })}
                      className="w-full text-sm border border-[#e2e8f0] rounded-lg p-2.5 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#2563eb]"
                    >
                      <option value="generic">Generic JSON (DevOpsPulse Schema)</option>
                      <option value="slack">Slack Incoming Webhook compatible</option>
                    </select>
                  </div>
                </>
              )}

              {formData.type === 'email' && (
                <div className="space-y-2">
                  <div className="p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-xs text-[#475569]">
                    Alerts are strictly delivered to your verified account email address to prevent open relay spam abuse.
                  </div>
                  {channelsData?.data?.isSmtpConfigured === false && (
                    <div className="p-3 bg-[#fffbeb] border border-[#fef3c7] rounded-lg text-xs text-[#b45309] flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-[#f59e0b] mt-0.5" />
                      <div>
                        <span className="font-semibold block text-[#92400e]">Email alerts not configured on server</span>
                        SMTP credentials are not configured in <code className="bg-amber-100/60 px-1 py-0.5 rounded font-mono">backend/.env</code>. Set <code className="bg-amber-100/60 px-1 py-0.5 rounded font-mono">SMTP_HOST</code> to enable email delivery, or choose <strong>Webhook</strong> instead.
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#131b2e] mb-1">Trigger Events</label>
                <div className="space-y-3">
                  <div>
                    <span className="text-xs font-semibold text-[#475569] block mb-1.5 uppercase tracking-wider">Incident Alerts</span>
                    <div className="space-y-1.5 pl-1">
                      <label className="flex items-center gap-2 text-sm text-[#414755] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.events.includes('incident_opened')}
                          onChange={() => handleToggleEvent('incident_opened')}
                          className="rounded border-[#e2e8f0] text-[#2563eb] focus:ring-[#2563eb]"
                        />
                        <span>Incident Opened (outage detected)</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[#414755] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.events.includes('incident_resolved')}
                          onChange={() => handleToggleEvent('incident_resolved')}
                          className="rounded border-[#e2e8f0] text-[#2563eb] focus:ring-[#2563eb]"
                        />
                        <span>Incident Resolved (recovery confirmed)</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-[#475569] block mb-1.5 uppercase tracking-wider">SLO Alerts</span>
                    <div className="space-y-1.5 pl-1">
                      <label className="flex items-center gap-2 text-sm text-[#414755] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.events.includes('slo_at_risk')}
                          onChange={() => handleToggleEvent('slo_at_risk')}
                          className="rounded border-[#e2e8f0] text-[#2563eb] focus:ring-[#2563eb]"
                        />
                        <span>SLO at Risk (error budget &gt; 50% consumed)</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[#414755] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.events.includes('slo_breached')}
                          onChange={() => handleToggleEvent('slo_breached')}
                          className="rounded border-[#e2e8f0] text-[#2563eb] focus:ring-[#2563eb]"
                        />
                        <span>SLO Breached (error budget exhausted)</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[#414755] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.events.includes('slo_high_burn_rate')}
                          onChange={() => handleToggleEvent('slo_high_burn_rate')}
                          className="rounded border-[#e2e8f0] text-[#2563eb] focus:ring-[#2563eb]"
                        />
                        <span>High Burn Rate (accelerated budget burn)</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[#414755] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.events.includes('slo_recovered')}
                          onChange={() => handleToggleEvent('slo_recovered')}
                          className="rounded border-[#e2e8f0] text-[#2563eb] focus:ring-[#2563eb]"
                        />
                        <span>SLO Recovered (back to healthy or at-risk after breach)</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[#414755] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.events.includes('slo_budget_replenished')}
                          onChange={() => handleToggleEvent('slo_budget_replenished')}
                          className="rounded border-[#e2e8f0] text-[#2563eb] focus:ring-[#2563eb]"
                        />
                        <span>Budget Replenished (returned to 100% healthy)</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[#414755] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.events.includes('slo_insufficient_data')}
                          onChange={() => handleToggleEvent('slo_insufficient_data')}
                          className="rounded border-[#e2e8f0] text-[#2563eb] focus:ring-[#2563eb]"
                        />
                        <span>Insufficient Data (not enough checks in window)</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[#414755] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.events.includes('slo_monitoring_unavailable')}
                          onChange={() => handleToggleEvent('slo_monitoring_unavailable')}
                          className="rounded border-[#e2e8f0] text-[#2563eb] focus:ring-[#2563eb]"
                        />
                        <span>Monitoring Unavailable (health checks missing)</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[#414755] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.events.includes('slo_monitoring_restored')}
                          onChange={() => handleToggleEvent('slo_monitoring_restored')}
                          className="rounded border-[#e2e8f0] text-[#2563eb] focus:ring-[#2563eb]"
                        />
                        <span>Monitoring Restored (health checks resumed)</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="channel-min-severity" className="block text-xs font-semibold text-[#131b2e] mb-1">
                  Minimum Severity Threshold
                </label>
                <select
                  id="channel-min-severity"
                  value={formData.minSeverity}
                  onChange={(e) => setFormData({ ...formData, minSeverity: e.target.value })}
                  className="w-full text-sm border border-[#e2e8f0] rounded-lg p-2.5 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#2563eb]"
                >
                  <option value="low">Low (all notifications)</option>
                  <option value="medium">Medium and above</option>
                  <option value="high">High and Critical only</option>
                  <option value="critical">Critical only</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#e2e8f0]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={editingChannel ? () => setEditingChannel(null) : handleCloseCreate}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={createMutation.isPending || updateMutation.isPending}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editingChannel ? 'Save Changes' : 'Create Channel'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: One-Time Signing Secret Display */}
      {createdSecretDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="secret-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-[#e2e8f0] space-y-4">
            <div className="flex items-center gap-2 text-[#b45309]">
              <Key className="w-5 h-5" />
              <h2 id="secret-title" className="text-lg font-bold text-[#131b2e]">
                Webhook Signing Secret
              </h2>
            </div>

            <div className="p-3 bg-[#fefce8] border border-[#fef08a] rounded-lg text-xs text-[#854d0e] space-y-1">
              <p className="font-semibold">Save your signing secret now.</p>
              <p>For your security, this secret will <strong>never be shown again</strong>. DevOpsPulse signs every webhook request using this HMAC-SHA256 key.</p>
            </div>

            <div>
              <label htmlFor="signing-secret-input" className="block text-xs font-semibold text-[#131b2e] mb-1">
                HMAC-SHA256 Secret
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="signing-secret-input"
                  type="text"
                  readOnly
                  value={createdSecretDialog.secret}
                  className="font-mono text-xs w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-2.5 text-[#0f172a] select-all"
                />
                <Button variant="outline" size="sm" onClick={copySecret} aria-label="Copy signing secret">
                  {hasCopiedSecret ? <Check className="w-4 h-4 text-[#166534]" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-start gap-2 text-xs text-[#414755] cursor-pointer">
                <input
                  type="checkbox"
                  id="confirm-secret-saved"
                  checked={secretConfirmed}
                  onChange={(e) => setSecretConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-[#e2e8f0] text-[#2563eb] focus:ring-[#2563eb]"
                />
                <span>I have saved this secret in a secure location and understand it cannot be displayed again.</span>
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                onClick={closeSecretDialog}
                disabled={!secretConfirmed}
                className="w-full text-center justify-center"
              >
                I have saved it
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Channel Dialog */}
      {deleteChannelConfirm && (
        <ConfirmDialog
          isOpen={true}
          title="Delete Notification Channel"
          description={`Are you sure you want to delete "${deleteChannelConfirm.name}"? This action will also delete all delivery logs associated with this channel.`}
          confirmText="Delete channel"
          variant="danger"
          isLoading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteChannelConfirm._id)}
          onClose={() => setDeleteChannelConfirm(null)}
        />
      )}
    </div>
  );
}

