'use client';

/**
 * TutorialView — iframe-rendered MATLAB Live Script + Python Notebook
 * tutorials for selected datasets.
 *
 * # Background
 *
 * Two of NDI's published datasets currently ship companion tutorials —
 * step-by-step walkthroughs of how to load + analyze the dataset using
 * NDI-MATLAB or NDI-Python:
 *
 *   - 67f723d574f5f79c6062389d (Fear-Potentiated Startle / Elevated
 *     Plus Maze, Dabrowska Lab)
 *   - 682e7772cdf3f24938176fac (C. elegans behavior + E. coli
 *     fluorescence, Chalasani Lab)
 *
 * The tutorials are pre-rendered to static HTML by MATLAB's Live Script
 * publisher (.mlx → .html) and Jupyter's nbconvert (.ipynb → .html),
 * then uploaded to a public S3 bucket
 * (`ndi-cloud-tutorials.s3.us-east-2.amazonaws.com`). The HTML files
 * are large (5.78 MB and 2.20 MB for the two MATLAB tutorials) and
 * carry inline matplotlib/MATLAB plots, so we serve them straight from
 * S3 rather than porting their assets into this Next.js app's bundle.
 *
 * # The component's job
 *
 *   1. Render a MATLAB ↔ Python language toggle (segmented control).
 *      Defaults to MATLAB; the Python option auto-disables if its file
 *      hasn't been uploaded yet (HEAD probe — Python tutorials may lag
 *      MATLAB ones).
 *   2. Render an iframe pointing at the matching S3 URL.
 *   3. Sandbox the iframe (`allow-scripts allow-same-origin allow-popups`)
 *      since the rendered tutorials use inline scripts for LaTeX
 *      rendering + the MATLAB Live Script's "copy" button. We deliberately
 *      omit `allow-top-navigation` and `allow-forms` — neither is needed
 *      and dropping them limits the trust we extend to S3 content.
 *   4. Provide download links for the source `.mlx` (MATLAB) and `.py`
 *      / `.ipynb` (Python) files alongside the HTML render — researchers
 *      who want to re-run the tutorial in their own environment.
 *
 * # Why the file gating logic lives here, not at the tab level
 *
 * The tab in `DatasetTabs.tsx` gates by dataset ID — both target
 * datasets always show the tab. Inside the tab, this component
 * dynamically detects which language tutorials are actually available
 * (by HEAD-probing each S3 URL) so the toggle reflects reality even
 * if Python tutorials are rolled out for one dataset before the other.
 * Disabled buttons keep the affordance present (signals "Python is
 * coming") rather than vanishing.
 *
 * # Reference
 *
 * Pattern adapted from `Waltham-Data-Science/ndi-web-app`'s
 * `app/src/components/datasetDetails/DatasetTutorial.tsx` (the
 * pre-unification SPA's tutorial view). The old component was
 * MATLAB-only and used MUI; this rebuild adds the language toggle,
 * uses Tailwind + the existing UI primitives, and gates the tab at
 * the tab-bar layer instead of HEAD-probing per-dataset.
 */
import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileWarning, Loader2 } from 'lucide-react';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

/**
 * S3 bucket that hosts the rendered tutorial HTML + source files.
 * Path scheme:
 *
 *   - `tutorial_<datasetId>.html`         — MATLAB (rendered Live Script)
 *   - `tutorial_<datasetId>.mlx`          — MATLAB source download
 *   - `tutorial_<datasetId>_python.html`  — Python (rendered notebook)
 *   - `tutorial_<datasetId>_python.ipynb` — Python notebook source
 *
 * Both languages share one bucket prefix; the language is encoded in
 * the filename. If the data team standardizes on a different
 * filename pattern later, change the four URL helpers below in lockstep.
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
    : `${TUTORIALS_S3_BASE}/tutorial_${datasetId}_python.ipynb`;
}

function tutorialSourceFilename(datasetId: string, lang: Lang): string {
  return lang === 'matlab'
    ? `tutorial_${datasetId}.mlx`
    : `tutorial_${datasetId}_python.ipynb`;
}

/**
 * State machine for HEAD-probe availability.
 *
 *   - `unknown`: probe in flight (or not started). Render the button
 *     in a quiet "Checking…" state so the layout is stable.
 *   - `available`: probe returned 2xx. Button is fully active.
 *   - `unavailable`: probe returned 4xx (404 most likely). Button
 *     renders with `Coming soon` tooltip + disabled state.
 *
 * The probe is best-effort — a transient network error leaves the
 * button in `unknown` rather than dropping it to `unavailable`. The
 * iframe load below is the real test; if a tutorial is genuinely
 * missing, the iframe shows the bucket's 403/404 response, which is
 * fine as a fallback while the user retries.
 */
type Availability = 'unknown' | 'available' | 'unavailable';

export function TutorialView({ datasetId }: TutorialViewProps) {
  const [lang, setLang] = useState<Lang>('matlab');
  // Default the MATLAB tutorial to `available` since the gating tab
  // wouldn't have rendered without one. Python starts `unknown` and
  // gets HEAD-probed on mount.
  const [matlabAvailable, setMatlabAvailable] = useState<Availability>(
    'available',
  );
  const [pythonAvailable, setPythonAvailable] = useState<Availability>(
    'unknown',
  );

  useEffect(() => {
    let cancelled = false;
    // Probe both languages in parallel. The MATLAB probe is mostly a
    // belt-and-suspenders: the gating tab assumes its presence, but
    // probing also surfaces "the bucket is down" cleanly via the
    // iframe-error fallback below.
    async function probe(url: string): Promise<Availability> {
      try {
        const res = await fetch(url, { method: 'HEAD', mode: 'cors' });
        return res.ok ? 'available' : 'unavailable';
      } catch {
        return 'unknown';
      }
    }
    void Promise.all([
      probe(tutorialHtmlUrl(datasetId, 'matlab')),
      probe(tutorialHtmlUrl(datasetId, 'python')),
    ]).then(([matlab, python]) => {
      if (cancelled) return;
      // Only flip MATLAB to `unavailable` on an explicit non-2xx.
      // CORS errors / network blips leave it on `available` so the
      // user can still try the iframe load.
      if (matlab === 'unavailable') setMatlabAvailable('unavailable');
      setPythonAvailable(python);
    });
    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  // If the user picks Python while we're still probing, fall back to
  // MATLAB silently — re-selecting Python after the probe finishes is
  // a one-click recovery. Without this, picking Python before the
  // probe lands shows a 403 inside the iframe.
  useEffect(() => {
    if (lang === 'python' && pythonAvailable === 'unavailable') {
      setLang('matlab');
    }
  }, [lang, pythonAvailable]);

  const htmlUrl = tutorialHtmlUrl(datasetId, lang);
  const sourceUrl = tutorialSourceUrl(datasetId, lang);
  const sourceFilename = tutorialSourceFilename(datasetId, lang);

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
        {/* MATLAB-explicit-unavailable fallback. We only show this if
            the probe was definitively non-2xx (so the iframe would
            also fail), not on transient errors. */}
        {lang === 'matlab' && matlabAvailable === 'unavailable' ? (
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
          have a published {langLabel} HTML render in the tutorials bucket.
          The source notebook may still be available — try the download
          link below.
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
