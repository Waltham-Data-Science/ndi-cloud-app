import { Footer } from '@/components/marketing/Footer';
import { Header } from '@/components/marketing/Header';

/**
 * Marketing route group layout. Wraps all `(marketing)/*` pages with the
 * sticky glass-morphic Header (links + auth CTAs) and the dark four-column
 * Footer. Both are pure presentation; the auth-aware bits in Header read
 * `useSession()` (Phase 2a stub returns `null`; Phase 2b/3a wires real
 * session state).
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {/* `id="main-content"` is the skip-to-content anchor wired in
          `app/layout.tsx` — WCAG 2.4.1 (Bypass Blocks). */}
      <main id="main-content" className="min-h-[calc(100vh-160px)]">
        {children}
      </main>
      <Footer />
    </>
  );
}
