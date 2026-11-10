import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog.jsx';

describe('ConfirmDialog component', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ConfirmDialog
        isOpen={false}
        title="Delete Channel"
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog elements when isOpen is true and focuses Cancel button', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Delete Notification Channel"
        description="Are you sure you want to delete this channel?"
        confirmText="Delete channel"
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delete Notification Channel' })).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this channel?')).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    expect(cancelBtn).toHaveFocus();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const handleConfirm = vi.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm Action"
        confirmText="Confirm"
        onConfirm={handleConfirm}
        onClose={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const handleClose = vi.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm Action"
        onConfirm={() => {}}
        onClose={handleClose}
      />
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to previously active element on close', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open Dialog';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const handleClose = vi.fn();
    const { unmount } = render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm Action"
        onConfirm={() => {}}
        onClose={handleClose}
      />
    );

    unmount();
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });
});

