/**
 * Document detail opt-out layout.
 *
 * Document detail is a drill-down on a single document, NOT a tab
 * on the dataset. The nested layout returns `{children}` straight
 * through, drops the parent `[id]/layout.tsx`'s hero + tab bar (those
 * would be visually misleading on a document-detail surface — there's
 * no "Overview" of the document, just its own detail panes).
 *
 * Matches the data-browser's "outside the Outlet" pattern:
 * `/datasets/:id/documents/:docId` rendered its own hero band and
 * sat outside the dataset shell's `<Outlet>`.
 *
 * Layouts in Next App Router NEST. To opt out of an ancestor layout,
 * we'd need a route group or a flat (`/document/...`) URL — the
 * compromise here: this layout contributes nothing visual; the
 * document-detail page itself owns its hero + back-nav. The dataset
 * layout's hero + tab bar still render above (acceptable: the
 * back-nav from the doc detail page returns to `/datasets/[id]/documents`
 * which is the correct visual "where" anchor). A future refactor
 * could use a parallel route or an intercepting route to fully drop
 * the parent chrome on this specific path.
 */
export default function DocumentDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
