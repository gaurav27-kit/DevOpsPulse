import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BurnRateCard } from './BurnRateCard.jsx';

describe('BurnRateCard', () => {
  it('renders standard rates when no alerts are active', () => {
    render(
      <BurnRateCard
        burnRate1h={1.2}
        burnRate6h={0.8}
        fastBurn={false}
        slowBurn={false}
      />
    );

    const card = screen.getByTestId('burn-rate-card');
    expect(card).toBeInTheDocument();
    expect(screen.getByTestId('burn-rate-1h')).toHaveTextContent('1.2x');
    expect(screen.getByTestId('burn-rate-6h')).toHaveTextContent('0.8x');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders dash placeholder when rates are null', () => {
    render(
      <BurnRateCard
        burnRate1h={null}
        burnRate6h={null}
        fastBurn={false}
        slowBurn={false}
      />
    );

    expect(screen.getByTestId('burn-rate-1h')).toHaveTextContent('—');
    expect(screen.getByTestId('burn-rate-6h')).toHaveTextContent('—');
  });

  it('renders fast burn alert when fastBurn is true', () => {
    render(
      <BurnRateCard
        burnRate1h={15.2}
        burnRate6h={5.4}
        fastBurn={true}
        slowBurn={false}
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByTestId('fast-burn-alert')).toBeInTheDocument();
    expect(alert).toHaveTextContent('Fast Burn Alert');
    expect(alert).toHaveTextContent('15.2x');
  });

  it('renders slow burn alert when slowBurn is true and fastBurn is false', () => {
    render(
      <BurnRateCard
        burnRate1h={3.0}
        burnRate6h={7.5}
        fastBurn={false}
        slowBurn={true}
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByTestId('slow-burn-alert')).toBeInTheDocument();
    expect(alert).toHaveTextContent('Slow Burn Alert');
    expect(alert).toHaveTextContent('7.5x');
  });
});
