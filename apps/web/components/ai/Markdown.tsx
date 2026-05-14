'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { parseFootnotes, type Reference } from '@/lib/ndi/references';

import { GanttChart, type GanttChartProps } from '@/components/ndi/charts/GanttChart';
import { ImageChart, type ImageChartProps } from '@/components/ndi/charts/ImageChart';
import { IsiHistogram, type IsiHistogramProps } from '@/components/ndi/charts/IsiHistogram';
import { SpikeRaster, type SpikeRasterProps } from '@/components/ndi/charts/SpikeRaster';
import { ViolinChart, type ViolinChartProps } from '@/components/ndi/charts/ViolinChart';

import { CitationChip } from './CitationChip';
import { SignalChart, type SignalChartProps } from '@/components/ndi/charts/SignalChart';
import { SourcesPanel } from './SourcesPanel';

/**
 * Markdown renderer for assistant messages.
 *
 * Why react-markdown over a custom parser: handles GFM (tables,
 * strikethrough, footnotes), code blocks, and link safety out of the
 * box. Disabling raw HTML (default) prevents the model from injecting
 * `<script>` even if a prompt-injection coaxed it.
 *
 * # Citations (Day 1 of the scientific-depth plan)
 *
 * The LLM is instructed to write `[^N]` footnote references inline
 * with claims and to define them at the bottom under "### Sources".
 * remark-gfm parses these natively. We customize two pieces:
 *
 *   - The `<sup><a data-footnote-ref>N</a></sup>` markup → rendered
 *     as a `CitationChip` that opens the *referenced URL directly*
 *     (rather than scrolling to the in-page anchor that remark-gfm
 *     emits by default)
 *   - The remark-gfm-generated `<section data-footnotes>` block →
 *     suppressed; replaced by our `SourcesPanel` which we render
 *     after the main markdown content using a pre-parsed references
 *     map.
 *
 * Pre-parsing is done once per render via `useMemo` on the raw
 * content string. The same parsed map is consumed by both the inline
 * chip lookup and the bottom panel — single source of truth.
 *
 * Internal-link rewriting (for non-citation links): `/datasets/...`
 * paths use next/link for client-side nav; external URLs use
 * `<a target="_blank">`.
 */
type Props = {
  content: string;
  /**
   * The full deduplicated reference set produced by every tool call
   * on this message. Merged with the LLM's `[^N]: ...` footnote
   * definitions into the SourcesPanel so granular per-group sample
   * references are always visible, EVEN IF the LLM chose not to
   * footnote them in prose.
   *
   * Reference matching across the two sources is keyed on URL — a
   * tool reference whose URL matches an LLM-defined footnote URL
   * dedupes to a single chip (the LLM's definition wins because it
   * carries position info for inline-chip rendering).
   */
  toolReferences?: Reference[];
};

