/**
 * `cn` — class-name composer.
 *
 * `clsx` handles falsy values + objects (`{ foo: true, bar: false }` →
 * `'foo'`); `tailwind-merge` resolves Tailwind utility conflicts so the
 * latest declaration wins (`cn('p-2', 'p-4')` → `'p-4'`).
 *
 * Ported from data-browser's `frontend/src/lib/cn.ts`. Keep the import
 * surface stable: `components/ui/*` and any consumer in `components/app/*`
 * relies on this helper. Marketing pages haven't needed it (Tailwind utility
 * lists in marketing are short and conflict-free), but it's the same module
 * for both groups so they don't drift.
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
