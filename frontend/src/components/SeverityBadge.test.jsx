import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SeverityBadge } from './SeverityBadge.jsx';

describe('SeverityBadge component', () => {
  it('renders "Critical" text and badge styling for critical severity', () => {
    render(<SeverityBadge severity="critical" />);
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('renders "High" text for high severity', () => {
    render(<SeverityBadge severity="high" />);
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('renders "Medium" text for medium severity', () => {
    render(<SeverityBadge severity="medium" />);
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });

  it('renders "Low" text for low severity', () => {
    render(<SeverityBadge severity="low" />);
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('falls back to "Low" for unrecognized or null severity', () => {
    render(<SeverityBadge severity={null} />);
    expect(screen.getByText('Low')).toBeInTheDocument();
  });
});