export function Markdown({ content, toolReferences }: Props) {
  // Parse footnote definitions ONCE per content change. Same map fed
  // to both the inline chip lookup and the bottom SourcesPanel.
  const footnoteMap = useMemo(() => parseFootnotes(content), [content]);

  // Strip the body of the "### Sources" / footnote-defs section before
  // handing to react-markdown — otherwise remark-gfm renders a second
  // copy below our SourcesPanel. We keep the inline [^N] references
  // intact (those still get rendered as `<sup>` markers, which we
  // override below).
  const bodyContent = useMemo(() => stripSourcesSection(content), [content]);

  // Granular-completeness merge: LLM's `### Sources` definitions
  // (positional + cited in prose) PLUS the full reference set the
  // tools produced (some of which the LLM may have chosen not to
  // footnote). Dedupe by URL — LLM-defined entries win when both
  // sources reference the same URL because they carry the LLM's
  // chosen title/snippet which may be context-aware. Tool-only
  // references append after, in tool-emission order, so the user
  // always sees every chip the tools produced.
  const referencesList: Reference[] = useMemo(() => {
    const fromFootnotes = [...footnoteMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, ref]) => ref);
    if (!toolReferences || toolReferences.length === 0) {
      return fromFootnotes;
    }
    const seen = new Set<string>(fromFootnotes.map((r) => r.url));
    const extras = toolReferences.filter((r) => !seen.has(r.url));
    return [...fromFootnotes, ...extras];
  }, [footnoteMap, toolReferences]);

  return (
    <>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...rest }) => {
            const url = href ?? '';
            // Detect footnote-ref anchors: remark-gfm emits
            // `#user-content-fn-N` for [^N] markers. We grab N and
            // render a CitationChip linked to the referenced URL.
            const footnoteRefMatch = url.match(/^#user-content-fn-(\d+)$/);
            if (footnoteRefMatch) {
              const n = Number.parseInt(footnoteRefMatch[1]!, 10);
              const ref = footnoteMap.get(n);
              if (ref) {
                return <CitationChip number={n} reference={ref} />;
              }
              // Fallback — footnote ref points to a missing definition.
              // Render as a small grey chip without a link.
              return (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 mx-0.5 align-middle text-[10px] font-semibold rounded-md bg-gray-100 text-gray-400">
                  {n}
                </span>
              );
            }
            const isInternal = url.startsWith('/') && !url.startsWith('//');
            if (isInternal) {
              return (
                <Link href={url} className="text-brand-blue underline hover:text-brand-blue-2">
                  {children}
                </Link>
              );
            }
            return (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-blue underline hover:text-brand-blue-2"
                {...rest}
              >
                {children}
              </a>
            );
          },
          // Suppress remark-gfm's auto-generated footnote section. The
          // LLM wrote its own "### Sources" header which we stripped
          // above; we render the canonical SourcesPanel ourselves.
          section: ({ children, ...rest }) => {
            // react-markdown passes data attributes via `node` in v9.
            // The footnote section gets `data-footnotes` on the <section>.
            const props = rest as { 'data-footnotes'?: unknown };
            if (props['data-footnotes'] !== undefined) return null;
            return <section {...rest}>{children}</section>;
          },
          p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="my-2 list-disc pl-5 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal pl-5 space-y-1">{children}</ol>,
          code: ({ children, className }) => {
            // Day 4: detect the ```signal-chart fence the LLM emits
            // after a fetch_signal tool call. Mount SignalChart in
            // place of the code block. The fence body is a JSON blob
            // — invalid JSON falls through to the default code style.
            //
            // react-markdown passes the fence language as
            // `className="language-signal-chart"` on the inner <code>
            // tag, which `pre` would normally wrap. We intercept here
            // (inside <code>) so the wrapping <pre> is replaced
            // entirely — see the matching `pre` renderer below which
            // unwraps a signal-chart payload up to the parent.
            if (className === 'language-signal-chart' && typeof children === 'string') {
              const props = parseSignalChartPayload(children);
              if (props) return <SignalChart {...props} />;
            }
            // Phase B: same pattern for the violin-chart fence emitted
            // after a tabular_query tool call.
            if (className === 'language-violin-chart' && typeof children === 'string') {
              const props = parseViolinChartPayload(children);
              if (props) return <ViolinChart {...props} />;
            }
            // Phase C+: additional chart fences for the labchat scope-up.
            if (className === 'language-gantt-chart' && typeof children === 'string') {
              const props = parseGanttChartPayload(children);
              if (props) return <GanttChart {...props} />;
            }
            if (className === 'language-image-chart' && typeof children === 'string') {
              const props = parseImageChartPayload(children);
              if (props) return <ImageChart {...props} />;
            }
            if (className === 'language-spike-raster' && typeof children === 'string') {
              const props = parseSpikeRasterPayload(children);
              if (props) return <SpikeRaster {...props} />;
            }
            if (className === 'language-isi-histogram' && typeof children === 'string') {
              const props = parseIsiHistogramPayload(children);
              if (props) return <IsiHistogram {...props} />;
            }
            return (
              <code className="px-1 py-0.5 rounded bg-gray-100 text-[0.92em] font-mono">
                {children}
              </code>
            );
          },
          pre: ({ children }) => {
            // If the <pre> wraps a chart fence, the inner <code>
            // renderer above has already produced the chart element —
            // but it sits inside this <pre>. Unwrap by detecting the
            // chart child and returning it bare so the chart isn't
            // stuck inside a <pre> tag (which clips its overflow and
            // squeezes the figure's caption).
            //
            // react's children for <pre> from a fenced code block is
            // always a single <code> element node; we inspect its
            // props.className to decide.
            const onlyChild =
              childIsSignalChart(children) ??
              childIsViolinChart(children) ??
              childIsGanttChart(children) ??
              childIsImageChart(children) ??
              childIsSpikeRaster(children) ??
              childIsIsiHistogram(children);
            if (onlyChild) return onlyChild;
            return (
              <pre className="my-2 p-3 rounded-md bg-gray-50 border border-gray-200 overflow-x-auto text-[0.92em]">
                {children}
              </pre>
            );
          },
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          // Suppress h3 specifically when it's the model's "### Sources"
          // header — our SourcesPanel renders its own heading. We do
          // this conservatively: only the exact text "Sources" gets
          // dropped, so the model can still use h3 for other section
          // titles.
          h3: ({ children }) => {
            if (typeof children === 'string' && children.trim() === 'Sources') {
              return null;
            }
            if (
              Array.isArray(children) &&
              children.length === 1 &&
              typeof children[0] === 'string' &&
              children[0].trim() === 'Sources'
            ) {
              return null;
            }
            return <h3 className="mt-3 mb-1 text-[15px] font-semibold">{children}</h3>;
          },
        }}
      >
        {bodyContent}
      </ReactMarkdown>
      <SourcesPanel references={referencesList} />
    </>
  );
}

