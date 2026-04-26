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
  /*
   * Match the navy nav bar so the OS chrome (mobile Chrome + Safari status
   * bar) tints with the brand instead of the UA-default white/grey.
   * Source `_document.tsx` carried `<meta name="theme-color" content="#002054">`;
   * the Next.js Viewport API is the canonical way to emit it from the App
   * Router.
   */
  themeColor: '#002054',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased">
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
