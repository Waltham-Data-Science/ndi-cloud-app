/**
 * Tests for the marketing <MarketingButton /> primitive.
 *
 * Three variants × two element types (button vs anchor) × two sizes is
 * the surface area; tests cover each variant once and assert: variant
 * Tailwind class is present, default `type="button"` (prevents the
 * accidental form-submit footgun on a button placed inside a wrapping
 * <form>), anchor mode swaps element + carries href, click handlers fire.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MarketingButton } from '@/components/marketing/Button';

describe('MarketingButton', () => {
  it('renders as a <button> by default with type="button"', () => {
    render(<MarketingButton>Save</MarketingButton>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn.tagName).toBe('BUTTON');
    // Default type prevents accidental form-submit when nested in a <form>.
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('renders the cta variant with the teal background class', () => {
    render(<MarketingButton variant="cta">Get started</MarketingButton>);
    const btn = screen.getByRole('button', { name: 'Get started' });
    expect(btn.className).toContain('bg-ndi-teal');
    expect(btn.className).toContain('shadow-cta');
  });

  it('renders the ghost variant with transparent + white-border classes', () => {
    render(<MarketingButton variant="ghost">Log in</MarketingButton>);
    const btn = screen.getByRole('button', { name: 'Log in' });
    expect(btn.className).toContain('bg-transparent');
    expect(btn.className).toContain('border-white/20');
  });

  it('renders the outline variant for use on light backgrounds', () => {
    render(<MarketingButton variant="outline">Learn more</MarketingButton>);
    const btn = screen.getByRole('button', { name: 'Learn more' });
    expect(btn.className).toContain('border-ndi-teal');
    expect(btn.className).toContain('text-ndi-teal');
  });

  it('renders as an <a> when as="a" is passed and carries the href', () => {
    render(
      <MarketingButton as="a" href="/datasets" variant="cta">
        Browse the catalog
      </MarketingButton>,
    );
    const link = screen.getByRole('link', { name: 'Browse the catalog' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/datasets');
    expect(link.className).toContain('bg-ndi-teal');
  });

  it('forwards click handlers on button elements', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<MarketingButton onClick={onClick}>Click me</MarketingButton>);
    await user.click(screen.getByRole('button', { name: 'Click me' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('respects the disabled attribute', () => {
    render(<MarketingButton disabled>Disabled</MarketingButton>);
    const btn = screen.getByRole('button', { name: 'Disabled' });
    expect(btn).toBeDisabled();
    expect(btn.className).toContain('disabled:opacity-50');
  });

  it('applies the sm size by default and md when overridden', () => {
    const { rerender } = render(<MarketingButton>Default</MarketingButton>);
    expect(screen.getByRole('button', { name: 'Default' }).className).toContain('text-[13px]');

    rerender(<MarketingButton size="md">Larger</MarketingButton>);
    expect(screen.getByRole('button', { name: 'Larger' }).className).toContain('text-[14px]');
  });

  it('merges user-supplied className alongside variant classes', () => {
    render(
      <MarketingButton variant="cta" className="self-end my-4">
        Hero CTA
      </MarketingButton>,
    );
    const btn = screen.getByRole('button', { name: 'Hero CTA' });
    expect(btn.className).toContain('bg-ndi-teal');
    expect(btn.className).toContain('self-end');
    expect(btn.className).toContain('my-4');
  });
});
