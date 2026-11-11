import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PartialWindowNotice } from './PartialWindowNotice.jsx';

describe('PartialWindowNotice', () => {
  it('renders partial window coverage percentage and check counts', () => {
    render(
      <PartialWindowNotice
        coveragePct={45.2}
        windowDays={30}
        totalChecks={1250}
      />
    );

    const notice = screen.getByTestId('partial-window-notice');
    expect(notice).toBeInTheDocument();
    expect(screen.getByText(/Partial Window/i)).toBeInTheDocument();
    expect(screen.getByText(/45\.2% window coverage/i)).toBeInTheDocument();
  });

  it('renders with default values when coverage is not provided', () => {
    render(<PartialWindowNotice />);
    expect(screen.getByTestId('partial-window-notice')).toBeInTheDocument();
  });
});
