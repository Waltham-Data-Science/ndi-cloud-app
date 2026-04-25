/**
 * AuthSplitLayout — marketing-side + form-side rendering contract.
 *
 * Pure presentation component (no client behavior); test asserts the
 * structural contract that login + create-account ports rely on:
 *   - marketing eyebrow + title + subtitle + features render
 *   - the form-side `children` render in their own region
 *   - the marketing panel uses the depth-gradient background (style
 *     attribute, since the bg is a CSS custom property and Tailwind
 *     can't emit it as a utility class without a token alias)
 *
 * If anyone refactors AuthSplitLayout in a way that drops one of the
 * marketing slots or accidentally puts the form on the gradient, these
 * tests fail. Existing login.test.tsx + (future) create-account.test
 * cover the form behavior end-to-end through the layout.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AuthSplitLayout } from '@/components/marketing/AuthSplitLayout';

describe('AuthSplitLayout', () => {
  it('renders the marketing-side eyebrow + title + subtitle + features', () => {
    render(
      <AuthSplitLayout
        marketingEyebrow="WELCOME TEXT"
        marketingTitle={
          <>
            Welcome <em>back</em>
          </>
        }
        marketingSubtitle="Subtitle copy."
        marketingFeatures={[
          'Feature one',
          'Feature two',
          'Feature three',
        ]}
      >
        <div data-testid="form-side">form here</div>
      </AuthSplitLayout>,
    );

    expect(screen.getByText('WELCOME TEXT')).toBeInTheDocument();
    // Title contains "Welcome" + an <em> wrapping "back". RTL queries on
    // text fragments hit the parent <h2> when the content is split
    // across an inline tag, so query the role for clarity.
    const title = screen.getByRole('heading', { level: 2 });
    expect(title).toHaveTextContent('Welcome back');
    const accentEm = title.querySelector('em');
    expect(accentEm).not.toBeNull();
    expect(accentEm).toHaveTextContent('back');

    expect(screen.getByText('Subtitle copy.')).toBeInTheDocument();
    expect(screen.getByText('Feature one')).toBeInTheDocument();
    expect(screen.getByText('Feature two')).toBeInTheDocument();
    expect(screen.getByText('Feature three')).toBeInTheDocument();
  });

  it('renders the form-side children', () => {
    render(
      <AuthSplitLayout
        marketingEyebrow="EYE"
        marketingTitle="Title"
        marketingSubtitle="Sub"
        marketingFeatures={['One']}
      >
        <h1>Log in</h1>
        <input aria-label="email" />
      </AuthSplitLayout>,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Log in',
    );
    expect(screen.getByLabelText('email')).toBeInTheDocument();
  });

  it('applies the depth-gradient background to the marketing panel', () => {
    const { container } = render(
      <AuthSplitLayout
        marketingEyebrow="EYE"
        marketingTitle="Title"
        marketingSubtitle="Sub"
        marketingFeatures={['One']}
      >
        <span data-testid="form-side">child</span>
      </AuthSplitLayout>,
    );

    // First <section> is the marketing panel — it carries the
    // var(--grad-depth) inline style.
    const sections = container.querySelectorAll('section');
    expect(sections).toHaveLength(2);
    const marketingPanel = sections[0]!;
    expect(marketingPanel).toHaveAttribute(
      'style',
      expect.stringContaining('var(--grad-depth)'),
    );
    // The form-side child must NOT be inside the gradient panel.
    expect(marketingPanel.querySelector('[data-testid="form-side"]')).toBeNull();
  });

  it('handles ReactNode features (e.g., emails / inline tags)', () => {
    render(
      <AuthSplitLayout
        marketingEyebrow="EYE"
        marketingTitle="Title"
        marketingSubtitle="Sub"
        marketingFeatures={[
          <>
            RRID:SCR_023368 &mdash; cite NDI in your methods
          </>,
        ]}
      >
        <span>form</span>
      </AuthSplitLayout>,
    );

    expect(
      screen.getByText(/RRID:SCR_023368 — cite NDI in your methods/i),
    ).toBeInTheDocument();
  });
});
