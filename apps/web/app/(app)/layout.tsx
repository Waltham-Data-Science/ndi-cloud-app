import { Footer } from '@/components/marketing/Footer';
import { Header } from '@/components/marketing/Header';

/**
 * App route group layout. Phase 3a centralizes the chrome here so the
 * catalog (`/datasets`), dataset detail (`/datasets/[id]/*`), `/my`,
 * and `/my-account` all share the same auth-aware Header + Footer.
 *
 * Mirrors the marketing layout's shape — single `<main>` anchor in the
 * layout, pages render their own content as fragments / divs. The only
 * delta from marketing is conceptual: this group's pages may be
 * authenticated. Phase 5 wires Edge Middleware that 302s
 * unauthenticated requests on `/my*` paths to `/login?returnTo=...`
 * before HTML even ships, but server-side that's transparent to this
 * layout.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
