/**
 * Auth-page shell — reusable card layout for the 9 auth surfaces.
 *
 * Centers a card on bg-canvas, applies the design tokens (bg-bg-surface
 * + shadow-md + rounded-xl) consistent with /account-exists from
 * Phase 2a-1. Renders a heading, description, body slot, and an
 * optional footer slot for "back to login" / "create an account
 * instead" affordances.
 *
 * Pure RSC — works in Server Components by default. The client-side
 * forms inside the body slot carry their own 'use client' directive.
 */
import type { ReactNode } from 'react';

export type AuthCardProps = {
  heading: string;
  description?: ReactNode;
  children: ReactNode;
  /** "Don't have an account? Sign up" / "Back to login" affordance */
  footer?: ReactNode;
};

export function AuthCard({ heading, description, children, footer }: AuthCardProps) {
  return (
    // Outer padding ramps down on very narrow phones (<375px) so the
    // inner card has more breathing room: `px-7` (28px each side, 56px
    // total) was eating ~17% of the 320px-iPhone-SE viewport. `px-4`
    // below 375px frees up a usable amount; `py-20` (80px) stays
    // generous since vertical space isn't constrained.
    <main className="flex justify-center px-4 sm:px-7 py-20 min-h-[calc(100vh-160px)] bg-bg-canvas">
      {/* Inner card padding: p-5 on phones <375px (was p-6 below 640px);
          p-6 between 375 and 640; p-10 on tablet+. */}
      <div className="w-full max-w-[480px] bg-bg-surface rounded-xl shadow-md p-5 sm:p-6 md:p-10 mt-8">
        <h1 className="text-2xl font-bold text-fg-primary leading-tight mb-3 m-0">
          {heading}
        </h1>
        {description && (
          <p className="text-[15px] leading-relaxed text-fg-secondary mb-6 m-0">
            {description}
          </p>
        )}
        <div className="mt-6">{children}</div>
        {footer && (
          <div className="mt-6 pt-5 border-t border-border-subtle text-sm text-fg-muted">
            {footer}
          </div>
        )}
      </div>
    </main>
  );
}
