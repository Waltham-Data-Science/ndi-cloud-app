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
 *
 * `type="password"` fields render a per-field show/hide toggle
 * (M5 fidelity restore — the source MUI form had `Visibility` /
 * `VisibilityOff` adornments that flipped the input `type`). The
 * eye / eye-off SVG is inlined to avoid an icon-library dep — the
 * shape weighs ~600 bytes inline vs ~7 KB for `@mui/icons-material`.
 */
import { clsx } from 'clsx';
import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

export type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  label: string;
  hint?: string;
  error?: string;
};

export function Field({ label, hint, error, id, type, ...rest }: FieldProps) {
  // Use a stable React-generated id so multiple `<Field label="Password">`
  // instances on the same page (e.g. /reset-password's current+new) don't
  // collide — the previous `field-${slugified-label}` scheme assumed each
  // label was unique per page, which is not true for reset-password.
  const reactId = useId();
  const inputId = id ?? `field-${reactId}`;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(' ') || undefined;

  const isPassword = type === 'password';
  const [reveal, setReveal] = useState(false);
  const effectiveType = isPassword ? (reveal ? 'text' : 'password') : type;

  return (
    <div className="flex flex-col gap-1.5 mb-4">
      <label
        htmlFor={inputId}
        className="text-sm font-semibold text-fg-primary"
      >
        {label}
      </label>
      <div className={clsx(isPassword && 'relative')}>
        <input
          id={inputId}
          type={effectiveType}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          className={clsx(
            'w-full px-3.5 py-2.5 rounded-md border text-sm text-fg-primary bg-bg-surface',
            'transition-colors duration-(--duration-base) ease-(--ease-out)',
            'focus:outline-none focus:border-ndi-teal focus:ring-2 focus:ring-ndi-teal/20',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error ? 'border-red-400' : 'border-border-strong',
            // Reserve room for the toggle button on password fields so the
            // typed value doesn't slide under the eye icon.
            isPassword && 'pr-11',
          )}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            aria-pressed={reveal}
            className={clsx(
              'absolute inset-y-0 right-0 flex items-center justify-center',
              'w-10 text-fg-muted hover:text-fg-primary',
              'transition-colors duration-(--duration-base) ease-(--ease-out)',
              'rounded-md',
              'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ndi-teal',
            )}
          >
            {reveal ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
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

// Inline 18x18 eye / eye-off SVGs (Lucide-style stroke). Inlining keeps the
// password-toggle from pulling in a 7 KB icon library for two glyphs.
function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c6.5 0 10 7 10 7a17.18 17.18 0 0 1-3.39 4.51" />
      <path d="M6.61 6.61A17.07 17.07 0 0 0 2 12s3.5 7 10 7a10.93 10.93 0 0 0 5.39-1.39" />
      <path d="M14.12 14.12A3 3 0 0 1 9.88 9.88" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
