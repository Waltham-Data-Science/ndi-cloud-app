'use client';

/**
 * AuthForm primitives — minimal Tailwind-styled text inputs +
 * inline error display. Used by all 9 auth pages.
 *
 * Deliberately not Formik. The auth forms are 1–4 fields each with
 * straightforward client-side validation (required, email format,
 * minLength); React's controlled-input pattern handles them in ~5
 * lines per field. Phase 2b plan called for "Formik + Yup" but
 * that was the source repo's choice — we don't carry forward
 * dependencies the new code doesn't need. ~30 KB gz savings.
 */
import { clsx } from 'clsx';
import type { InputHTMLAttributes, ReactNode } from 'react';

export type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  label: string;
  hint?: string;
  error?: string;
};

export function Field({ label, hint, error, id, ...rest }: FieldProps) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5 mb-4">
      <label
        htmlFor={inputId}
        className="text-sm font-semibold text-fg-primary"
      >
        {label}
      </label>
      <input
        id={inputId}
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
        className={clsx(
          'w-full px-3.5 py-2.5 rounded-md border text-sm text-fg-primary bg-bg-surface',
          'transition-colors duration-(--duration-base) ease-(--ease-out)',
          'focus:outline-none focus:border-ndi-teal focus:ring-2 focus:ring-ndi-teal/20',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error ? 'border-red-400' : 'border-border-strong',
        )}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className="text-xs text-fg-muted m-0">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-red-600 m-0" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Banner-style error display for top-of-form failures (network errors,
 * "invalid credentials", etc.) — distinct from per-field validation.
 */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3.5 py-2.5 mb-4"
    >
      {children}
    </div>
  );
}
