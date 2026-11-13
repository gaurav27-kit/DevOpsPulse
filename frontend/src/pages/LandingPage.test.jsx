import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LandingPage from './LandingPage.jsx';
import { renderWithProviders } from '../tests/helpers.jsx';
import * as useAuthModule from '../hooks/useAuth.js';
import { contactApi } from '../api/contactApi.js';

vi.mock('../hooks/useAuth.js');
vi.mock('../api/contactApi.js');

describe('LandingPage integration suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      user: null,
      isLoading: false
    });
  });

  it('renders a single h1 heading split around the live visual status card', () => {
    renderWithProviders(<LandingPage />);

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(/Production Uptime Monitoring/i);
    expect(headings[0]).toHaveTextContent(/Engineered for Resilient SRE Teams/i);
    expect(screen.getByText(/api\.production\.internal/i)).toBeInTheDocument();
    expect(screen.getByText(/Status: Up/i)).toBeInTheDocument();
  });

  it('renders all core landing page sections and accessibility landmarks', () => {
    renderWithProviders(<LandingPage />);

    // Skip to content link
    const skipLink = screen.getByRole('link', { name: /Skip to main content/i });
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute('href', '#main-content');

    // Section headings
    expect(screen.getByRole('heading', { name: /Engineered for Observability and SRE Rigor/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /From Setup to Production Visibility in Minutes/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Built With Zero Compromises on Security/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Have Questions or Need Enterprise Support/i })).toBeInTheDocument();

    // Navigation links point to valid anchor hashes
    const navFeatures = screen.getAllByRole('link', { name: /^Features$/i })[0];
    expect(navFeatures).toHaveAttribute('href', '#features');

    const navHowItWorks = screen.getAllByRole('link', { name: /^How It Works$/i })[0];
    expect(navHowItWorks).toHaveAttribute('href', '#how-it-works');

    const navSecurity = screen.getAllByRole('link', { name: /^Security$/i })[0];
    expect(navSecurity).toHaveAttribute('href', '#security');

    const navContact = screen.getAllByRole('link', { name: /^Contact$/i })[0];
    expect(navContact).toHaveAttribute('href', '#contact');
  });

  it('displays guest CTA links (Sign in & Get started free) when unauthenticated', () => {
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      user: null,
      isLoading: false
    });

    renderWithProviders(<LandingPage />);

    // Hero and Nav "Get started free" links point to /register
    const registerLinks = screen.getAllByRole('link', { name: /Get started free/i });
    expect(registerLinks.length).toBeGreaterThanOrEqual(1);
    expect(registerLinks[0]).toHaveAttribute('href', '/register');

    // Sign in links point to /login
    const signInLinks = screen.getAllByRole('link', { name: /Sign In/i });
    expect(signInLinks.length).toBeGreaterThanOrEqual(1);
    expect(signInLinks[0]).toHaveAttribute('href', '/login');
  });

  it('displays authenticated CTA ("Open dashboard") when user is logged in', () => {
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      user: { id: 'u1', name: 'Alice DevOps', email: 'alice@example.com' },
      isLoading: false
    });

    renderWithProviders(<LandingPage />);

    // "Open dashboard" buttons in nav and hero
    const dashboardLinks = screen.getAllByRole('link', { name: /Open dashboard/i });
    expect(dashboardLinks.length).toBeGreaterThanOrEqual(1);
    expect(dashboardLinks[0]).toHaveAttribute('href', '/dashboard');

    // Should not show "Get started free"
    expect(screen.queryByRole('link', { name: /Get started free/i })).not.toBeInTheDocument();
  });

  describe('Contact Form Validation & Submission', () => {
    it('validates required fields on client before sending', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LandingPage />);

      const submitBtn = screen.getByRole('button', { name: /Send Message/i });
      await user.click(submitBtn);

      expect(await screen.findByText('Name is required')).toBeInTheDocument();
      expect(screen.getByText('Email address is required')).toBeInTheDocument();
      expect(screen.getByText('Message is required')).toBeInTheDocument();
      expect(contactApi.submitMessage).not.toHaveBeenCalled();
    });

    it('validates email format and character length constraints', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LandingPage />);

      const nameInput = screen.getByLabelText(/Full Name/i);
      const emailInput = screen.getByLabelText(/Work Email/i);
      const messageInput = screen.getByLabelText(/Message/i);
      const submitBtn = screen.getByRole('button', { name: /Send Message/i });

      await user.type(nameInput, 'A');
      await user.type(emailInput, 'not-an-email');
      await user.type(messageInput, 'Short');
      await user.click(submitBtn);

      expect(await screen.findByText('Name must be at least 2 characters')).toBeInTheDocument();
      expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
      expect(screen.getByText('Message must be at least 10 characters')).toBeInTheDocument();
      expect(contactApi.submitMessage).not.toHaveBeenCalled();
    });

    it('successfully submits valid contact message and displays success banner', async () => {
      const user = userEvent.setup();
      contactApi.submitMessage.mockResolvedValueOnce({
        success: true,
        message: 'Message received'
      });

      renderWithProviders(<LandingPage />);

      const nameInput = screen.getByLabelText(/Full Name/i);
      const emailInput = screen.getByLabelText(/Work Email/i);
      const messageInput = screen.getByLabelText(/Message/i);
      const submitBtn = screen.getByRole('button', { name: /Send Message/i });

      await user.type(nameInput, 'Grace Hopper');
      await user.type(emailInput, 'grace@navy.mil');
      await user.type(messageInput, 'We need automated SLO error budget tracking for our mission systems.');
      await user.click(submitBtn);

      await waitFor(() => {
        expect(contactApi.submitMessage).toHaveBeenCalledWith({
          name: 'Grace Hopper',
          email: 'grace@navy.mil',
          message: 'We need automated SLO error budget tracking for our mission systems.'
        });
      });

      expect(
        await screen.findByText(/Thank you for reaching out! Your message has been received/i)
      ).toBeInTheDocument();

      // Form fields should be reset
      expect(nameInput).toHaveValue('');
      expect(emailInput).toHaveValue('');
      expect(messageInput).toHaveValue('');
    });

    it('displays error banner when submission fails', async () => {
      const user = userEvent.setup();
      contactApi.submitMessage.mockRejectedValueOnce({
        response: {
          data: { message: 'Too many contact requests from this IP. Please try again later.' }
        }
      });

      renderWithProviders(<LandingPage />);

      await user.type(screen.getByLabelText(/Full Name/i), 'Grace Hopper');
      await user.type(screen.getByLabelText(/Work Email/i), 'grace@navy.mil');
      await user.type(screen.getByLabelText(/Message/i), 'Enterprise inquiry with rate limiting check.');
      await user.click(screen.getByRole('button', { name: /Send Message/i }));

      expect(
        await screen.findByText('Too many contact requests from this IP. Please try again later.')
      ).toBeInTheDocument();
    });

    it('contains hidden honeypot website field that does not interfere with normal human usage', () => {
      const { container } = renderWithProviders(<LandingPage />);

      const honeypot = container.querySelector('#landing-website-honeypot');
      expect(honeypot).toBeInTheDocument();
      expect(honeypot).toHaveAttribute('name', 'website');
      expect(honeypot).toHaveAttribute('tabIndex', '-1');
      expect(honeypot.parentElement).toHaveAttribute('aria-hidden', 'true');
    });
  });
});

