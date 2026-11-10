import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { Input } from '../components/Input.jsx';
import { Button } from '../components/Button.jsx';
import { FormError } from '../components/FormError.jsx';

/**
 * Registration view with client-side validation mirroring backend constraints,
 * accessible input fields, and server-side field-level error mapping styled
 * with DevOpsPulse design tokens.
 */
export function RegisterPage() {
  const navigate = useNavigate();
  const { register, isRegistering } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });

  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear specific error on change
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

    if (!formData.name.trim()) {
      errors.name = 'Full name is required';
    } else if (formData.name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters';
    }

    if (!formData.email.trim()) {
      errors.email = 'Email address is required';
    } else if (!emailRegex.test(formData.email.trim())) {
      errors.email = 'Please provide a valid email address';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters long';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGeneralError('');

    if (!validateForm()) return;

    try {
      await register({
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors);
      }
      setGeneralError(err.message || 'Registration failed. Please check the form.');
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
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#f2f3ff] text-[#5a4136] border border-[#dae2fd]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff6700]"></span>
              <span className="text-2xs uppercase tracking-wide font-semibold">Free Tier</span>
            </div>
          </div>

          {/* Titles */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[#131b2e]">
              Create an account
            </h2>
            <p className="mt-1 text-sm text-[#5a4136]">
              Start monitoring application uptime and response times
            </p>
          </div>

          {/* Form */}
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <FormError message={generalError} />

            <Input
              label="Full name"
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              placeholder="Alex Johnson"
              value={formData.name}
              onChange={handleChange}
              error={fieldErrors.name}
              disabled={isRegistering}
            />

            <Input
              label="Email address"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="alex@company.com"
              value={formData.email}
              onChange={handleChange}
              error={fieldErrors.email}
              disabled={isRegistering}
            />

            <Input
              label="Password"
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              helperText="Must be at least 8 characters"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              error={fieldErrors.password}
              disabled={isRegistering}
            />

            <Button
              type="submit"
              variant="primary"
              isLoading={isRegistering}
              className="w-full min-h-[42px] mt-2 font-semibold"
            >
              Create account
            </Button>
          </form>

          {/* Footer Link */}
          <div className="text-center border-t border-[#eaedff] pt-4">
            <p className="text-sm text-[#5a4136]">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-semibold text-[#a23f00] hover:text-[#ff6700] hover:underline transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