/**
 * Parse the JSON body of a ```signal-chart fenced code block into
 * the props SignalChart needs. Returns null on malformed input so
 * the caller can fall through to the default code-block style — a
 * mistyped fence by the model shouldn't crash the message.
 */
function parseSignalChartPayload(raw: string): SignalChartProps | null {
  try {
    const obj = JSON.parse(raw.trim()) as Partial<SignalChartProps>;
    if (
      typeof obj.datasetId !== 'string' ||
      obj.datasetId.length === 0 ||
      typeof obj.docId !== 'string' ||
      obj.docId.length === 0
    ) {
      return null;
    }
    return obj as SignalChartProps;
  } catch {
    return null;
  }
}

/**
 * Detect when react-markdown's <pre> wraps a child that's already
 * been rendered as SignalChart by our custom code renderer. Returns
 * the SignalChart element when it's the only child, otherwise null.
 *
 * We can't import the SignalChart symbol and compare via React types
 * because react-markdown's renderer wraps everything in opaque
 * fragments, but `displayName` set on SignalChart gives us a stable
 * identity test.
 */
function childIsSignalChart(children: React.ReactNode): React.ReactNode | null {
  // SignalChart routes multi-channel + colorbar payloads through
  // MultiTraceChart internally (see SignalChart's ChartBody). When
  // that happens, react-markdown's <pre> wrap contains a
  // MultiTraceChart element rather than a SignalChart one — so we
  // also detect that case, otherwise the multi-trace + colorbar
  // legend gets clipped inside the <pre> overflow box.
  return (
    childIsChartComponent(children, 'SignalChart') ??
    childIsChartComponent(children, 'MultiTraceChart')
  );
}

/**
 * Parse a ```violin-chart JSON payload into ViolinChart props.
 * Mirrors `parseSignalChartPayload`'s defensive shape — returns null
 * on any malformed input so the fence falls back to default code
 * styling instead of crashing the message.
 */
function parseViolinChartPayload(raw: string): ViolinChartProps | null {
  try {
    const obj = JSON.parse(raw.trim()) as Partial<ViolinChartProps>;
    if (
      typeof obj.datasetId !== 'string' ||
      obj.datasetId.length === 0 ||
      typeof obj.variableNameContains !== 'string' ||
      obj.variableNameContains.length === 0
    ) {
      return null;
    }
    return obj as ViolinChartProps;
  } catch {
    return null;
  }
}

function childIsViolinChart(children: React.ReactNode): React.ReactNode | null {
  return childIsChartComponent(children, 'ViolinChart');
}

/**
 * Parse a ```gantt-chart JSON payload into GanttChart props.
 * Same defensive shape as the other parsers — null on malformed input.
 */
function parseGanttChartPayload(raw: string): GanttChartProps | null {
  try {
    const obj = JSON.parse(raw.trim()) as Partial<GanttChartProps>;
    if (
      typeof obj.datasetId !== 'string' ||
      obj.datasetId.length === 0 ||
      !Array.isArray(obj.items)
    ) {
      return null;
    }
    return obj as GanttChartProps;
  } catch {
    return null;
  }
}

