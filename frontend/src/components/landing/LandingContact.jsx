import React, { useState } from 'react';
import { Send, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { contactApi } from '../../api/contactApi.js';
import { useScrollReveal } from '../../hooks/useScrollReveal.js';

export function LandingContact() {
  const [sectionRef, isVisible] = useScrollReveal();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
    website: '' // Honeypot field
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null); // { type: 'success' | 'error', message: string }

  const validateForm = () => {
    const newErrors = {};

    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      newErrors.name = 'Name is required';
    } else if (trimmedName.length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    } else if (trimmedName.length > 80) {
      newErrors.name = 'Name cannot exceed 80 characters';
    }

    const trimmedEmail = formData.email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail) {
      newErrors.email = 'Email address is required';
    } else if (!emailRegex.test(trimmedEmail)) {
      newErrors.email = 'Please enter a valid email address';
    }

    const trimmedMessage = formData.message.trim();
    if (!trimmedMessage) {
      newErrors.message = 'Message is required';
    } else if (trimmedMessage.length < 10) {
      newErrors.message = 'Message must be at least 10 characters';
    } else if (trimmedMessage.length > 2000) {
      newErrors.message = 'Message cannot exceed 2000 characters';
    }

    return newErrors;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
    if (submitStatus) {
      setSubmitStatus(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const clientErrors = validateForm();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        message: formData.message.trim()
      };

      // Include honeypot if present
      if (formData.website) {
        payload.website = formData.website;
      }

      await contactApi.submitMessage(payload);

      setSubmitStatus({
        type: 'success',
        message: 'Thank you for reaching out! Your message has been received and our team will get back to you shortly.'
      });

      setFormData({
        name: '',
        email: '',
        message: '',
        website: ''
      });
      setErrors({});
    } catch (err) {
      const errorMessage =
        err.response?.data?.message ||
        'Unable to send your message right now. Please check your connection and try again.';
      setSubmitStatus({
        type: 'error',
        message: errorMessage
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      id="contact"
      ref={sectionRef}
      className="py-20 md:py-28 bg-[#070d0d] text-white border-t border-white/10 relative scroll-mt-20"
      aria-labelledby="contact-heading"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#ff802b] mb-3">
            Get in Touch
          </p>
          <h2
            id="contact-heading"
            className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight"
          >
            Have Questions or Need Enterprise Support?
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            Send us a message and our engineering team will respond within 24 hours.
          </p>
        </div>

        <div
          className={`bg-[#0e171e] rounded-2xl p-6 sm:p-10 border border-white/10 shadow-xl transition-all duration-300 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          {submitStatus && (
            <div
              role="alert"
              className={`mb-8 p-4 rounded-xl flex items-start gap-3 border ${
                submitStatus.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              {submitStatus.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <span className="text-sm font-medium leading-relaxed">{submitStatus.message}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            {/* Honeypot field - invisible to genuine human users */}
            <div style={{ display: 'none' }} aria-hidden="true">
              <label htmlFor="landing-website-honeypot">Website</label>
              <input
                id="landing-website-honeypot"
                type="text"
                name="website"
                value={formData.website}
                onChange={handleChange}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Name */}
              <div>
                <label
                  htmlFor="contact-name"
                  className="block text-sm font-semibold text-slate-200 mb-2"
                >
                  Full Name <span className="text-rose-400">*</span>
                </label>
                <input
                  id="contact-name"
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="Jane Doe"
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? 'contact-name-error' : undefined}
                  className={`w-full px-4 py-3 rounded-xl bg-white/5 border ${
                    errors.name ? 'border-rose-400 focus:ring-rose-400' : 'border-white/15 focus:ring-[#ff802b]'
                  } text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 transition-all text-sm sm:text-base`}
                />
                {errors.name && (
                  <p id="contact-name-error" className="mt-1.5 text-xs font-medium text-rose-400">
                    {errors.name}
                  </p>
                )}
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor="contact-email"
                  className="block text-sm font-semibold text-slate-200 mb-2"
                >
                  Work Email <span className="text-rose-400">*</span>
                </label>
                <input
                  id="contact-email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="jane@company.com"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'contact-email-error' : undefined}
                  className={`w-full px-4 py-3 rounded-xl bg-white/5 border ${
                    errors.email ? 'border-rose-400 focus:ring-rose-400' : 'border-white/15 focus:ring-[#ff802b]'
                  } text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 transition-all text-sm sm:text-base`}
                />
                {errors.email && (
                  <p id="contact-email-error" className="mt-1.5 text-xs font-medium text-rose-400">
                    {errors.email}
                  </p>
                )}
              </div>
            </div>

            {/* Message */}
            <div>
              <label
                htmlFor="contact-message"
                className="block text-sm font-semibold text-slate-200 mb-2"
              >
                Message <span className="text-rose-400">*</span>
              </label>
              <textarea
                id="contact-message"
                name="message"
                rows={5}
                value={formData.message}
                onChange={handleChange}
                required
                placeholder="Tell us about your monitoring requirements or questions..."
                aria-invalid={!!errors.message}
                aria-describedby={errors.message ? 'contact-message-error' : undefined}
                className={`w-full px-4 py-3 rounded-xl bg-white/5 border ${
                  errors.message ? 'border-rose-400 focus:ring-rose-400' : 'border-white/15 focus:ring-[#ff802b]'
                } text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 transition-all text-sm sm:text-base resize-y`}
              />
              <div className="flex items-center justify-between mt-1.5">
                {errors.message ? (
                  <p id="contact-message-error" className="text-xs font-medium text-rose-400">
                    {errors.message}
                  </p>
                ) : (
                  <span />
                )}
                <span className="text-xs text-slate-400">
                  {formData.message.length} / 2000
                </span>
              </div>
            </div>

            {/* Submit button */}
            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto min-h-[48px] px-8 py-3.5 rounded-xl font-bold text-base bg-[#ff802b] text-[#070d0d] hover:bg-[#ff9347] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-orange-500/20 inline-flex items-center justify-center gap-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                    <span>Sending message...</span>
                  </>
                ) : (
                  <>
                    <span>Send Message</span>
                    <Send className="w-4 h-4" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

