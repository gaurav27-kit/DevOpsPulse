import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { useAddIncidentUpdate } from '../hooks/useIncidents.js';
import { Button } from './Button.jsx';
import { Spinner } from './Spinner.jsx';
import { FormError } from './FormError.jsx';

/**
 * Form allowing operators to append investigative notes to an incident's timeline.
 * Features live character counting (max 1000) and handles 409 timeline full error.
 */
export function AddNoteForm({ incidentId }) {
  const [message, setMessage] = useState('');
  const [errorText, setErrorText] = useState(null);

  const addMutation = useAddIncidentUpdate(incidentId);

  const remaining = 1000 - message.length;
  const isOverLimit = remaining < 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorText(null);

    const trimmed = message.trim();
    if (!trimmed) return;

    if (trimmed.length > 1000) {
      setErrorText('Note cannot exceed 1000 characters.');
      return;
    }

    try {
      await addMutation.mutateAsync({ message: trimmed });
      setMessage('');
    } catch (err) {
      if (err.statusCode === 409) {
        setErrorText('Timeline is full (200 updates). No more updates can be added.');
      } else {
        setErrorText(err.message || 'Failed to post note. Please try again.');
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <label htmlFor="incident-note-input" className="text-sm font-semibold text-slate-800">
          Add an investigative note
        </label>
        <span
          className={`text-xs font-mono ${
            isOverLimit ? 'text-rose-600 font-bold' : remaining < 100 ? 'text-amber-600' : 'text-slate-400'
          }`}
          aria-live="polite"
        >
          {remaining} characters left
        </span>
      </div>

      <div>
        <textarea
          id="incident-note-input"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (errorText) setErrorText(null);
          }}
          disabled={addMutation.isPending}
          placeholder="Document investigation steps, hypotheses, or external status updates..."
          rows={3}
          maxLength={1100}
          className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 transition-colors"
        />
        {errorText && <FormError message={errorText} />}
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          disabled={!message.trim() || isOverLimit || addMutation.isPending}
          className="text-xs py-2 px-4 flex items-center gap-1.5"
        >
          {addMutation.isPending ? (
            <>
              <Spinner size="sm" className="text-white" />
              <span>Posting...</span>
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              <span>Post note</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
