import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BurnDownChart, formatUtcDateLabel } from './BurnDownChart.jsx';

describe('formatUtcDateLabel', () => {
  it('formats UTC ISO strings into "MMM D" without timezone offset distortion', () => {
    expect(formatUtcDateLabel('2026-11-01T00:00:00.000Z')).toBe('Nov 1');
    expect(formatUtcDateLabel('2026-01-15T23:59:59.999Z')).toBe('Jan 15');
    expect(formatUtcDateLabel('2026-07-04')).toBe('Jul 4');
  });

  it('returns empty string on empty input', () => {
    expect(formatUtcDateLabel('')).toBe('');
    expect(formatUtcDateLabel(null)).toBe('');
  });
});

describe('BurnDownChart', () => {
  it('renders empty state when series is empty', () => {
    render(<BurnDownChart series={[]} windowDays={30} />);
    expect(screen.getByTestId('burndown-chart-empty')).toBeInTheDocument();
    expect(screen.getByText('No daily budget telemetry yet')).toBeInTheDocument();
  });

  it('renders chart container with accessible screen reader summary and 100% threshold', () => {
    const mockSeries = [
      { day: '2026-11-01T00:00:00.000Z', total: 100, bad: 1, cumulativeBudgetConsumedPct: 15.0 },
      { day: '2026-11-02T00:00:00.000Z', total: 120, bad: 2, cumulativeBudgetConsumedPct: 35.5 }
    ];

    render(<BurnDownChart series={mockSeries} windowDays={7} />);
    expect(screen.getByTestId('burndown-chart')).toBeInTheDocument();
    expect(screen.getByText('100% Threshold')).toBeInTheDocument();

    const srSummary = screen.getByTestId('burndown-chart-sr-summary');
    expect(srSummary).toBeInTheDocument();
    expect(srSummary).toHaveTextContent('Error budget consumption started at 15%');
    expect(srSummary).toHaveTextContent('peaked at 35.5%');
    expect(srSummary).toHaveTextContent('currently stands at 35.5%');
  });

  it('renders series day "2026-03-01" as March 1 and not February 28 with TZ=America/Los_Angeles', () => {
    const prevTz = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';

      // Assert date label formatter directly
      const label = formatUtcDateLabel('2026-03-01');
      expect(label).toMatch(/Mar(ch)? 1/);
      expect(label).not.toMatch(/Feb(ruary)? 28/);

      const labelIso = formatUtcDateLabel('2026-03-01T00:00:00.000Z');
      expect(labelIso).toMatch(/Mar(ch)? 1/);
      expect(labelIso).not.toMatch(/Feb(ruary)? 28/);

      // Render BurnDownChart with series containing 2026-03-01
      const mockSeries = [
        { day: '2026-03-01', total: 50, bad: 0, cumulativeBudgetConsumedPct: 10.0 }
      ];
      const { container } = render(<BurnDownChart series={mockSeries} windowDays={7} />);
      expect(screen.getByTestId('burndown-chart')).toBeInTheDocument();

      // Verify no rollback to Feb 28 in any rendered text or child attributes
      expect(container.textContent).not.toContain('Feb 28');
      expect(container.textContent).not.toContain('February 28');
    } finally {
      process.env.TZ = prevTz;
    }
  });
});
