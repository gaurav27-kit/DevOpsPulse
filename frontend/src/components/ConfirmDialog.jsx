
import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './Button.jsx';

/**
 * Accessible confirmation modal dialog.
 * Enforces role="dialog", aria-modal="true", keyboard trap/escape listeners,
 * and preserves previous DOM focus upon close.
 * Styled with DevOpsPulse design tokens.
 */
export function ConfirmDialog({
  isOpen,
  title = 'Are you sure?',
  description,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false,
  onConfirm,
  onClose,
  children
}) {
  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      // Focus the cancel button as a safe default
      cancelButtonRef.current?.focus();

      const handleKeyDown = (e) => {
        if (e.key === 'Escape' && !isLoading) {
          e.preventDefault();
          onClose();
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
          previousFocusRef.current.focus();
        }
      };
    }
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#283044]/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="w-full max-w-md bg-white rounded-2xl p-6 shadow-xl border border-[#e2e8f0] transform transition-all"
      >
        <div className="flex items-start gap-4">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              variant === 'danger'
                ? 'bg-[#ffdad6] text-[#ba1a1a]'
                : 'bg-[#f2f3ff] text-[#0061a2]'
            }`}
          >
            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
          </div>

          <div className="flex-1">
            <h3 id="confirm-dialog-title" className="text-base font-semibold text-[#131b2e] leading-snug">
              {title}
            </h3>
            {description && (
              <p id="confirm-dialog-desc" className="mt-2 text-sm text-[#5a4136] leading-relaxed">
                {description}
              </p>
            )}
            {children && <div className="mt-4">{children}</div>}
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="text-[#59605f] hover:text-[#131b2e] p-1 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#ff6700]"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-[#eaedff]">
          <Button
            ref={cancelButtonRef}
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="text-xs py-2 px-3.5"
          >
            {cancelText}
          </Button>

          <Button
            variant={variant}
            onClick={onConfirm}
            isLoading={isLoading}
            className="text-xs py-2 px-3.5"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
