'use client';

/**
 * UseThisDataModal — "Use this data" affordance on the dataset
 * detail page. Two tabs (Python / MATLAB), each showing the
 * minimal local-analysis snippet for the matching NDI toolkit.
 *
 * # Snippet philosophy (revised 2026-05-17)
 *
 * The original spec (Plan B amendment §4.B4) hard-coded a verbose
 * MATLAB block — `dataPath = [userpath filesep 'Datasets']; ...
 * if isfolder(datasetPath) ... else ... end ...` — modeled after
 * older NDI-matlab tutorials that wanted a re-runnable cached
 * download.
 *
 * That's the WRONG default for "user opens the modal, copies the
 * snippet, pastes into MATLAB." Steve (NDI-matlab maintainer)
 * flagged this directly: the modern NDI-matlab handles the
 * download-directory prompt graphically when no path argument is
 * passed. The simpler form
 *
 *   `dataset = ndi.cloud.downloadDataset('<DATASET_ID>');`
 *
 * is enough.
 *
 * We default to the simple form. The verbose "re-runnable cached
 * script" pattern is still useful for production scripts; we
 * surface it via the "Advanced (re-runnable)" toggle so the user
 * can opt in.
 *
 * # Carryability note
 *
 * Both tabs share a "dissonance note" reminding the user that
 * these snippets download the dataset for local work — the web
 * workspace lets them explore without downloading. Kept (it was
 * the amendment's ask and still right).
 */
import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { CopyButton } from '@/components/ui/CopyButton';
import { Modal } from '@/components/ui/Modal';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { cn } from '@/lib/cn';

export interface UseThisDataModalProps {
  open: boolean;
  onClose: () => void;
  datasetId: string;
}

type SnippetTab = 'python' | 'matlab';

const TABS: TabItem<SnippetTab>[] = [
  { id: 'python', label: 'Python' },
  { id: 'matlab', label: 'MATLAB' },
];

/**
 * Dissonance note rendered above each snippet (amendment §4.B4).
 * Copy intentionally identical in both tabs.
 */
const DISSONANCE_NOTE =
  "These snippets download the dataset for local analysis. v2's browser lets you explore without downloading — this is for local work.";

/**
 * Default Python snippet — minimal "download + start exploring" form.
 * Assumes the user has run `ndi login` (or set the
 * NDI_CLOUD_USERNAME / NDI_CLOUD_PASSWORD env vars) so the SDK
 * picks up credentials automatically. Inline comments name the
 * env vars so the user can skip the auth setup if they already
 * have it configured.
 */
const PYTHON_TEMPLATE = `import ndi

# Downloads to ~/ndi-datasets/<DATASET_ID>/ by default.
# Requires NDI_CLOUD_USERNAME + NDI_CLOUD_PASSWORD env vars,
# OR a prior \`ndi login\` session.
dataset = ndi.cloud.downloadDataset("<DATASET_ID>")

# Now explore — common starters from ndi-python tutorials:
subject_df = ndi.fun.doc_table.subject(dataset)
# probe_df   = ndi.fun.doc_table.probe(dataset)
# epoch_df   = ndi.fun.doc_table.epoch(dataset)
`;

/**
 * Default MATLAB snippet — minimal form Steve flagged as the right
 * default. Omitting the `dataPath` arg prompts the user to pick a
 * download directory graphically the first time (NDI-matlab handles
 * caching transparently on re-run).
 */
const MATLAB_TEMPLATE = `% Prompts you to pick a download directory the first time.
% Re-running with the same id reuses the cached dataset.
dataset = ndi.cloud.downloadDataset('<DATASET_ID>');

% Now explore — common starters from ndi-matlab tutorials:
subjectSummary = ndi.fun.docTable.subject(dataset);
% probeSummary  = ndi.fun.docTable.probe(dataset);
% epochSummary  = ndi.fun.docTable.epoch(dataset);
`;

/**
 * Re-runnable / CI-friendly Python snippet (the old verbose form,
 * surfaced via the "Advanced" toggle). Explicit auth setup makes it
 * scriptable — no interactive prompt, env vars carry credentials.
 * Useful for notebooks shared across a lab or CI pipelines.
 */
const PYTHON_TEMPLATE_ADVANCED = `import os
from ndi.cloud import downloadDataset
from ndi.cloud.auth import login
from ndi.cloud.client import CloudClient
from ndi.fun.doc_table import subject, probe, epoch

# Explicit auth — same as the default snippet but inlined for
# scripts that need to be fully self-contained (e.g. CI).
config = login(os.environ["NDI_CLOUD_USERNAME"], os.environ["NDI_CLOUD_PASSWORD"])
client = CloudClient(config)

# Explicit cache dir so the script is re-runnable: subsequent
# runs find the existing download and skip the fetch.
dataset = downloadDataset(
    "<DATASET_ID>",
    "~/ndi-datasets",
    verbose=True,
    client=client,
)
subject_df = subject(dataset)
`;

/**
 * Re-runnable / scripted MATLAB snippet. Same idiom as the
 * pre-2026-05-17 default — caches by dataset id under
 * \`userpath/Datasets\`, skips download on re-run. Surfaced via
 * the "Advanced" toggle for users who want a self-contained
 * script.
 */