function childIsGanttChart(children: React.ReactNode): React.ReactNode | null {
  return childIsChartComponent(children, 'GanttChart');
}

/**
 * Parse a ```image-chart JSON payload into ImageChart props.
 */
function parseImageChartPayload(raw: string): ImageChartProps | null {
  try {
    const obj = JSON.parse(raw.trim()) as Partial<ImageChartProps>;
    if (
      typeof obj.datasetId !== 'string' ||
      obj.datasetId.length === 0 ||
      typeof obj.docId !== 'string' ||
      obj.docId.length === 0
    ) {
      return null;
    }
    return obj as ImageChartProps;
  } catch {
    return null;
  }
}

function childIsImageChart(children: React.ReactNode): React.ReactNode | null {
  return childIsChartComponent(children, 'ImageChart');
}

/**
 * Parse a ```spike-raster JSON payload into SpikeRaster props.
 * Requires a non-empty `units` array — the rest of the props are
 * optional.
 */
function parseSpikeRasterPayload(raw: string): SpikeRasterProps | null {
  try {
    const obj = JSON.parse(raw.trim()) as Partial<SpikeRasterProps>;
    if (!Array.isArray(obj.units) || obj.units.length === 0) return null;
    return obj as SpikeRasterProps;
  } catch {
    return null;
  }
}

function childIsSpikeRaster(children: React.ReactNode): React.ReactNode | null {
  return childIsChartComponent(children, 'SpikeRaster');
}

/**
 * Parse an ```isi-histogram JSON payload into IsiHistogram props.
 * Accepts either raw intervals (length ≥ 1) or pre-binned bins+counts
 * (bins.length === counts.length + 1). Returns null when neither
 * shape is present.
 */
function parseIsiHistogramPayload(raw: string): IsiHistogramProps | null {
  try {
    const obj = JSON.parse(raw.trim()) as Partial<IsiHistogramProps>;
    const hasIntervals =
      Array.isArray(obj.intervals) && obj.intervals.length > 0;
    const hasBins =
      Array.isArray(obj.bins) &&
      Array.isArray(obj.counts) &&
      obj.bins.length === (obj.counts as number[]).length + 1;
    if (!hasIntervals && !hasBins) return null;
    return obj as IsiHistogramProps;
  } catch {
    return null;
  }
}

function childIsIsiHistogram(children: React.ReactNode): React.ReactNode | null {
  return childIsChartComponent(children, 'IsiHistogram');
}

/**
 * Shared chart-child detector. The chart components set explicit
 * `displayName` for robustness across minification, but we also
 * fall back to `.name` for non-minified dev builds.
 */
function childIsChartComponent(
  children: React.ReactNode,
  componentName: string,
): React.ReactNode | null {
  const node = children as React.ReactElement<{ children?: React.ReactNode }> | undefined;
  if (!node || typeof node !== 'object') return null;
  if (typeof (node as { type?: unknown }).type === 'function') {
    const fn = (node as { type: { displayName?: string; name?: string } }).type;
    if (fn.displayName === componentName || fn.name === componentName) {
      return node;
    }
  }
  return null;
}

/**
 * Strip the "### Sources" / footnote-definition block from the message
 * body so react-markdown doesn't render a duplicate alongside our
 * SourcesPanel. We keep inline [^N] markers intact (those live in the
 * narrative text above the Sources section).
 *
 * The strip targets the canonical shape the LLM is taught to emit:
 *
 *   ...narrative text [^1]...
 *
 *   ### Sources
 *   [^1]: [Title](url) — class
 *   [^2]: [Title](url) — class
 *
 * Everything from "### Sources" header onward is removed. The
 * footnote definitions are gone from the body, so remark-gfm has
 * nothing to feed into its auto-section.
 */
function stripSourcesSection(content: string): string {
  // Find a line that is just "### Sources" (allow trailing whitespace).
  const lines = content.split('\n');
  let cutoff = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^###\s+Sources\s*$/.test(lines[i]!)) {
      cutoff = i;
      break;
    }
  }
  if (cutoff === -1) return content;
  return lines.slice(0, cutoff).join('\n').trimEnd();
}
