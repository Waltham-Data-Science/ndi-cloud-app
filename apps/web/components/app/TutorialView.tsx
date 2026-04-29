'use client';

/**
 * TutorialView — iframe-rendered MATLAB Live Script + Python Notebook
 * tutorials for any dataset whose tutorial files exist in the public
 * tutorials S3 bucket.
 *
 * # Background
 *
 * NDI's published tutorials are step-by-step walkthroughs of how to
 * load + analyze a dataset using NDI-MATLAB or NDI-Python. Each is
 * pre-rendered to static HTML — MATLAB's Live Script publisher
 * (.mlx → .html) and Jupyter's nbconvert (.ipynb → .html) — then
 * uploaded to a public S3 bucket
 * (`ndi-cloud-tutorials.s3.us-east-2.amazonaws.com`). The HTML files
 * are large (5.78 MB and 2.20 MB for the two known MATLAB tutorials)
 * and carry inline matplotlib/MATLAB plots, so we serve them straight
 * from S3 rather than porting their assets into this Next.js app's
 * bundle.
 *
 * # Discovery model
 *
 * PR #130 hardcoded a two-dataset allowlist. Subsequent PR (this one)
 * replaces that with `useTutorialAvailability` — a HEAD probe against
 * the bucket. Any dataset the data team uploads a `tutorial_<id>.mlx`
 * or `tutorial_<id>.ipynb` for now lights up here automatically. The
 * tab in `DatasetTabs.tsx` consumes the same hook (cached per dataset
 * id) so a single probe covers both surfaces.
 *
 * # The component's job
 *
 *   1. Render a MATLAB ↔ Python language toggle (segmented control).
 *      Each language pill is enabled iff that file's HEAD probe
 *      returned 200; the other is disabled with a "Coming soon"
 *      affordance.
 *   2. Render an iframe pointing at the matching S3 URL.
 *   3. Sandbox the iframe (`allow-scripts allow-same-origin allow-popups`)
 *      since the rendered tutorials use inline scripts for LaTeX
 *      rendering + the MATLAB Live Script's "copy" button. We deliberately
 *      omit `allow-top-navigation` and `allow-forms` — neither is needed
 *      and dropping them limits the trust we extend to S3 content.
 *   4. Provide download links for the source `.mlx` (MATLAB) and
 *      `.ipynb` (Python) files alongside the HTML render — researchers
 *      who want to re-run the tutorial in their own environment.
 *   5. If both probes return 404 (no tutorial files exist for this
 *      dataset), render a soft empty state. This branch is mostly
 *      defensive: the tab gate in `DatasetTabs` already hides the
 *      Tutorials tab when both probes are 404, but a direct typed-URL
 *      navigation to `/datasets/[id]/tutorials` still lands here.
 *
 * # Reference
 *
 * Pattern adapted from `Waltham-Data-Science/ndi-web-app`'s
 * `app/src/components/datasetDetails/DatasetTutorial.tsx` (the
 * pre-unification SPA's tutorial view). The legacy component HEAD-
 * probed for the same `.mlx` file too — this PR brings the new site
 * in line with that auto-detection model.
 */
import { useState } from 'react';
import { Download, ExternalLink, FileWarning, Loader2 } from 'lucide-react';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { useTutorialAvailability } from '@/lib/data/tutorials';

/**
 * S3 bucket that hosts the rendered tutorial HTML + source files.
 * Path scheme (aligned with the legacy NDI Cloud app's HEAD-probe
 * targets):
 *
 *   - `tutorial_<datasetId>.html`   — MATLAB (rendered Live Script)
 *   - `tutorial_<datasetId>.mlx`    — MATLAB source download
 *   - `tutorial_<datasetId>_python.html` — Python (rendered notebook)
 *   - `tutorial_<datasetId>.ipynb`  — Python notebook source
 *
 * The `.mlx` / `.ipynb` pair is what `useTutorialAvailability` probes
 * (see `lib/data/tutorials.ts`); the `.html` pair is what the iframe
 * loads. The data team's upload convention pairs the two — when a
 * dataset gets a `.mlx` it also gets the matching `.html` render —
 * so probing the source file is sufficient to gate the iframe.
 *
 * If the data team standardizes on a different filename pattern
 * later, change the URL helpers in this file plus the probe URLs
 * in `lib/data/tutorials.ts` in lockstep.
 */
