import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { Input } from '../components/Input.jsx';
import { Button } from '../components/Button.jsx';
import { FormError } from '../components/FormError.jsx';

/**
 * Authentication login view with controlled form state, client validation,
 * and structured API error handling styled with DevOpsPulse design tokens.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoggingIn } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState('');

  // Destination to redirect back to upon successful login
  const from = location.state?.from?.pathname || '/dashboard';

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear specific field error as user types
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    }
    if (generalError) {
      setGeneralError('');
    }
  };

  const validateForm = () => {
    const errors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!formData.email.trim()) {
      errors.email = 'Email address is required';
    } else if (!emailRegex.test(formData.email.trim())) {
      errors.email = 'Please provide a valid email address';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGeneralError('');

    if (!validateForm()) return;

    try {
      await login({
        email: formData.email.trim(),
        password: formData.password
      });
      // Redirect to protected target or dashboard
      navigate(from, { replace: true });
    } catch (err) {
      if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors);
      }
      setGeneralError(err.message || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <div className="min-h-screen bg-[#faf8ff] flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        {/* Card Container */}
        <div className="bg-white border border-[#e2e8f0] rounded-2xl shadow-sm p-7 sm:p-9 space-y-6">
          {/* Brand Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#070d0d] flex items-center justify-center text-white shadow-xs">
                <Activity className="w-5 h-5 text-[#ff6700]" aria-hidden="true" />
              </div>
              <span className="text-xl font-bold tracking-tight text-[#131b2e]">DevOpsPulse</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#f2f3ff] text-[#59605f] border border-[#dae2fd]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff6700] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff6700]"></span>
              </span>
              <span className="text-2xs uppercase tracking-wider font-semibold font-mono text-[#5a4136]">Live v2.4</span>
            </div>
          </div>

          {/* Titles */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[#131b2e]">
              Sign in to DevOpsPulse
            </h2>
            <p className="mt-1 text-sm text-[#5a4136]">
              Monitor your services and track live incidents
            </p>
          </div>

          {/* Form */}
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <FormError message={generalError} />

            <Input
              label="Email address"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
              value={formData.email}
              onChange={handleChange}
              error={fieldErrors.email}
              disabled={isLoggingIn}
            />

            <Input
              label="Password"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              error={fieldErrors.password}
              disabled={isLoggingIn}
            />

            <Button
              type="submit"
              variant="primary"
              isLoading={isLoggingIn}
              className="w-full min-h-[42px] mt-2 font-semibold"
            >
              Sign in
            </Button>
          </form>

          {/* Footer Link */}
          <div className="text-center border-t border-[#eaedff] pt-4">
            <p className="text-sm text-[#5a4136]">
              Don't have an account?{' '}
              <Link
                to="/register"
                className="font-semibold text-[#a23f00] hover:text-[#ff6700] hover:underline transition-colors"
              >
                Create one now
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
