import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBudgetGauge } from './ErrorBudgetGauge.jsx';

describe('ErrorBudgetGauge', () => {
  it('renders meter with accessible attributes when budget data is present', () => {
    render(
      <ErrorBudgetGauge
        budgetConsumedPct={35.4}
        budgetRemainingPct={64.6}
        totalChecks={100}
      />
    );

    const gauge = screen.getByTestId('error-budget-gauge');
    expect(gauge).toBeInTheDocument();

    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '35.4');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
    expect(meter).toHaveAttribute('aria-valuetext', '35.4% consumed, 64.6% remaining');

    expect(screen.getByText('35.4%')).toBeInTheDocument();
    expect(screen.getByText('(64.6% remaining)')).toBeInTheDocument();
  });

  it('caps visual bar width at 100% when budgetConsumedPct exceeds 100% (e.g. 500%) but shows true text', () => {
    render(
      <ErrorBudgetGauge
        budgetConsumedPct={500}
        budgetRemainingPct={0}
        totalChecks={1000}
      />
    );

    expect(screen.getByText('500.0%')).toBeInTheDocument();
    expect(screen.getByText('(0.0% remaining)')).toBeInTheDocument();

    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '500');

    // Visual bar inside the meter
    const bar = meter.querySelector('div');
    expect(bar).toHaveStyle({ width: '100%' });
  });

  it('renders explicit empty state when budgetConsumedPct is null', () => {
    render(
      <ErrorBudgetGauge
        budgetConsumedPct={null}
        budgetRemainingPct={null}
        totalChecks={4}
        minChecks={10}
      />
    );

    const empty = screen.getByTestId('error-budget-gauge-empty');
    expect(empty).toBeInTheDocument();
    expect(screen.getByText('Not enough data')).toBeInTheDocument();
    expect(screen.getByText('4 of 10 checks recorded. Calculations activate after 10 checks.')).toBeInTheDocument();

    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuetext', 'Not enough data to calculate error budget');
  });
});
