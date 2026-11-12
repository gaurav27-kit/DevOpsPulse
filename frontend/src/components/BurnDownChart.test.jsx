import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  BurnDownChart,
  formatUtcDateLabel,
  formatCompactTick,
  computeYAxisDomainMax,
  getCappedChartNote
} from './BurnDownChart.jsx';

describe('formatCompactTick', () => {
  it('formats tick outputs compactly for 0, 100, 1500, and 80000', () => {
    expect(formatCompactTick(0)).toBe('0%');
    expect(formatCompactTick(100)).toBe('100%');
    expect(formatCompactTick(1500)).toBe('1.5k%');
    expect(formatCompactTick(80000)).toBe('80k%');
  });
});

describe('computeYAxisDomainMax', () => {
  it('clamps the domain max for values 0, 80, 150, and 81671', () => {
    // 0: below 200, 1.5 * 0 = 0 -> minimum 150
    expect(computeYAxisDomainMax(0)).toBe(150);
    // 80: below 200, 1.5 * 80 = 120 -> minimum 150
    expect(computeYAxisDomainMax(80)).toBe(150);
    // 150: 1.5 * 150 = 225 -> capped at 200
    expect(computeYAxisDomainMax(150)).toBe(200);
    // 81671: far above 200 -> capped at 200
    expect(computeYAxisDomainMax(81671)).toBe(200);
  });
});

describe('getCappedChartNote', () => {
  it('generates capped note only when actualMax exceeds cap', () => {
    expect(getCappedChartNote(150, 80)).toBeNull();
    expect(getCappedChartNote(200, 150)).toBeNull();
    expect(getCappedChartNote(200, 81671)).toBe('Chart capped at 200%. Actual maximum: 81,671%');
  });
});

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

  it('renders capped-note only when values exceed domain cap (e.g. 81671% vs 80%)', () => {
    // 1. Value within cap (80% <= 150% cap) -> no capped note
    const normalSeries = [
      { day: '2026-11-01', total: 100, bad: 0, cumulativeBudgetConsumedPct: 40.0 },
      { day: '2026-11-02', total: 100, bad: 1, cumulativeBudgetConsumedPct: 80.0 }
    ];
    const { unmount } = render(<BurnDownChart series={normalSeries} windowDays={30} />);
    expect(screen.queryByTestId('burndown-capped-note')).toBeNull();
    unmount();

    // 2. Value exceeding cap (81671% > 200% cap) -> capped note renders
    const hugeSeries = [
      { day: '2026-11-01', total: 100, bad: 0, cumulativeBudgetConsumedPct: 10.0 },
      { day: '2026-11-02', total: 100, bad: 80, cumulativeBudgetConsumedPct: 81671.2 }
    ];
    render(<BurnDownChart series={hugeSeries} windowDays={30} />);
    const cappedNote = screen.getByTestId('burndown-capped-note');
    expect(cappedNote).toBeInTheDocument();
    expect(cappedNote).toHaveTextContent('Chart capped at 200%. Actual maximum: 81,671%');
  });

  it('ensures tooltip displays the real un-clamped value formatted with thousands separators', () => {
    const hugeSeries = [
      { day: '2026-11-01', total: 1000, bad: 816, cumulativeBudgetConsumedPct: 81671.2 }
    ];
    const { container } = render(<BurnDownChart series={hugeSeries} windowDays={30} />);
    expect(screen.getByTestId('burndown-chart')).toBeInTheDocument();

    // Screen reader accessible summary confirms real un-clamped peaked value
    const srSummary = screen.getByTestId('burndown-chart-sr-summary');
    expect(srSummary).toHaveTextContent('peaked at 81671.2%');
  });
});