const TUTORIALS_S3_BASE =
  'https://ndi-cloud-tutorials.s3.us-east-2.amazonaws.com';

type Lang = 'matlab' | 'python';

interface TutorialViewProps {
  datasetId: string;
}

/**
 * URL helpers — keep all S3 path construction in one place so a future
 * filename-scheme change is a single-file edit. Each helper is a pure
 * function over the dataset id + language flag.
 */
function tutorialHtmlUrl(datasetId: string, lang: Lang): string {
  return lang === 'matlab'
    ? `${TUTORIALS_S3_BASE}/tutorial_${datasetId}.html`
    : `${TUTORIALS_S3_BASE}/tutorial_${datasetId}_python.html`;
}

function tutorialSourceUrl(datasetId: string, lang: Lang): string {
  return lang === 'matlab'
    ? `${TUTORIALS_S3_BASE}/tutorial_${datasetId}.mlx`
    : `${TUTORIALS_S3_BASE}/tutorial_${datasetId}.ipynb`;
}

function tutorialSourceFilename(datasetId: string, lang: Lang): string {
  return lang === 'matlab'
    ? `tutorial_${datasetId}.mlx`
    : `tutorial_${datasetId}.ipynb`;
}

/**
 * State machine for the language pills' visual state. Derived from the
 * shared `useTutorialAvailability` hook:
 *
 *   - `unknown`: probe in flight. Render the pill in a quiet
 *     "Checking…" state so the layout is stable.
 *   - `available`: probe returned 2xx. Pill is fully active.
 *   - `unavailable`: probe returned non-2xx or threw. Pill renders
 *     disabled with a "Coming soon" tooltip.
 */
type Availability = 'unknown' | 'available' | 'unavailable';

