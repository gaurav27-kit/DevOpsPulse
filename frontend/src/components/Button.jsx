import React from 'react';
import { Spinner } from './Spinner.jsx';

/**
 * Accessible button supporting primary, secondary, outline, and danger variants
 * with an integrated loading spinner and disabled state.
 */
export const Button = React.forwardRef(function Button(
  {
    children,
    type = 'button',
    variant = 'primary',
    isLoading = false,
    disabled = false,
    className = '',
    onClick,
    ...rest
  },
  ref
) {
  const baseClasses =
    'inline-flex items-center justify-center font-medium rounded-lg px-4 py-2 min-h-[40px] text-sm transition-all focus:outline-hidden focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-[#070d0d] text-white hover:bg-[#131b2e] focus:ring-[#ff6700] shadow-xs active:scale-[0.99]',
    accent: 'bg-[#ff6700] text-white hover:bg-[#e05a00] focus:ring-[#ff6700] shadow-xs active:scale-[0.99]',
    secondary: 'bg-[#f2f3ff] text-[#131b2e] hover:bg-[#eaedff] focus:ring-[#ff6700]',
    outline: 'border border-[#e2e8f0] bg-white text-[#131b2e] hover:bg-[#f2f3ff] hover:border-[#cbd5e1] focus:ring-[#ff6700] shadow-xs',
    danger: 'bg-[#ba1a1a] text-white hover:bg-[#93000a] focus:ring-[#ba1a1a] shadow-xs active:scale-[0.99]'
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      onClick={onClick}
      className={`${baseClasses} ${variants[variant] || variants.primary} ${className}`}
      {...rest}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <Spinner size="sm" className={variant === 'primary' || variant === 'danger' ? 'text-white' : 'text-slate-600'} />
          <span>Processing...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
});

