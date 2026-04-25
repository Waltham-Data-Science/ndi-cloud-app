/**
 * Dataset detail layout — Phase 3a placeholder.
 *
 * Phase 3b builds out the hero (dataset name, byline, citation) and
 * the from-scratch a11y tab bar (audit #65) here. The tab bar uses
 * roving tabindex + ArrowLeft/Right/Home/End keyboard handling, with
 * URL-routed tabs (overview / tables / pivot / documents) rather than
 * state-controlled — that's the structural fix that #65 required.
 *
 * For Phase 3a we just pass children through so `/datasets/[id]/overview`
 * renders standalone. Document detail (`/datasets/[id]/documents/[docId]`)
 * will opt out via its own nested layout in Phase 3b that drops the tab
 * bar (matches the data-browser's "outside the Outlet" pattern).
 */
export default function DatasetDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
