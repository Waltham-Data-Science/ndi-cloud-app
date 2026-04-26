/**
 * Error boundary Sentry-capture tests (Phase 6.7 A8).
 *
 * Both `app/(app)/error.tsx` and `app/(marketing)/error.tsx` lazily
 * initialize Sentry at module-load (so the SDK stays out of the
 * initial bundle) and call `Sentry.captureException` from the
 * useEffect when an error is rendered. These tests pin that
 * contract: refactors that drop the captureException call won't
 * silently break error tracking.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const captureExceptionMock = vi.fn();
const initMock = vi.fn();
const isInitializedMock = vi.fn(() => false);

vi.mock('@sentry/nextjs', () => ({
  init: initMock,
  isInitialized: isInitializedMock,
  captureException: captureExceptionMock,
}));

afterEach(() => {
  captureExceptionMock.mockClear();
  initMock.mockClear();
  isInitializedMock.mockClear();
});

describe('app/(app)/error.tsx', () => {
  it('calls Sentry.captureException with tags + digest context when rendered', async () => {
    const { default: AppError } = await import('@/app/(app)/error');
    const reset = vi.fn();
    const error = Object.assign(new Error('boom'), { digest: 'digest-app' });

    render(<AppError error={error} reset={reset} />);

    expect(captureExceptionMock).toHaveBeenCalledWith(error, {
      tags: { source: 'app/error.tsx' },
      contexts: { nextjs: { digest: 'digest-app' } },
    });
  });

  it('still renders the friendly fallback UI', async () => {
    const { default: AppError } = await import('@/app/(app)/error');
    const reset = vi.fn();
    const error = new Error('boom');

    render(<AppError error={error} reset={reset} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'We couldn’t load this view.',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('app/(marketing)/error.tsx', () => {
  it('calls Sentry.captureException with tags + digest context when rendered', async () => {
    const { default: MarketingError } = await import('@/app/(marketing)/error');
    const reset = vi.fn();
    const error = Object.assign(new Error('marketing-boom'), {
      digest: 'digest-mkt',
    });

    render(<MarketingError error={error} reset={reset} />);

    expect(captureExceptionMock).toHaveBeenCalledWith(error, {
      tags: { source: 'marketing/error.tsx' },
      contexts: { nextjs: { digest: 'digest-mkt' } },
    });
  });

  it('still renders the friendly fallback UI', async () => {
    const { default: MarketingError } = await import('@/app/(marketing)/error');
    const reset = vi.fn();
    const error = new Error('marketing-boom');

    render(<MarketingError error={error} reset={reset} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'We hit an error rendering this page.',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
