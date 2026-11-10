import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { useAddIncidentUpdate } from '../hooks/useIncidents.js';
import { Button } from './Button.jsx';
import { Spinner } from './Spinner.jsx';
import { FormError } from './FormError.jsx';

/**
 * Form allowing operators to append investigative notes to an incident's timeline.
 * Features live character counting (max 1000) and handles 409 timeline full error.
 * Styled with DevOpsPulse design tokens.
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
    <form onSubmit={handleSubmit} className="rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <label htmlFor="incident-note-input" className="text-sm font-semibold text-[#131b2e]">
          Add an investigative note
        </label>
        <span
          className={`text-xs font-mono ${
            isOverLimit ? 'text-[#ba1a1a] font-bold' : remaining < 100 ? 'text-[#d97706]' : 'text-[#5a4136]'
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
          className="w-full rounded-lg border border-[#dae2fd] p-3 text-sm text-[#131b2e] placeholder:text-[#59605f] focus:border-[#ff6700] focus:outline-hidden focus:ring-2 focus:ring-[#ff6700]/25 disabled:bg-[#f2f3ff] transition-colors"
        />
        {errorText && <FormError message={errorText} />}
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          disabled={!message.trim() || isOverLimit || addMutation.isPending}
          className="text-xs py-2 px-4 flex items-center gap-1.5 min-h-[38px] font-semibold"
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
