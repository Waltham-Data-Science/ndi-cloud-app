import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

import { Providers } from './providers';
import './globals.css';

/**
 * Root metadata. Phase 2a populates per-page metadata via per-route
 * generateMetadata exports; this is the site-wide default + template.
 */
export const metadata: Metadata = {
  metadataBase: new URL('https://ndi-cloud.com'),
  title: {
    default: 'NDI Cloud',
    template: '%s · NDI Cloud',
  },
  description:
    'Neuroscience Data Infrastructure Cloud — the unified platform for neuroscience datasets, queries, and lab tooling.',
  applicationName: 'NDI Cloud',
  authors: [{ name: 'Waltham Data Science' }],
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased">
        {/*
          Skip-to-content link — WCAG 2.4.1 (Bypass Blocks). First focusable
          element on every page. Visually hidden until focused via keyboard,
          at which point it pins to the top-center of the viewport with a
          dark navy background + white text. Targets `#main-content` (the
          `<main>` anchor inside both `(marketing)` and `(app)` route group
          layouts). Ported from ndi-web-app-wds/_app.tsx + globals.scss.
         */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-0 focus:left-1/2 focus:-translate-x-1/2 focus:z-[9999] focus:px-6 focus:py-3 focus:bg-brand-navy focus:text-white focus:font-semibold focus:text-sm focus:rounded-b-md focus:no-underline focus:shadow-lg"
        >
          Skip to main content
        </a>
        <Providers>{children}</Providers>
        {/*
          Analytics + Speed Insights — Phase 5. Free on Vercel Pro.
          - <Analytics /> captures Core Web Vitals from real users so we
            can verify Lighthouse scores generalize.
          - <SpeedInsights /> emits per-route latency metrics — useful
            for catching cache-warm vs cache-miss render variance once
            the catalog is ISR-served.
          Both are no-ops outside Vercel (the components self-detect
          environment), so dev + Playwright runs aren't affected.
         */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
