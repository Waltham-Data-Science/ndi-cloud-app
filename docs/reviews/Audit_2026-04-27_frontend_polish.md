# Frontend polish audit — 2026-04-27

**Auditor:** Claude (autonomous Playwright walkthrough)
**Frontend SHA:** `b948e58` (PR #92 — progressive document loading)
**Backend SHA:** `4a7c5c3` (PR #103 — differential cache TTL)
**Open at audit time:** PR #104 (record-fallback gating, not yet merged)

## Scope

Visual / interaction polish only. Out of scope: perf workarounds (#91, #92, #103, #104), hygiene items, auth/session behavior. Audit covered:

- `/`, `/datasets`, `/datasets/[id]/{overview,tables,documents,pivot}`
- `/login`, `/create-account`, `/forgot-password`, `/my` (anonymous)
- 404 + bad-id error states
- Viewport widths: 380 / 768 / 1280 / 1440 px
- Tab order, screen-reader landmarks, focus rings, skip links
- Form labels, autocomplete, password show/hide
- Loading-state coherence (catalog → detail navigation timing)

## Method

Headless Playwright, real production at `ndi-cloud-app-web.vercel.app`. Each page captured at multiple viewport widths; tab order enumerated via DOM query; navigation timing measured as `link.click() → URL change → h1 paint → summary card data` deltas; form attrs (autocomplete, required, label association, aria-*) inspected programmatically.

NB: Playwright's headless render is sometimes tighter than real Chrome (user verified during audit). Width-marginal truncations were validated against multiple viewport widths before being flagged.

---

## Findings

Each finding has **Visibility** (how often hit) and **Effort** (1-line CSS → component refactor).

### 🔴 P0 — Hits everyone, low-medium effort

#### 1. Catalog → detail click waits 5s before URL changes
- **Visibility**: every dataset open. **Effort**: small (one-file).
- Measured `link.click() → URL change` = **5,015 ms** at 1280px. Hero h1 paints at +21ms after URL change. The 5s is the layout RSC fetch waiting on `await Promise.race([prefetchAll, deadline])` (PREFETCH_GROUP_DEADLINE_MS = 3s) + RSC stream latency.
- User experience: clicked card looks "frozen", may click again, then page suddenly switches.
- **Fix vector**: add `app/(app)/datasets/[id]/loading.tsx` — Next.js renders this instantly while RSC streams. Optionally drop `prefetchAll` race to 0–500ms (record-fetch is already fast; slow ones never made it into the dehydrated state anyway).

#### 2. Counts cells show "0" for sessions/probes/elements/epochs when stage-1 timed out
- **Visibility**: every cold-cache visit to a large dataset (101k+ docs). **Effort**: small.
- On Jess Haley I see Sessions=0, Probes=0, Elements=0, Epochs=0 with a "1 warning" footer — but those zeros are wrong (we don't know the count). Should render `—` (em-dash, "unknown") not `0`. The summary card's existing biology section already does this distinction; counts grid doesn't.
- **Fix vector**: in `DatasetSummaryCard` countsSection, render `—` when extractionWarnings includes `class counts query failed` AND value is exactly `0`. (Or make `displaySummary` mark unknown-counts with a sentinel and have the card render it.)

#### 3. "1 warning" tooltip is the only hint that data is degraded
- **Visibility**: every degraded summary (most large datasets right now). **Effort**: small.
- The pill is tiny + footer-only. A user looking at 0 sessions/probes won't connect it to the warning button. The "1 warning" is informational triage data only.
- **Fix vector**: when warnings present, the affected fields should render a subtle "degraded" affordance inline (small `?`/info icon next to the count, or italicized "—") and the warning copy should be friendlier ("Cloud query timed out — partial data" not the raw message).

#### 4. Summary card "Strains: Not applicable" / "Sex: Not applicable" on a C. elegans dataset
- **Visibility**: every dataset where `subjects_present` is true but `openminds_subject` ndiquery didn't succeed. **Effort**: depends on backend (#104 covers this).
- "Not applicable" reads like "this dataset doesn't have strains" — wrong for C. elegans. The semantic distinction `[]` vs `null` from the schema doesn't translate to user copy.
- **Fix vector**: when warnings indicate stage-2 didn't fully run, show `—` (queried) not "Not applicable" (didn't query). PR #104 (record-fallback gating) lets stage 2 actually run; UX-side should also rework the null-vs-empty copy.

#### 5. Dataset detail tab bar omits Pivot tab even when route is reachable
- **Visibility**: anyone with a deeplink to `/datasets/[id]/pivot/[grain]` (e.g. v2 bookmarks, share links). **Effort**: small.
- `/pivot/subject` route renders but the tab bar doesn't show "Pivot" — instead "Summary tables" highlights as active. The Per subject/session/element sub-nav appears under Summary tables visually.
- **Fix vector**: either restore the Pivot tab (gated on a feature-presence probe) OR make the Pivot route render its OWN tab in the bar with explicit `aria-current="page"` so the cross-wiring goes away.

#### 6. "Failed to load treatment table." error message is alarming + non-actionable
- **Visibility**: every empty-class table tab (Treatments on most datasets, Probe locations, OpenMINDS subjects, Combined). **Effort**: small.
- Big red text. "Something went wrong. We've been notified." reads like a server crash. In reality the dataset just doesn't have treatment docs — this is an **empty state, not an error**.
- **Fix vector**: distinguish 404/empty (`No treatment rows in this dataset.`) from 500/timeout (`Couldn't load this table — retry?`). The `useSummaryTable` returns the 404 in `error`; check status in the renderer.

### 🟠 P1 — Hits often, small-medium effort

#### 7. `/forgot-password` heading says "Reset your password"
- **Visibility**: anyone who clicked "Forgot password?". **Effort**: 1-line copy fix.
- URL says "forgot-password" (you forgot it, send me a code). Heading says "Reset your password" (do the reset action). The reset action happens AFTER you receive the code on the next page. Confusing.
- **Fix vector**: heading → "Forgot your password?" with subtitle "Enter your email and we'll send a reset code."

#### 8. `/forgot-password` layout breaks the auth-page split-pane pattern
- **Visibility**: same. **Effort**: small.
- `/login` and `/create-account` use the welcome-marketing left + form right split. `/forgot-password` is a single centered card. Inconsistent.
- **Fix vector**: align to the split-pane shell with a tighter copy on the left ("Forgot? Happens to everyone.").

#### 9. 404 page has no top nav
- **Visibility**: any 404 (legacy URL, typo, deleted dataset). **Effort**: 1-line layout fix.
- The marketing header is missing on 404 — user can only get out via the in-page action buttons or footer.
- **Fix vector**: ensure `app/not-found.tsx` is rendered inside the marketing layout, not standalone.

#### 10. Bad-id dataset page renders the chrome as if dataset existed
- **Visibility**: legacy deeplinks, typoed IDs. **Effort**: small.
- The bare ID (e.g. `nonexistent123`) shows as h1 in the hero, with full tab bar underneath, plus an inline error in the body. Suggests the dataset exists.
- **Fix vector**: when `useDataset` returns a 400/404, swap the route's render to a focused not-found state ("That dataset isn't here. ←Browse all"). Use the same not-found layout as the catch-all.

#### 11. Pivot disabled state exposes server env var name
- **Visibility**: pivot deeplinks. **Effort**: 1-line copy fix.
- "This feature is disabled on the current deployment. Set FEATURE_PIVOT_V1=true to enable." — internal-config in user copy.
- **Fix vector**: rewrite to "Pivot view is in development. Check back soon." Keep the env var note as a `data-debug` attribute or developer-only banner.

#### 12. Login page after `/my` redirect doesn't say WHY user is here
- **Visibility**: any anonymous user clicking a `/my*` link. **Effort**: 1-line conditional copy.
- The login form is identical to the directly-accessed login. No "Log in to view your workspace" banner.
- **Fix vector**: read `?returnTo=` query param on the login page; if set, show a small banner above the form with destination context.

#### 13. Native `<select>` for catalog Sort is jarring
- **Visibility**: every catalog visitor. **Effort**: small (existing `<Select>` UI primitive can replace).
- The Sort dropdown uses default browser `<select>` styling. Every other dropdown in the app uses the styled component. Sticks out.
- **Fix vector**: swap `<select>` for the project's `<Select>` (or shadcn-equivalent) primitive.

#### 14. Create-account "Already have an account? Log in. ·" — trailing dot+separator
- **Visibility**: every visitor to /create-account. **Effort**: 1-line cleanup.
- "Log in. ·" with a separator and nothing after. Looks like there were once more links there.
- **Fix vector**: remove the trailing `·` or move "Forgot password?" inline.

### 🟡 P2 — Polish, small effort

#### 15. Filter sidebar precedes results in tab order
- **Visibility**: keyboard users on /datasets. **Effort**: small (rearrange or add skip-link).
- Tab through the catalog: ~30 filter checkboxes BEFORE you reach the first dataset card. Not a screen-reader blocker (results are in a separate landmark), but slow.
- **Fix vector**: add a "Skip to results" link that appears on tab focus from the filter sidebar — same pattern as the existing "Skip to main content" link.

#### 16. Card hover affordance is subtle — looks unclickable
- **Visibility**: every catalog visitor. **Effort**: 1-line CSS.
- The card hover has `group-hover:-translate-y-[1px] group-hover:shadow-md` but no cursor: pointer override on the inner card content. The `<a>` provides it but on slow paint it's not always present.
- **Fix vector**: add `cursor-pointer` to the `Link` className OR a slightly stronger hover ring. Combined with #1's `loading.tsx`, click feedback becomes visceral.

#### 17. Document Explorer narrow-width: filter sidebar stacks above results
- **Visibility**: mobile/narrow viewports. **Effort**: small (CSS reorder OR collapsible).
- At 380px, "Document classes" Card renders FIRST, full-height, before the document table. User has to scroll past the entire class-counts list (which on a 100-class dataset can be a screen) before seeing any document. The dataset filter sidebar on /datasets uses a "Show filters" collapse for this; the Document Explorer doesn't.
- **Fix vector**: same collapse pattern at narrow widths.

#### 18. Hero pill grid uses different fields per dataset (looks ragged)
- **Visibility**: every dataset detail visitor. **Effort**: medium (decide intended layout).
- Reikersdorfer hero shows Documents + Size only. Jess Haley hero shows Species/Region/Documents/Subjects/Size/License. Sophie Griswold hero shows Species/Region/Documents/Size/License (no Subjects because record has none).
- The "stat pills row" reflows to 2 cols when there are fewer fields and looks asymmetric. The Reikersdorfer 2-pill row sits awkwardly aligned-left while wider datasets stretch to full width.
- **Fix vector**: pick a fixed grid (e.g. 6-cell, hide-on-empty) and align consistently — or center-justify the pill row when fewer than 4 fields.

#### 19. License badge missing on Reikersdorfer dataset hero
- **Visibility**: any dataset where `license` is empty on the cloud record. **Effort**: depends on intent.
- Hero only shows "● PUBLISHED" + "ORIGINAL" (branchName) — no license badge. Other datasets show "PUBLISHED CC-BY-4.0 main".
- **Fix vector**: when no license, show a quiet "Licensing: ask author" pill or similar. Currently looks like an oversight, not a deliberate empty-state.

#### 20. Provenance card silent-load means user never knows it could've been there
- **Visibility**: most datasets (most have no provenance edges). **Effort**: small.
- This is by design (PR #91), but for datasets that DO have provenance and the request is still in flight, the slot stays empty until data arrives. No skeleton, no "loading derivation graph…" hint.
- **Fix vector**: render a minimal skeleton ONLY for the first 500ms — a quick "we're checking provenance" beat — then go silent. Or: don't add anything; this is a deliberate tradeoff.

### ⚪ P3 — Console hygiene + small a11y polish

#### 21. `/253372a1cd09db9a/script.js` 404 on every page
- **Visibility**: every page (CSP/console error). **Effort**: investigate + small.
- A script with random-looking path 404s on every page load. Looks like a Vercel preview comments injection or a stale analytics snippet. Browser blocks it (MIME mismatch); no functional impact but pollutes console.
- **Fix vector**: identify the source (Vercel feedback widget? leftover analytics?) and remove or correct.

#### 22. `/favicon.ico` 404
- **Visibility**: every visitor. **Effort**: 1-line file add.
- We have an SVG icon presumably linked via `<link rel="icon" type="image/svg+xml">`, but browsers also hit `/favicon.ico` as a fallback. Add a real file or a 204 route.

#### 23. Citation block on detail page has identifiers `Org 649b1b...` styled as monospace ID
- **Visibility**: every dataset detail. **Effort**: 1-line — show org *name* not ID, or hide.
- Reikersdorfer detail shows `Org 649b1b1bea20f31db68d4f9f` as a monospace metadata row. Mongo ObjectId — meaningless to users.
- **Fix vector**: hide unless we have an org name to show, or resolve the ID to the org name via a separate cloud call.

#### 24. Inputs lack `aria-describedby` linkage to error/help text
- **Visibility**: form users (small absolute count). **Effort**: small per-form.
- Login/signup/forgot all have form-level `noValidate` + JS validation. When errors render, the input's screen-reader announcement won't include the error message because there's no `aria-describedby` linkage.
- **Fix vector**: when error renders, set `aria-describedby` + `aria-invalid` on the input.

---

## Suggested PR batching (ordered by user-visible impact)

| Batch | Items | Estimated effort |
|---|---|---|
| **A** — perceived nav speed | #1 (loading.tsx) + #16 (cursor) | 1 PR, small |
| **B** — degraded-data UX | #2 #3 #4 (em-dash + tooltip + null-vs-empty copy) | 1 PR, small |
| **C** — error/empty state polish | #6 #10 #11 (table empty/error, bad-id, pivot copy) | 1 PR, small |
| **D** — auth flow polish | #7 #8 #12 #14 (forgot copy + layout, login banner, signup trailing) | 1 PR, small |
| **E** — nav consistency | #5 #9 #13 (Pivot tab, 404 chrome, Sort select) | 1 PR, small-medium |
| **F** — narrow-width polish | #17 #18 #15 (doc-explorer collapse, hero pill grid, skip-to-results) | 1 PR, medium |
| **G** — console + a11y hygiene | #21 #22 #23 #24 | 1 PR, small |

Each batch is independent of the perf fixes (#91/#92/#103/#104). None touch auth/session, hygiene, or perf workarounds.

## Verified working (no findings)

- Page titles are properly per-route + branded (e.g. `Premature vision drives… · NDI Cloud`)
- "Dataset:" prefix correctly stripped from titles + headings (PR #85)
- Header Docs icon stays on one line (PR #90 verified live)
- Login form: `autocomplete=email` + `current-password`, `required`, labels associated
- Signup form: `autocomplete=name/email/new-password`, password requirements help text, show/hide toggle
- Skip-to-main link is the first focusable element on every page
- Catalog narrow-width: "Show filters" toggle hides the sidebar correctly
- `?returnTo=` query param IS honored after login redirect (#12 is about UX, not function)
- Dataset detail row clicks navigate to document detail in 54ms (PR #88)
- Progressive document loading verified live: 50 rows immediately, 100 by t+10s, "X of 78,688 · loading more…" indicator (PR #92)
- Summary card fallback live: Jess Haley shows 1,656 subjects + 78,687 docs + species + brain regions despite backend counts timeout (PR #91)