const MATLAB_TEMPLATE_ADVANCED = `% Re-runnable script: caches under \`userpath/Datasets/\` and
% reuses the cached copy when the dataset is already on disk.
dataPath = [userpath filesep 'Datasets'];
datasetPath = fullfile(dataPath, '<DATASET_ID>');
if isfolder(datasetPath)
    dataset = ndi.dataset.dir(datasetPath);
else
    if ~isfolder(dataPath), mkdir(dataPath); end
    dataset = ndi.cloud.downloadDataset('<DATASET_ID>', dataPath);
end
subjectSummary = ndi.fun.docTable.subject(dataset);
`;

/** Replace every ``<DATASET_ID>`` token in the template with the
 *  supplied dataset id. Uses a literal ``<DATASET_ID>`` match (not a
 *  regex placeholder) so ids that happen to contain regex metacharacters
 *  round-trip losslessly. */
export function substituteDatasetId(template: string, datasetId: string): string {
  // Use split/join over String.replaceAll so that the substitution is
  // literal — replaceAll with a string pattern is safe, but going via
  // split keeps the behaviour identical if a caller ever passes a
  // RegExp-like string.
  return template.split('<DATASET_ID>').join(datasetId);
}

export function UseThisDataModal({
  open,
  onClose,
  datasetId,
}: UseThisDataModalProps) {
  const [active, setActive] = useState<SnippetTab>('python');
  // 2026-05-17 — "Advanced" toggle reveals the re-runnable /
  // CI-friendly form (explicit auth + cached download dir). The
  // default is the simple form per Steve's feedback; the advanced
  // form is for users shipping shared scripts.
  const [advanced, setAdvanced] = useState(false);

  const pythonSnippet = useMemo(
    () =>
      substituteDatasetId(
        advanced ? PYTHON_TEMPLATE_ADVANCED : PYTHON_TEMPLATE,
        datasetId,
      ),
    [datasetId, advanced],
  );
  const matlabSnippet = useMemo(
    () =>
      substituteDatasetId(
        advanced ? MATLAB_TEMPLATE_ADVANCED : MATLAB_TEMPLATE,
        datasetId,
      ),
    [datasetId, advanced],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Use this data"
      description="Minimal local-analysis snippets. Python for ndi-python, MATLAB for NDI-matlab."
      size="lg"
    >
      <div className="space-y-4" data-testid="use-data-modal-body">
        <Tabs
          tabs={TABS}
          active={active}
          onSelect={(id) => setActive(id)}
          className="mb-2"
        />

        <DissonanceNote />

        <AdvancedToggle
          advanced={advanced}
          onChange={setAdvanced}
        />

        {active === 'python' ? (
          <SnippetPanel
            language="python"
            snippet={pythonSnippet}
            testId="snippet-python"
            filename={`ndi-${datasetId}-local.py`}
          />
        ) : (
          <SnippetPanel
            language="matlab"
            snippet={matlabSnippet}
            testId="snippet-matlab"
            filename={`ndi_${datasetId}_local.m`}
          />
        )}
      </div>
    </Modal>
  );
}

/**
 * Toggle between the minimal snippet (default) and the
 * re-runnable / CI-friendly version. Phase H carryability fix.
 */
function AdvancedToggle({
  advanced,
  onChange,
}: {
  advanced: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between text-[12px]"
      data-testid="advanced-toggle-wrap"
    >
      <span className="text-gray-600">
        {advanced
          ? 'Re-runnable script (caches the download, scriptable auth).'
          : 'Minimal — prompts for credentials + download dir the first time.'}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={advanced}
        aria-label="Toggle advanced (re-runnable) snippet"
        onClick={() => onChange(!advanced)}
        data-testid="advanced-toggle"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-2 py-1',
          'font-medium ring-1 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2',
          advanced
            ? 'bg-brand-50 text-brand-800 ring-brand-200 hover:bg-brand-100'
            : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'inline-block h-2 w-2 rounded-full',
            advanced ? 'bg-brand-600' : 'bg-gray-300',
          )}
        />
        {advanced ? 'Advanced' : 'Minimal'}
      </button>
    </div>
  );
}

function DissonanceNote() {
  return (
    <aside
      role="note"
      className={cn(
        'flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs',
        'text-amber-800 ring-1 ring-amber-200',
      )}
      data-testid="dissonance-note"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <p>{DISSONANCE_NOTE}</p>
    </aside>
  );
}

function SnippetPanel({
  language,
  snippet,
  testId,
  filename,
}: {
  language: 'python' | 'matlab';
  snippet: string;
  testId: string;
  filename: string;
}) {
  return (
    <section
      role="tabpanel"
      aria-label={language === 'python' ? 'Python' : 'MATLAB'}
      className="space-y-2"
      data-testid={testId}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-gray-500">
          {filename}
        </span>
        <CopyButton
          value={snippet}
          ariaLabel={`Copy ${language} snippet`}
          testId={`${testId}-copy`}
        />
      </div>
      <pre
        className={cn(
          'overflow-x-auto rounded-md border border-gray-200 bg-gray-900 p-3',
          'font-mono text-[12px] leading-relaxed text-gray-100',
        )}
        data-language={language}
        data-testid={`${testId}-content`}
      >
        <code>{snippet}</code>
      </pre>
    </section>
  );
}
