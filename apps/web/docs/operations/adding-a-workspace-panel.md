# Adding a workspace panel — checklist

**Audience:** contributors adding a new panel to `/my/workspace/[id]/...`.

**Status:** living doc — update when the panel pattern evolves.

The workspace exposes one panel per scientific question (DatasetStructure,
BehavioralCompare, TreatmentTimeline, SignalViewer, PSTH, SpikeActivity,
ElectrodePosition). Each panel ports a chat tool's `chart_payload`
contract into a dataset-scoped UI.

This doc lists every step required to add an 8th panel cleanly. Follow
it in order; each step has a verification cue.

---

## 0. Decide if you actually need a new panel

A new panel makes sense when:
- There's a chat tool that returns a `chart_payload` users want to
  drive interactively (rather than chat-mediated).
- The chart shape is meaningfully different from existing panels.
- The panel will be referenced from the panel-nav strip.

A new panel does NOT make sense when:
- The chart can be parameterized off an existing panel (e.g. a
  variation of TreatmentTimeline).
- The chart is one-off (a single dataset's special case).
- The chart is better served by the chat tool itself.

If unsure, write a spec at `apps/web/docs/specs/<date>-<panel-name>-design.md`
first and run it past audri before implementing.

---

## 1. Add the tool handler in `lib/ndi/tools/` (if it doesn't exist)

Per ADR-002, every panel's data comes from a tool handler in
`apps/web/lib/ndi/tools/<tool-name>.ts`. If the chat already has the
tool, you can skip this step.

If the tool needs auth (most workspace panels do — they may touch
private datasets), accept the optional `ctx?: ToolContext` parameter
per ADR-003. See `apps/web/docs/operations/three-surfaces.md` for the
contract.

**Verification:** unit tests for the handler at
`apps/web/tests/unit/ai/tools/<tool-name>.test.ts` exercise both
ctx-present and ctx-absent invocation paths.

---

## 2. Add the workspace wrapper route at `app/api/datasets/[id]/<tool>/route.ts`

The wrapper route forwards auth from the inbound request to the handler:

```typescript
// app/api/datasets/[id]/<tool>/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  someToolHandler,
  someToolInput,
} from '@/lib/ndi/tools/some-tool';
import { authHeadersFromRequest } from '@/lib/ndi/tools/shared';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: datasetId } = await params;
  const body = await req.json();
  const parsed = someToolInput.safeParse({ ...body, datasetId });
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Invalid input: ${parsed.error.message}` },
      { status: 400 },
    );
  }
  const authHeaders = authHeadersFromRequest(req);
  const result = await someToolHandler(parsed.data, { authHeaders });
  if ('error' in result) {
    return NextResponse.json(result, { status: 502 });
  }
  return NextResponse.json(result);
}
```

**Verification:** the chat's anonymous path still works (the handler's
ctx-undefined branch); the workspace path forwards auth correctly.

---

## 3. Add the panel component at `apps/web/components/workspace/<PanelName>Panel.tsx`

Match the existing pattern:

- **Component name:** `<PanelName>Panel` (PascalCase, ends `Panel`).
- **Props:** `datasetId: string` minimum; any panel-specific controls
  as additional props.
- **Data fetching:** TanStack Query against the wrapper route.
  Use `apiFetch<T>()` (the cookie + CSRF wrapper) — no raw `fetch()`.
- **Chart rendering:** import the existing chart component if one
  exists (e.g. `<SignalChart>`, `<GanttChart>`, `<ViolinPlot>`); else
  create a new one under `apps/web/components/workspace/charts/`.
- **Empty / loading / error states:** all three required. Look at
  `BehavioralComparePanel.tsx` for the canonical pattern.
- **Chrome:** wrap in `<PanelCard>` (matches the consistent panel chrome
  + a11y heading levels). Stream 4.4 normalizes the panels that still
  use bespoke chrome.

**Verification:**
- Renders with synthetic data in a Storybook-style smoke (or under
  `__tests__/`).
- Empty state renders when handler returns `empty_hint`.
- Error state renders when handler returns `{ error }`.
- A11y: heading level matches the panel grid's heading hierarchy
  (the panel grid is `<h2>`; panel title is `<h3>`).

---

## 4. Wire the panel into `workspace-client.tsx`

`apps/web/app/(app)/my/workspace/[id]/workspace-client.tsx` renders the
panel grid. Add the new panel under the `<div key={datasetId}>` wrapper
(the key forces remount on dataset change so individual panels don't
need their own reset logic).

Add the panel's nav entry to the side strip (if it has one) and the
top-level grid.

**Verification:** switching between datasets in the navigator does NOT
leave stale state in the new panel.

---

## 5. Add the panel-specific styles

Tailwind utility classes only — no SCSS modules. Match the spacing /
shadow / radius tokens used by sibling panels.

If the panel needs a chart that respects `prefers-reduced-motion`,
gate animations on the `motion-safe:` variant.

**Verification:** the panel renders consistently with siblings at
1440px, 1024px (tablet), and 768px (narrow). Check with the responsive
preview Playwright spec.

---

## 6. Test coverage

Add these tests:
- `apps/web/tests/unit/components/workspace/<PanelName>Panel.test.tsx`
  — at minimum: renders, handles empty state, handles error state.
- `apps/web/tests/unit/ai/tools/<tool-name>.test.ts` if not already
  present from step 1.
- (Optional, Stream 6 catch-up) Playwright E2E at
  `apps/web/tests/e2e/workspace-<panel>.spec.ts`.

**Verification:** `pnpm test` passes. Coverage thresholds still met.

---

## 7. Update CLAUDE.md + docs

- Add the panel to the "Current draft branch in flight" section of
  `CLAUDE.md` (top-level under "Migration status").
- If the panel introduces new chart-fence shapes (e.g. a new tag like
  `network-graph` alongside `signal-chart` / `gantt-chart`), document
  the fence in the system prompt and add a markdown chart-fence
  dispatcher test (Stream 6.1).
- Update `apps/web/docs/specs/2026-05-15-master-execution-plan.md` if
  this panel was a deferred line item — flip it from pending to
  completed.

**Verification:** `git grep` for the new tool name surfaces every
relevant doc.

---

## 8. Smoke before push

Local smokes:
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — clean.
- `pnpm dev` — open `/my/workspace/<known-dataset-id>` in a browser,
  click into the new panel, verify it loads, switches datasets, and
  handles missing data gracefully.

Preview smoke (after push):
- Vercel preview URL deploys.
- Log in (test creds in `apps/web/docs/specs/2026-05-15-master-execution-plan.md`).
- Repeat the local smoke against the preview.

---

## Update history

| Date | Change |
|---|---|
| 2026-05-15 | Extracted from `apps/web/docs/specs/2026-05-14-pre-compact-handoff-v2.md` per Stream 4.6. |
