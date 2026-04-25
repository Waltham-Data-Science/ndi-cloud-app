/**
 * Lightweight Tailwind-only button primitive for marketing surfaces.
 *
 * Replaces MUI's `<Button>` everywhere on the marketing route group
 * (`app/(marketing)/`). MUI is kept for `<Menu>` / `<IconButton>` in the
 * responsive nav where its a11y lift is genuine, but `<Button>` adds
 * ~7KB gz for what is structurally a styled `<button>` — not worth the
 * bundle weight on every marketing page.
 *
 * Three variants matching the source SCSS classes:
 * - `cta`     — solid teal button with shadow (primary action; "Create
 *               Free Account", "Get started", hero CTA)
 * - `ghost`   — transparent with white border (secondary action on dark
 *               backgrounds; "Log in", "Learn more")
 * - `outline` — transparent with NDI-teal border (secondary action on
 *               light backgrounds)
 *
 * Renders as `<button>` by default; use `as="a"` for anchor semantics
 * (e.g., the hero CTA links into the data browser).
 */
'use client';

import { clsx } from 'clsx';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'cta' | 'ghost' | 'outline';
type Size = 'sm' | 'md';

type CommonProps = {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
};

type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & {
    as?: 'button';
  };

type AnchorProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps> & {
    as: 'a';
    href: string;
  };

export type MarketingButtonProps = ButtonProps | AnchorProps;

const baseClasses =
  'inline-flex items-center justify-center font-semibold whitespace-nowrap rounded-pill ' +
  'transition-all duration-(--duration-base) ease-(--ease-out) ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ndi-teal ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const variantClasses: Record<Variant, string> = {
  cta: 'bg-ndi-teal text-white shadow-cta hover:-translate-y-px hover:shadow-[0_6px_22px_rgba(15,110,86,0.35)]',
  ghost:
    'bg-transparent text-white/85 border border-white/20 hover:bg-white/8 hover:text-white',
  outline:
    'bg-transparent text-ndi-teal border border-ndi-teal hover:bg-ndi-teal-light',
};

const sizeClasses: Record<Size, string> = {
  sm: 'text-[13px] px-4 py-1.5',
  md: 'text-[14px] px-5 py-2',
};

export function MarketingButton(props: MarketingButtonProps) {
  const { variant = 'cta', size = 'sm', children, className } = props;
  const classes = clsx(baseClasses, variantClasses[variant], sizeClasses[size], className);

  if (props.as === 'a') {
    const { as: _as, variant: _v, size: _s, children: _c, className: _cn, ...rest } = props;
    return (
      <a className={classes} {...rest}>
        {children}
      </a>
    );
  }

  const {
    as: _as,
    variant: _v,
    size: _s,
    children: _c,
    className: _cn,
    type = 'button',
    ...rest
  } = props;
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
