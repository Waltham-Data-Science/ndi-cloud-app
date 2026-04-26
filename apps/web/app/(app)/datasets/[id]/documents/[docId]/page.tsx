/**
 * `/datasets/[id]/documents/[docId]` — single-document detail.
 *
 * Renders the ported `DocumentDetailPage` (per-class field rendering +
 * binary blob viewer + dependency graph + appears-elsewhere panel) via
 * `<DocumentDetailShell>` (Phase 6.6 REBUILD-8). The dataset hero + tab
 * bar render above (per the parent layout) — but the inline `<style>`
 * below hides them on initial paint to prevent the chrome-gate
 * hydration flash flagged by the audit (synthesis §R2).
 *
 * R2 mitigation pattern:
 *   1. The parent layout's `DatasetDetailChromeGate` (a client
 *      component) wraps its rendered hero+tabs in
 *      `<div data-dataset-chrome>` and the section wrapper in
 *      `<section data-dataset-chrome-section>`.
 *   2. On SSR, the chrome-gate can't run `usePathname()`, so it
 *      renders the chrome by default — visible on initial paint.
 *   3. This page injects an inline `<style>` tag that targets the
 *      `data-` attributes, hiding the chrome and stripping the
 *      section's max-width / padding. The browser parses the style
 *      before painting, so the chrome never flashes.
 *   4. Post-hydration, `usePathname()` resolves, the chrome-gate
 *      re-renders without those elements, and the inline style
 *      becomes a no-op.
 *
 * A "proper" structural fix (intercepting routes / route group split)
 * is heavier and out of scope for the audit — the inline-style fix is
 * the minimum-effort path the audit explicitly recommended.
 */
import type { Metadata } from 'next';

import { DocumentDetailShell } from './document-detail-shell';

interface PageProps {
  params: Promise<{ id: string; docId: string }>;
}

// Per-page title; root layout's template wraps to "Document · NDI Cloud".
export const metadata: Metadata = {
  title: 'Document',
};

export default async function DocumentDetailPage({ params }: PageProps) {
  const { id, docId } = await params;
  return (
    <>
      {/* R2: hide chrome before paint to suppress the hydration flash.
          The chrome elements unmount post-hydration; this style stops
          the brief visible flicker on slower machines (Salk's older
          lab laptops in particular). */}
      <style
        // dangerouslySetInnerHTML is required because raw `{...}` in a
        // <style> child node would be interpreted as React text nodes
        // and risk being escaped. Inline pre-paint style block is the
        // canonical pattern for SSR-time CSS injection.
        dangerouslySetInnerHTML={{
          __html: `
            [data-dataset-chrome] { display: none !important; }
            [data-dataset-chrome-section] {
              max-width: none !important;
              padding: 0 !important;
              margin: 0 !important;
            }
          `,
        }}
      />
      <DocumentDetailShell datasetId={id} docId={docId} />
    </>
  );
}
