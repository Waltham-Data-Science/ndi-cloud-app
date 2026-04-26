/**
 * AuthForm primitives — tests for the password-visibility toggle.
 *
 * M5 fidelity: the source repo's auth pages (login, createAccount) had a
 * Visibility / VisibilityOff IconButton in the password field's
 * `endAdornment` that flipped the input `type` between `'password'` and
 * `'text'`. The Phase 2b port dropped this. These tests pin the restored
 * behavior on the shared `Field` primitive so all 7 marketing auth forms
 * inherit it.
 *
 * Behavior covered:
 *   - `type="password"` renders a "Show password" toggle button
 *   - clicking the toggle flips the input `type` to `'text'`
 *   - clicking again flips it back to `'password'`
 *   - aria-label updates on each toggle ("Show password" ↔ "Hide password")
 *   - `type="email"` / `type="text"` do NOT render the toggle
 *   - per-instance state (two password fields toggle independently)
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Field } from '@/components/marketing/AuthForm';

describe('Field — password visibility toggle', () => {
  it('renders a "Show password" toggle for type="password"', () => {
    render(<Field label="Password" type="password" />);
    const toggle = screen.getByRole('button', { name: /show password/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('type', 'button'); // never submits the form
  });

  it('flips the input type from password → text on click', async () => {
    const user = userEvent.setup();
    render(<Field label="Password" type="password" />);
    // `getByLabelText(/^password$/i)` excludes the toggle button (whose
    // aria-label is "Show password" / "Hide password" — `^password$` only
    // matches the bare form label).
    const input = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    expect(input.type).toBe('password');

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(input.type).toBe('text');
    // aria-label flips so screen readers announce the new affordance
    expect(
      screen.getByRole('button', { name: /hide password/i }),
    ).toBeInTheDocument();
  });

  it('flips back to password on second click', async () => {
    const user = userEvent.setup();
    render(<Field label="Password" type="password" />);
    const input = screen.getByLabelText(/^password$/i) as HTMLInputElement;

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(input.type).toBe('text');
    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(input.type).toBe('password');
  });

  it('does NOT render a toggle for type="email"', () => {
    render(<Field label="Email" type="email" />);
    expect(
      screen.queryByRole('button', { name: /password/i }),
    ).not.toBeInTheDocument();
  });

  it('does NOT render a toggle for type="text"', () => {
    render(<Field label="Verification code" type="text" />);
    expect(
      screen.queryByRole('button', { name: /password/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps toggle state per-instance (two password fields toggle independently)', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Field label="Current password" type="password" />
        <Field label="New password" type="password" />
      </>,
    );
    const current = screen.getByLabelText(/current password/i) as HTMLInputElement;
    const next = screen.getByLabelText(/new password/i) as HTMLInputElement;

    // Toggle only the second field. The first should remain masked.
    const toggles = screen.getAllByRole('button', { name: /show password/i });
    expect(toggles).toHaveLength(2);
    await user.click(toggles[1]!);

    expect(current.type).toBe('password');
    expect(next.type).toBe('text');
  });
});
