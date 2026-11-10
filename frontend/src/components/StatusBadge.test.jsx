import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge.jsx';

describe('StatusBadge component', () => {
  it('renders "Operational" text and accessible label for "up" status', () => {
    render(<StatusBadge status="up" />);
    expect(screen.getByText('Operational')).toBeInTheDocument();
    expect(screen.getByLabelText('Status: Operational')).toBeInTheDocument();
  });

  it('renders "Degraded" text for "degraded" status', () => {
    render(<StatusBadge status="degraded" />);
    expect(screen.getByText('Degraded')).toBeInTheDocument();
    expect(screen.getByLabelText('Status: Degraded')).toBeInTheDocument();
  });

  it('renders "Down" text for "down" status', () => {
    render(<StatusBadge status="down" />);
    expect(screen.getByText('Down')).toBeInTheDocument();
    expect(screen.getByLabelText('Status: Down')).toBeInTheDocument();
  });

  it('renders "Unknown" for unknown or missing status', () => {
    render(<StatusBadge status={null} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByLabelText('Status: Unknown')).toBeInTheDocument();
  });
});

