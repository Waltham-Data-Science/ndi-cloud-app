import type { PlotType } from './inferPlotShape';

export interface PythonSnippetArgs {
  plotType: PlotType;
  datasetId: string;
  className: string;
  yField: string;
  xField: string;
}

/**
 * Generates a runnable matplotlib snippet that reproduces the current
 * Quick Plot view in Python. The snippet is the explicit hand-off from
 * the in-page triage tool to publication territory: scientists run it
 * locally to add titles, annotations, custom color schemes, statistical
 * overlays, log axes — all the things Quick Plot deliberately omits.
 *
 * Each plot type has its own template body (histogram / violin / box /
 * scatter / line / bar-count), but they share a common preamble that
 * loads the table from the cloud API and a permalink comment that
 * points back to this exact view in the cloud app.
 *
 * Column names are Python-escaped: double quotes and backslashes are
 * preserved verbatim so the generated string still references the right
 * column when the user pastes it into a runtime.
 */
export function formatPythonSnippet(args: PythonSnippetArgs): string {
  const { plotType, datasetId, className, yField, xField } = args;
  const y = pyString(yField);
  const x = pyString(xField);
  const permalink = `https://ndi-cloud.com/datasets/${datasetId}?class=${className}`;

  const preamble = [
    `"""Quick Plot — ${plotType}`,
    `Reproduces this view: ${permalink}`,
    ``,
    `Auth: copy your "session" cookie from the browser dev tools (Application →`,
    `Cookies → ndi-cloud.com → session) and paste it below. The cookie is`,
    `HttpOnly so it must come from devtools, not document.cookie.`,
    `"""`,
    `import os`,
    `import requests`,
    `import numpy as np`,
    `import matplotlib.pyplot as plt`,
    ``,
    `DATASET_ID = ${pyString(datasetId)}`,
    `CLASS_NAME = ${pyString(className)}`,
    `SESSION_COOKIE = os.environ.get("NDI_SESSION", "<paste-cookie-here>")`,
    ``,
    `resp = requests.get(`,
    `    f"https://ndi-cloud.com/api/datasets/{DATASET_ID}/tables/{CLASS_NAME}",`,
    `    cookies={"session": SESSION_COOKIE},`,
    `)`,
    `resp.raise_for_status()`,
    `rows = resp.json()["rows"]`,
    ``,
  ].join('\n');

  let body: string;
  switch (plotType) {
    case 'histogram':
      body = [
        `# Histogram of ${y}`,
        `vals = [float(r[${y}]) for r in rows`,
        `        if r.get(${y}) not in (None, "")]`,
        ``,
        `plt.hist(vals, bins=30)`,
        `plt.xlabel(${y})`,
        `plt.ylabel("Count")`,
        `plt.tight_layout()`,
        `plt.show()`,
      ].join('\n');
      break;

    case 'violin':
      body = [
        `# Violin of ${y} grouped by ${x}, with jittered raw points + IQR box overlay`,
        `from collections import defaultdict`,
        `groups = defaultdict(list)`,
        `for r in rows:`,
        `    yv, xv = r.get(${y}), r.get(${x})`,
        `    if yv in (None, "") or xv in (None, ""):`,
        `        continue`,
        `    try:`,
        `        groups[str(xv)].append(float(yv))`,
        `    except (TypeError, ValueError):`,
        `        continue`,
        ``,
        `labels = sorted(groups.keys())`,
        `data = [groups[k] for k in labels]`,
        ``,
        `fig, ax = plt.subplots(figsize=(6, 5))`,
        `ax.violinplot(data, positions=range(len(labels)),`,
        `              showextrema=False, showmedians=False)`,
        ``,
        `rng = np.random.default_rng(0)`,
        `for i, vals in enumerate(data):`,
        `    arr = np.asarray(vals)`,
        `    q1, med, q3 = np.percentile(arr, [25, 50, 75])`,
        `    ax.add_patch(plt.Rectangle((i - 0.04, q1), 0.08, q3 - q1,`,
        `                               facecolor="dimgray", zorder=3))`,
        `    ax.scatter(i, med, color="white", s=20, zorder=4)`,
        `    jitter = rng.uniform(-0.08, 0.08, size=len(arr))`,
        `    ax.scatter(i + jitter, arr, alpha=0.6, s=15, zorder=2)`,
        ``,
        `ax.set_xticks(range(len(labels)))`,
        `ax.set_xticklabels(labels)`,
        `ax.set_ylabel(${y})`,
        `ax.set_xlabel(${x})`,
        `plt.tight_layout()`,
        `plt.show()`,
      ].join('\n');
      break;

    case 'box':
      body = [
        `# Box of ${y} grouped by ${x}, with jittered raw points overlay`,
        `from collections import defaultdict`,
        `groups = defaultdict(list)`,
        `for r in rows:`,
        `    yv, xv = r.get(${y}), r.get(${x})`,
        `    if yv in (None, "") or xv in (None, ""):`,
        `        continue`,
        `    try:`,
        `        groups[str(xv)].append(float(yv))`,
        `    except (TypeError, ValueError):`,
        `        continue`,
        ``,
        `labels = sorted(groups.keys())`,
        `data = [groups[k] for k in labels]`,
        ``,
        `fig, ax = plt.subplots(figsize=(6, 5))`,
        `ax.boxplot(data, positions=range(len(labels)),`,
        `           widths=0.5, showfliers=False)`,
        ``,
        `rng = np.random.default_rng(0)`,
        `for i, vals in enumerate(data):`,
        `    arr = np.asarray(vals)`,
        `    jitter = rng.uniform(-0.1, 0.1, size=len(arr))`,
        `    ax.scatter(i + jitter, arr, alpha=0.5, s=15, zorder=2)`,
        ``,
        `ax.set_xticks(range(len(labels)))`,
        `ax.set_xticklabels(labels)`,
        `ax.set_ylabel(${y})`,
        `ax.set_xlabel(${x})`,
        `plt.tight_layout()`,
        `plt.show()`,
      ].join('\n');
      break;

    case 'scatter':
      body = [
        `# Scatter of ${y} vs ${x}`,
        `xs, ys = [], []`,
        `for r in rows:`,
        `    try:`,
        `        xs.append(float(r[${x}]))`,
        `        ys.append(float(r[${y}]))`,
        `    except (TypeError, ValueError, KeyError):`,
        `        continue`,
        ``,
        `plt.scatter(xs, ys, s=10, alpha=0.6)`,
        `plt.xlabel(${x})`,
        `plt.ylabel(${y})`,
        `plt.tight_layout()`,
        `plt.show()`,
      ].join('\n');
      break;

    case 'line':
      body = [
        `# Line plot of ${y} vs ${x} (sorted by x for clean rendering)`,
        `points = []`,
        `for r in rows:`,
        `    try:`,
        `        points.append((float(r[${x}]), float(r[${y}])))`,
        `    except (TypeError, ValueError, KeyError):`,
        `        continue`,
        `points.sort(key=lambda p: p[0])`,
        `xs = [p[0] for p in points]`,
        `ys = [p[1] for p in points]`,
        ``,
        `plt.plot(xs, ys, linewidth=1)`,
        `plt.xlabel(${x})`,
        `plt.ylabel(${y})`,
        `plt.tight_layout()`,
        `plt.show()`,
      ].join('\n');
      break;

    case 'bar-count':
      body = [
        `# Bar count of rows by ${x}`,
        `from collections import Counter`,
        `counts = Counter(`,
        `    str(r.get(${x}, "")) for r in rows`,
        `    if r.get(${x}) not in (None, "")`,
        `)`,
        `labels = list(counts.keys())`,
        `values = [counts[k] for k in labels]`,
        ``,
        `plt.bar(labels, values)`,
        `plt.xlabel(${x})`,
        `plt.ylabel("Count")`,
        `plt.xticks(rotation=45, ha="right")`,
        `plt.tight_layout()`,
        `plt.show()`,
      ].join('\n');
      break;
  }

  return preamble + body + '\n';
}

function pyString(s: string): string {
  // Python double-quoted string literal: escape backslash and double-quote.
  // Other characters (including unicode) pass through — Python source is
  // UTF-8 by default and unicode in strings is well-supported.
  const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}
