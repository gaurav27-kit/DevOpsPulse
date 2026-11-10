import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from './Pagination.jsx';

describe('Pagination component', () => {
  it('renders nothing when total is 0 and totalPages <= 1', () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} total={0} onPageChange={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders total counts, current page and total pages', () => {
    render(
      <Pagination page={2} totalPages={5} total={50} onPageChange={() => {}} itemLabel="channel" />
    );
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText(/total channels/i)).toBeInTheDocument();
  });

  it('disables "Previous" on page 1 and enables "Next"', () => {
    const onPageChange = vi.fn();
    render(
      <Pagination page={1} totalPages={3} total={30} onPageChange={onPageChange} />
    );
    const prevBtn = screen.getByRole('button', { name: /previous/i });
    const nextBtn = screen.getByRole('button', { name: /next/i });
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).toBeEnabled();

    fireEvent.click(nextBtn);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('disables "Next" on the last page and enables "Previous"', () => {
    const onPageChange = vi.fn();
    render(
      <Pagination page={3} totalPages={3} total={30} onPageChange={onPageChange} />
    );
    const prevBtn = screen.getByRole('button', { name: /previous/i });
    const nextBtn = screen.getByRole('button', { name: /next/i });
    expect(prevBtn).toBeEnabled();
    expect(nextBtn).toBeDisabled();

    fireEvent.click(prevBtn);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});

