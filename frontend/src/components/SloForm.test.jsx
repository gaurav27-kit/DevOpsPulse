import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SloForm, computeAllowedDowntime } from './SloForm.jsx';

describe('computeAllowedDowntime', () => {
  it('calculates allowed downtime string correctly for 99.9% over 30 days', () => {
    // 30 days * 24h = 720h. 0.1% of 720h = 0.72h = 43m 12s
    const text = computeAllowedDowntime(99.9, 30);
    expect(text).toBe('43m 12s');
  });

  it('calculates allowed downtime string correctly for 99.0% over 7 days', () => {
    // 7 days * 24h = 168h. 1% of 168h = 1.68h = 1h 40m 48s
    const text = computeAllowedDowntime(99.0, 7);
    expect(text).toBe('1h 40m 48s');
  });
});

describe('SloForm', () => {
  it('renders form with default or initial values', () => {
    render(
      <SloForm
        initialData={{ name: 'API Latency SLO', targetPercent: 99.5, windowDays: 7 }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/SLO Name/i)).toHaveValue('API Latency SLO');
    expect(screen.getByLabelText(/Target Reliability/i)).toHaveValue(99.5);
    expect(screen.getByLabelText(/7 Days/i)).toBeChecked();
  });

  it('validates target percentage bounds (90.000% – 99.999%)', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    render(<SloForm onSubmit={handleSubmit} onCancel={vi.fn()} />);

    const targetInput = screen.getByLabelText(/Target Reliability/i);
    const submitBtn = screen.getByTestId('slo-form-submit');

    // Invalid: below 90
    await user.clear(targetInput);
    await user.type(targetInput, '85');
    await user.click(submitBtn);

    expect(await screen.findByTestId('error-targetPercent')).toHaveTextContent(
      'Target must be between 90.000% and 99.999%'
    );
    expect(handleSubmit).not.toHaveBeenCalled();

    // Invalid: above 99.999
    await user.clear(targetInput);
    await user.type(targetInput, '100');
    await user.click(submitBtn);

    expect(await screen.findByTestId('error-targetPercent')).toHaveTextContent(
      'Target must be between 90.000% and 99.999%'
    );
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('displays live allowed downtime helper when valid target is typed', async () => {
    const user = userEvent.setup();
    render(<SloForm onSubmit={vi.fn()} onCancel={vi.fn()} />);

    const targetInput = screen.getByLabelText(/Target Reliability/i);
    await user.clear(targetInput);
    await user.type(targetInput, '99.9');

    const helper = await screen.findByTestId('allowed-downtime-helper');
    expect(helper).toBeInTheDocument();
    expect(helper).toHaveTextContent('43m 12s');
  });

  it('renders server error banner when provided', () => {
    render(
      <SloForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        serverError={{ message: 'Conflict: An SLO is already configured for this application' }}
      />
    );

    expect(screen.getByTestId('slo-form-server-error')).toHaveTextContent(
      'Conflict: An SLO is already configured for this application'
    );
  });

  it('calls onSubmit with parsed numeric fields on valid submit', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    render(<SloForm onSubmit={handleSubmit} onCancel={vi.fn()} />);

    const nameInput = screen.getByLabelText(/SLO Name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Checkout Service Availability');

    const targetInput = screen.getByLabelText(/Target Reliability/i);
    await user.clear(targetInput);
    await user.type(targetInput, '99.95');

    await user.click(screen.getByLabelText(/7 Days/i));
    await user.click(screen.getByTestId('slo-form-submit'));

    expect(handleSubmit).toHaveBeenCalledWith({
      name: 'Checkout Service Availability',
      targetPercent: 99.95,
      windowDays: 7
    });
  });

  it('calls onCancel when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    const handleCancel = vi.fn();

    render(<SloForm onSubmit={vi.fn()} onCancel={handleCancel} />);
    await user.click(screen.getByRole('button', { name: /Cancel/i }));

    expect(handleCancel).toHaveBeenCalled();
  });
});