export function TutorialView({ datasetId }: TutorialViewProps) {
  // Single shared probe — same hook the tab gate uses, so the request
  // is fired once per dataset id and cached for 5 minutes.
  const { data: availability, isPending } = useTutorialAvailability(datasetId);

  // While the query is in flight we show "Checking…" on both pills
  // and default the iframe to MATLAB. Once it resolves we know which
  // languages exist and can disable the missing one(s).
  const matlabAvailable: Availability = isPending
    ? 'unknown'
    : availability?.hasMatlab
      ? 'available'
      : 'unavailable';
  const pythonAvailable: Availability = isPending
    ? 'unknown'
    : availability?.hasPython
      ? 'available'
      : 'unavailable';

  // `requestedLang` is the user's pick; `lang` (computed below) folds
  // in the availability state so an unavailable Python pick silently
  // falls back to MATLAB without firing a setState in an effect (which
  // React 19's strict `react-hooks/set-state-in-effect` rule rejects).
  // Default to MATLAB unless only Python exists — favors the more
  // common format when both ship.
  const [requestedLang, setLang] = useState<Lang>('matlab');

  // Derived state: if the user picked an unavailable language, fall
  // back to whichever exists. Same pattern as the previous in-component
  // probe — keeps `requestedLang` stable so a later re-toggle once
  // both formats land is a single click.
  const lang: Lang = (() => {
    if (requestedLang === 'matlab' && matlabAvailable === 'unavailable') {
      return pythonAvailable === 'available' ? 'python' : 'matlab';
    }
    if (requestedLang === 'python' && pythonAvailable === 'unavailable') {
      return 'matlab';
    }
    return requestedLang;
  })();

  // Both formats explicitly missing — soft empty state. Probe
  // resolved (`!isPending`) and neither file exists. Mostly a
  // defensive branch: `DatasetTabs` hides the tab in this case, but
  // a direct typed-URL nav lands here.
  const noTutorialsExist =
    !isPending && availability && !availability.hasAny;

  const htmlUrl = tutorialHtmlUrl(datasetId, lang);
  const sourceUrl = tutorialSourceUrl(datasetId, lang);
  const sourceFilename = tutorialSourceFilename(datasetId, lang);

  if (noTutorialsExist) {
    return <NoTutorialEmptyState datasetId={datasetId} />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle as="h2" className="text-base">
            Tutorial
          </CardTitle>
          <p className="mt-1 text-xs text-fg-muted">
            Pre-rendered walkthrough of this dataset. Switch between MATLAB
            and Python; download the source to run it locally.
          </p>
        </div>

        {/* Language toggle + downloads. The toggle is a radio-group
            (segmented control) so screen readers announce the
            "MATLAB selected, Python tab" relationship correctly. */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Tutorial language"
            className="inline-flex rounded-md border border-border-subtle bg-bg-surface p-0.5"
          >
            <LangPill
              value="matlab"
              active={lang === 'matlab'}
              available={matlabAvailable}
              onSelect={() => setLang('matlab')}
              label="MATLAB"
            />
            <LangPill
              value="python"
              active={lang === 'python'}
              available={pythonAvailable}
              onSelect={() => setLang('python')}
              label="Python"
            />
          </div>
          {/* Source download — anchor with `download` so the browser
              saves the file rather than navigating to it. The anchor
              key is the filename (changes per language) so React
              swaps the element when the language flips, instead of
              leaving an old href on a re-rendered button. Anchors
              styled to match the `Button` primitive's `secondary` /
              `ghost` shape (Button itself doesn't accept polymorphic
              `as` so we inline the classes here). */}
          <a
            key={sourceFilename}
            href={sourceUrl}
            download={sourceFilename}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all bg-bg-surface text-brand-navy ring-1 ring-border-strong hover:bg-bg-muted no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ndi-teal"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download {lang === 'matlab' ? '.mlx' : '.ipynb'}
          </a>
          <a
            href={htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all bg-transparent text-fg-secondary hover:bg-bg-muted hover:text-brand-navy no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ndi-teal"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Open in new tab
          </a>
        </div>
      </CardHeader>

      <CardBody className="pt-0">
        {/* Per-language unavailable fallback. Renders only if the
            current pick's probe was definitively non-2xx (so the
            iframe would also fail). Both pills point at downloads
            for the OTHER language, since at least one exists when
            we render here (the both-missing case short-circuits to
            `NoTutorialEmptyState` above). */}
        {(lang === 'matlab' && matlabAvailable === 'unavailable') ||
        (lang === 'python' && pythonAvailable === 'unavailable') ? (
          <UnavailableNotice
            lang={lang}
            datasetId={datasetId}
            sourceUrl={sourceUrl}
            sourceFilename={sourceFilename}
          />
        ) : (
          // Iframe key changes on language flip so React tears down
          // and remounts cleanly — keeps the load spinner on the new
          // resource rather than waiting for the old one to swap in
          // place. Sandbox limits S3-served scripts to the document
          // surface (no top-nav, no form posts). `loading="lazy"`
          // defers the heavy 5MB load until the user actually scrolls
          // the iframe into view (in case we ever embed multiple
          // tutorials on one page).
          <iframe
            key={htmlUrl}
            src={htmlUrl}
            title={`Dataset ${datasetId} ${lang === 'matlab' ? 'MATLAB' : 'Python'} tutorial`}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-popups"
            className="block h-[800px] w-full rounded-md border border-border-subtle bg-bg-surface"
          />
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Single button inside the language radio-group. Renders three
 * visual states:
 *
 *   - active: solid teal background, white text
 *   - inactive + available: clickable, hover affords
 *   - inactive + unavailable: disabled with "Coming soon" tooltip
 *   - inactive + unknown: shows a loader so the user knows the probe
 *     is in flight and Python may light up shortly
 */
function LangPill({
  value,
  active,
  available,
  onSelect,
  label,
}: {
  value: Lang;
  active: boolean;
  available: Availability;
  onSelect: () => void;
  label: string;
}) {
  const disabled = available === 'unavailable';
  const probing = available === 'unknown';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) onSelect();
      }}
      title={
        disabled
          ? `${label} tutorial coming soon — file not yet available`
          : undefined
      }
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-3 py-1 text-xs font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ndi-teal',
        active
          ? 'bg-ndi-teal text-white shadow-xs'
          : disabled
            ? 'text-fg-muted/60 cursor-not-allowed'
            : 'text-fg-secondary hover:text-brand-navy hover:bg-bg-muted',
      )}
      data-lang={value}
    >
      {label}
      {probing && (
        <Loader2
          className="h-3 w-3 animate-spin opacity-60"
          aria-label="Checking availability"
        />
      )}
      {disabled && (
        <span className="ml-1 text-[9px] uppercase tracking-wide text-fg-muted/70">
          soon
        </span>
      )}
    </button>
  );
}

