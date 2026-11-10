import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResponseTimeChart } from './ResponseTimeChart.jsx';

describe('ResponseTimeChart component', () => {
  it('renders friendly EmptyState when series is empty or contains only null values', () => {
    const emptySeries = [
      { bucketStart: '2026-01-01T00:00:00Z', avgResponseTimeMs: null },
      { bucketStart: '2026-01-01T01:00:00Z', avgResponseTimeMs: null }
    ];

    render(<ResponseTimeChart series={emptySeries} range="24h" />);

    expect(screen.getByText('No health-check data for this range yet')).toBeInTheDocument();
  });

  it('renders screen reader summary and latency statistics when data is present', () => {
    const seriesWithData = [
      { bucketStart: '2026-01-01T00:00:00Z', avgResponseTimeMs: 120 },
      { bucketStart: '2026-01-01T01:00:00Z', avgResponseTimeMs: null }, // gap
      { bucketStart: '2026-01-01T02:00:00Z', avgResponseTimeMs: 240 }
    ];

    render(<ResponseTimeChart series={seriesWithData} range="24h" />);

    // Screen reader summary must be present
    expect(
      screen.getByText(/Average response time ranged from 120 ms to 240 ms with an average of 180 ms/i)
    ).toBeInTheDocument();

    // Stats display
    expect(screen.getByText('120 ms')).toBeInTheDocument();
    expect(screen.getByText('180 ms')).toBeInTheDocument();
    expect(screen.getByText('240 ms')).toBeInTheDocument();
  });
});

