import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from './Input.jsx';

describe('Input component', () => {
  it('associates label with input using htmlFor and id', () => {
    render(<Input label="Endpoint URL" id="endpoint-url" />);
    const input = screen.getByLabelText(/Endpoint URL/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('id', 'endpoint-url');
  });

  it('renders required indicator when required is true', () => {
    render(<Input label="Application Name" id="app-name" required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('displays error message and sets aria-invalid and aria-describedby', () => {
    render(
      <Input
        label="Webhook URL"
        id="webhook-url"
        error="Invalid URL protocol"
      />
    );
    const input = screen.getByLabelText(/Webhook URL/i);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'webhook-url-error');
    const errorMsg = screen.getByRole('alert');
    expect(errorMsg).toHaveTextContent('Invalid URL protocol');
  });

  it('renders helperText when provided without error', () => {
    render(
      <Input
        label="Host"
        id="host"
        helperText="Enter fully qualified domain name"
      />
    );
    expect(screen.getByText('Enter fully qualified domain name')).toBeInTheDocument();
  });

  it('calls onChange handler when value changes', () => {
    const handleChange = vi.fn();
    render(<Input label="Name" id="name" onChange={handleChange} />);
    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'New Name' } });
    expect(handleChange).toHaveBeenCalled();
  });

  it('forwards ref to input element', () => {
    const ref = React.createRef();
    render(<Input label="Test" id="test" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});

