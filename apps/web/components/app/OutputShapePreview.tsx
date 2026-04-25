/**
 * OutputShapePreview — static column-set preview (Plan B B3).
 *
 * Ported from `ndi-data-browser-v2/frontend/src/components/query/OutputShapePreview.tsx`
 * (Phase 6.5e of the cross-repo unification — see
 * `docs/plans/cross-repo-unification-2026-04-24.md`). Single monorepo
 * adaptation: import path `@/data/...` → `@/lib/data/...`.
 *
 * Pure UI; no hooks, no fetches. Renders the canonical Francesconi-tutorial
 * column header rows for the subject / probe / epoch grains so a researcher
 * filtering on `isa subject` knows exactly what columns the result table
 * will carry.
 */
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  EPOCH_DEFAULT_COLUMNS,
  PROBE_DEFAULT_COLUMNS,
  SUBJECT_DEFAULT_COLUMNS,
  type ColumnDefault,
} from '@/lib/data/table-column-definitions';

export interface OutputShapePreviewProps {
  /** Optional filter: show only these grains. Empty / undefined = show all. */
  grains?: ReadonlyArray<'subject' | 'probe' | 'epoch'>;
}

const TUTORIAL_URL =
  'https://github.com/VH-Lab/NDI-matlab/blob/main/src/ndi/docs/NDI-matlab/tutorials/datasets/Francesconi_et_al_2025/1_getting_started.md';
const PAPER_URL = 'https://doi.org/10.1016/j.celrep.2025.115768';

const GRAIN_CONFIG = {
  subject: {
    title: 'Subject grain',
    matlabCall: 'docTable.subject',
    columns: SUBJECT_DEFAULT_COLUMNS,
  },
  probe: {
    title: 'Probe grain',
    matlabCall: 'docTable.probe',
    columns: PROBE_DEFAULT_COLUMNS,
  },
  epoch: {
    title: 'Epoch grain',
    matlabCall: 'docTable.epoch',
    columns: EPOCH_DEFAULT_COLUMNS,
  },
} as const;

export function OutputShapePreview({ grains }: OutputShapePreviewProps) {
  const visibleGrains =
    grains && grains.length > 0 ? grains : (['subject', 'probe', 'epoch'] as const);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Output shape preview</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-xs text-fg-secondary">
          These are the column sets a matching result table will use for each
          grain. Shape follows NDI-matlab&apos;s canonical{' '}
          <code className="font-mono text-[11px]">docTable</code> tutorial.
        </p>

        {visibleGrains.map((grain) => (
          <GrainPreview key={grain} grain={grain} />
        ))}

        <p className="text-[11px] text-fg-muted pt-2 border-t border-border-subtle">
          Source: NDI-matlab{' '}
          <a
            href={TUTORIAL_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="text-ndi-teal hover:underline"
          >
            Francesconi et al. 2025 tutorial
          </a>{' '}
          ·{' '}
          <a
            href={PAPER_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="text-ndi-teal hover:underline"
          >
            Cell Reports paper
          </a>
          .
        </p>
      </CardBody>
    </Card>
  );
}

function GrainPreview({ grain }: { grain: 'subject' | 'probe' | 'epoch' }) {
  const cfg = GRAIN_CONFIG[grain];
  const visibleColumns = cfg.columns.filter((c: ColumnDefault) => c.visible);
  return (
    <div>
      <h3 className="text-xs font-medium text-fg-secondary mb-1.5">
        {cfg.title}{' '}
        <code className="font-mono text-[11px] text-fg-muted">{cfg.matlabCall}</code>{' '}
        <span className="text-fg-muted">({visibleColumns.length} columns)</span>
      </h3>
      <div className="overflow-x-auto rounded border border-border-subtle">
        <table className="w-full text-xs">
          <thead className="bg-bg-muted">
            <tr>
              {visibleColumns.map((col) => (
                <th
                  key={col.id}
                  className="px-2 py-1.5 text-left font-medium text-fg-secondary whitespace-nowrap"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
        </table>
      </div>
    </div>
  );
}
