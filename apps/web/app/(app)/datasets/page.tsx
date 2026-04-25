/**
 * Catalog placeholder. Phase 3a converts this to a Server Component with
 * `export const revalidate = 60` for ISR, server-side prefetch via
 * INTERNAL_API_URL, and HydrationBoundary for the TanStack Query handoff.
 */
export default function DatasetsPage() {
  return (
    <main>
      <h1>Datasets</h1>
      <p>Phase 1 placeholder. Phase 3a ships the RSC + ISR catalog.</p>
    </main>
  );
}
