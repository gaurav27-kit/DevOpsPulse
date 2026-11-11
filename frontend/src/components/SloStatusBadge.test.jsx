import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SloStatusBadge } from './SloStatusBadge.jsx';

describe('SloStatusBadge', () => {
  it('renders healthy badge with correct text and styling', () => {
    render(<SloStatusBadge status="healthy" />);
    const badge = screen.getByTestId('slo-status-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Healthy');
    expect(badge).toHaveAttribute('aria-label', 'SLO Status: Healthy');
  });

  it('renders at_risk badge with correct text and styling', () => {
    render(<SloStatusBadge status="at_risk" />);
    const badge = screen.getByTestId('slo-status-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('At risk');
    expect(badge).toHaveAttribute('aria-label', 'SLO Status: At risk');
  });

  it('renders breached badge with correct text and styling', () => {
    render(<SloStatusBadge status="breached" />);
    const badge = screen.getByTestId('slo-status-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Breached');
    expect(badge).toHaveAttribute('aria-label', 'SLO Status: Breached');
  });

  it('renders insufficient_data badge with "Not enough data" text', () => {
    render(<SloStatusBadge status="insufficient_data" />);
    const badge = screen.getByTestId('slo-status-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Not enough data');
    expect(badge).toHaveAttribute('aria-label', 'SLO Status: Not enough data');
  });

  it('falls back to insufficient_data on unknown or null status', () => {
    render(<SloStatusBadge status={null} />);
    const badge = screen.getByTestId('slo-status-badge');
    expect(badge).toHaveTextContent('Not enough data');
  });
});