function UnavailableNotice({
  lang,
  datasetId,
  sourceUrl,
  sourceFilename,
}: {
  lang: Lang;
  datasetId: string;
  sourceUrl: string;
  sourceFilename: string;
}) {
  const langLabel = lang === 'matlab' ? 'MATLAB' : 'Python';
  return (
    <div className="flex items-start gap-3 rounded-md border border-border-subtle bg-bg-muted/60 px-4 py-3.5 text-sm text-fg-secondary">
      <FileWarning
        className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted"
        aria-hidden
      />
      <div className="space-y-1.5">
        <p className="m-0 text-fg-primary font-medium">
          {langLabel} tutorial isn&rsquo;t up yet for this dataset.
        </p>
        <p className="m-0 text-xs text-fg-muted">
          Dataset id <span className="font-mono">{datasetId}</span> doesn&rsquo;t
          have a published {langLabel} tutorial in the tutorials bucket.
          Switch to the other language pill above, or try downloading the
          source file directly.
        </p>
        <div className="pt-1">
          <a
            href={sourceUrl}
            download={sourceFilename}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-ndi-teal hover:text-ndi-primary transition-colors no-underline"
          >
            <Download className="h-3 w-3" aria-hidden />
            Download {sourceFilename}
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Soft empty state when both MATLAB and Python tutorials are missing
 * for this dataset. Shown as a Card-shaped notice (instead of a 404)
 * because the dataset itself is real — the tutorial just hasn't been
 * authored yet. The DatasetTabs gate also hides the Tutorials tab in
 * this case, so users mostly hit this via direct typed-URL navigation.
 *
 * Symmetric with the in-page `NoTutorialState` in
 * `app/(app)/datasets/[id]/tutorials/page.tsx`. Keeping the empty
 * state's copy here lets the page component delegate to TutorialView
 * unconditionally — the page no longer knows the per-dataset
 * availability synchronously.
 */
function NoTutorialEmptyState({ datasetId }: { datasetId: string }) {
  return (
    <Card>
      <CardBody>
        <h2 className="text-base font-bold text-fg-primary mb-2 m-0">
          No tutorial for this dataset
        </h2>
        <p className="text-sm text-fg-secondary mb-3 m-0">
          Tutorials are authored per-dataset and uploaded to the public
          tutorials bucket. This dataset doesn&rsquo;t have a MATLAB
          (`.mlx`) or Python (`.ipynb`) walkthrough yet.
        </p>
        <p className="text-xs text-fg-muted m-0">
          Try the Overview tab for a synthesized summary, or the Document
          Explorer to browse the dataset&rsquo;s structured records.
        </p>
        <p className="text-[10.5px] text-fg-muted/70 mt-4 font-mono m-0">
          dataset id: {datasetId}
        </p>
      </CardBody>
    </Card>
  );
}
