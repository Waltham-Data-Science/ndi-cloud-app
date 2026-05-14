'use client';

/**
 * PlotlyMount — minimal React 19 wrapper around Plotly.js.
 *
 * Why a custom wrapper instead of `react-plotly.js`:
 *   - The official `react-plotly.js` package's peer-dep declaration
 *     lags React releases (peer `react: >0.13.0` is misleading; the
 *     package was last published 2025-07 and tracks React internals
 *     loosely). On React 19 it works but installs need
 *     `--legacy-peer-deps` and the wrapper's class-component API
 *     fights React strict-mode double-invocation.
 *   - The actual integration surface is tiny (`Plotly.newPlot` +
 *     `Plotly.react` + `Plotly.purge` + a ResizeObserver) and easy
 *     to roll. We get full TS types via `@types/plotly.js` and forward
 *     refs cleanly for our PNG/SVG export path.
 *
 * The component is intentionally dumb: callers pass `data`, `layout`,
 * and `config`; we propagate any update via `Plotly.react()` (Plotly's
 * own diffing). No client-side state, no fetch, no chart-specific
 * logic. Wrap THIS for any specific chart family.
 *
 * Bundle posture: this file imports `plotly.js-cartesian-dist-min`
 * (~446 KB gz) directly, NOT the full Plotly. Cartesian partial
 * covers every trace type our tutorials use today (violin, box, bar,
 * histogram, scatter, heatmap, image). 3D / sankey / finance are not
 * worth the extra 950 KB.
 *
 * Consumers must dynamic-import THIS file so the Plotly bundle stays
 * out of the initial route chunk:
 *
 *     const PlotlyMount = dynamic(
 *       () => import('@/components/ndi/charts/PlotlyMount').then(m => m.PlotlyMount),
 *       { ssr: false, loading: () => <div>Loading chart…</div> },
 *     );
 */

import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';

// Side-effect: Plotly attaches to `window` on import. The cartesian
// partial bundle is ~446 KB gz; we accept that cost the first time
// any Plotly chart mounts in a page. Subsequent charts share the
// already-loaded library.
//
// `plotly.js-cartesian-dist-min` ships its own UMD entry; the typed
// export is the same shape as `plotly.js`'s default export. The
// imports below avoid pulling Plotly's strict TS imports (which try
// to resolve every trace module).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plotly.js-cartesian-dist-min has no first-party types,
// but the runtime shape is identical to plotly.js's main export.
import Plotly from 'plotly.js-cartesian-dist-min';
import type { Data, Layout, Config, PlotlyHTMLElement } from 'plotly.js';

export interface PlotlyMountHandle {
  /**
   * Imperative export to PNG. Resolves to a base64 data-URI. Useful
   * for chat-side "save to clipboard" / "copy as image" actions.
   */
  toImage: (opts?: { format?: 'png' | 'svg'; scale?: number }) => Promise<string>;
  /** The mounted DOM node (typed as Plotly's extended HTMLDivElement). */
  getNode: () => PlotlyHTMLElement | null;
}

export interface PlotlyMountProps {
  data: Data[];
  layout: Partial<Layout>;
  config?: Partial<Config>;
  /** Forwarded to the wrapper div; useful for Tailwind sizing. */
  className?: string;
  /**
   * Initial style overrides for the wrapper. Plotly insists on
   * setting `width`/`height` via `layout`; this style is for
   * outer-frame concerns (padding, border, etc.).
   */
  style?: React.CSSProperties;
  /**
   * Sensible cross-chart defaults applied UNLESS the caller already
   * set them via `config`. Toggle to opt out for charts that need
   * Plotly's full toolbar (e.g., debug surfaces).
   */
  minimalToolbar?: boolean;
}

const DEFAULT_CONFIG: Partial<Config> = {
  displaylogo: false,
  responsive: true,
  // Strip the noisy modebar buttons researchers don't need in chat:
  // lasso, autoscale, hover-toggle, etc. Keep zoom, pan, reset axes,
  // and the toImage button.
  modeBarButtonsToRemove: [
    'lasso2d',
    'select2d',
    'autoScale2d',
    'hoverClosestCartesian',
    'hoverCompareCartesian',
    'toggleSpikelines',
  ],
};

/**
 * Mount Plotly into a div. Updates propagate via `Plotly.react` which
 * does its own deep-diff — re-renders with new `data`/`layout` are
 * cheap. Cleans up via `Plotly.purge` on unmount so the chart's
 * internal listeners + WebGL contexts (if any) don't leak.
 */
export const PlotlyMount = forwardRef<PlotlyMountHandle, PlotlyMountProps>(
  function PlotlyMount(
    { data, layout, config, className, style, minimalToolbar = true },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const plotRef = useRef<PlotlyHTMLElement | null>(null);

    // Initial mount + every prop change. Plotly.react handles both
    // first-render (it falls back to newPlot internally) and updates.
    useEffect(() => {
      const node = containerRef.current;
      if (!node) return;
      const effectiveConfig: Partial<Config> = minimalToolbar
        ? { ...DEFAULT_CONFIG, ...config }
        : { ...config };
      Plotly.react(node, data, layout, effectiveConfig)
        .then((el: PlotlyHTMLElement) => {
          plotRef.current = el;
        })
        .catch((err: unknown) => {
          // Plotly throws synchronously for malformed data; surface
          // it to console rather than crashing the chat thread.
          console.warn('[PlotlyMount] react() failed:', err);
        });
    }, [data, layout, config, minimalToolbar]);

    // Resize: Plotly's `responsive: true` listens to window resize but
    // NOT element-size changes (e.g., when a chat message expands and
    // pushes the chart wider). ResizeObserver handles both.
    useEffect(() => {
      const node = containerRef.current;
      if (!node) return;
      const obs = new ResizeObserver(() => {
        const plot = plotRef.current;
        if (plot) {
          // `Plotly.Plots.resize` reads the current container size
          // and reflows. Tolerates concurrent calls.
          Plotly.Plots.resize(plot);
        }
      });
      obs.observe(node);
      return () => {
        obs.disconnect();
      };
    }, []);

    // Cleanup on unmount: drop Plotly's internal listeners + DOM.
    useEffect(() => {
      const node = containerRef.current;
      return () => {
        if (node) Plotly.purge(node);
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        toImage: async ({ format = 'png', scale = 2 } = {}) => {
          const plot = plotRef.current;
          if (!plot) throw new Error('Plotly chart not mounted yet');
          return Plotly.toImage(plot, { format, scale });
        },
        getNode: () => plotRef.current,
      }),
      [],
    );

    return <div ref={containerRef} className={className} style={style} />;
  },
);
