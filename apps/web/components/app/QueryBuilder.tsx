'use client';

/**
 * QueryBuilder — cross-cloud query form (Plan B B3).
 *
 * Ported from `ndi-data-browser-v2/frontend/src/components/query/QueryBuilder.tsx`
 * (Phase 6.5e of the cross-repo unification — see
 * `docs/plans/cross-repo-unification-2026-04-24.md`). Three monorepo
 * adaptations vs. v2 source:
 *
 *   1. URL state migrates from react-router-dom's `useSearchParams`
 *      (which provides read+write via `setSearchParams`) to Next's
 *      `useSearchParams` (read-only) + `useRouter().replace()` for
 *      writes. The query-string contract is unchanged: `?op=...`,
 *      `?field=...`, `?param1=...`, `?param2=...`, `?scope=...`.
 *   2. Imports rewritten for monorepo layout (`@/lib/api/...`,
 *      `@/components/ui/...`, `@/components/errors/...`).
 *   3. Same `react-hooks/incompatible-library` carve-out approach as
 *      other data-browser ports — QueryBuilder itself uses no
 *      TanStack-Table, but the URL-hydration `useEffect` carries the
 *      same intentional one-shot dependency array as the data-browser
 *      source.
 *
 * **Chip-click contract preserved:** Phase 6.5d's catalog FacetPanel
 * pushes `/query?op=contains_string&field=data.ontology_name&param1=...`
 * and `/query?op=contains_string&field=element.type&param1=...`. The
 * URL-hydration block below reads these and prefills the predicate so
 * the user lands inside an open advanced-filters panel with their
 * facet already applied — one click → run query.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import {
  useQueryOperations,
  useRunQuery,
  type QueryNode,
  type QueryResponse,
} from '@/lib/api/query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { ErrorState } from '@/components/errors/ErrorState';
import { Input } from '@/components/ui/Input';

const QUICK_TYPES = [
  'subject',
  'probe',
  'element',
  'element_epoch',
  'imageStack',
  'treatment',
];

const FALLBACK_OPERATIONS = [
  { name: 'isa', label: 'is a (type)', negatable: true },
  { name: 'depends_on', label: 'depends on', negatable: true },
  { name: 'hasfield', label: 'field exists', negatable: true },
  { name: 'exact_string', label: 'equals (string)', negatable: true },
  { name: 'exact_string_anycase', label: 'equals (case-insensitive)', negatable: true },
  { name: 'contains_string', label: 'contains', negatable: true },
  { name: 'regexp', label: 'matches regex', negatable: true },
  { name: 'exact_number', label: '= (number)', negatable: true },
  { name: 'lessthan', label: '< (number)', negatable: true },
  { name: 'lessthaneq', label: '<= (number)', negatable: true },
  { name: 'greaterthan', label: '> (number)', negatable: true },
  { name: 'greaterthaneq', label: '>= (number)', negatable: true },
  { name: 'hasmember', label: 'has member', negatable: true },
];

export type Scope = 'public' | 'private' | 'all' | string; // string: CSV of dataset IDs

interface QueryBuilderProps {
  onResults: (result: QueryResponse) => void;
  onClear?: () => void;
  /** Optional — narrows scope to a single dataset when the page provides it. */
  defaultDatasetId?: string;
  /**
   * Optional seed condition(s) appended on mount. Added to the existing
   * state when present, and causes the advanced-filters panel to open so
   * the user sees the applied filter. Used by the FacetPanel on the query
   * page to route a facet-chip click into a new condition.
   */
  seedConditions?: QueryNode[];
}

/**
 * Default operator for newly-added query conditions.
 *
 * `'contains_string'` = case-insensitive substring match. Ported from
 * NDI-matlab convention (Spike-0 Report C §7.6 + amendment §4.B3): the
 * tutorial teaches researchers `stringMatch='contains'` as the default.
 *
 * Exported so a unit test can pin the amendment-§4.B3 default against
 * silent future inversion.
 */
export const DEFAULT_QUERY_OPERATION = 'contains_string' as const;

function newCondition(): QueryNode {
  return {
    operation: DEFAULT_QUERY_OPERATION,
    field: '',
    param1: '',
    param2: '',
  };
}

function buildStructure(conds: QueryNode[]): QueryNode[] {
  return conds
    .filter((c) => c.operation && (c.operation === 'hasfield' || c.param1))
    .map((c) => ({
      operation: c.operation,
      field: c.field || undefined,
      param1: c.param1 ?? undefined,
      param2: c.param2 ?? undefined,
    }));
}

export function QueryBuilder({
  onResults,
  onClear,
  defaultDatasetId,
  seedConditions,
}: QueryBuilderProps) {
  // Next 16: `useSearchParams()` is read-only; writes go through
  // `useRouter().replace()` with the new query string. `usePathname()`
  // gives us the base path so persisted state lands on `/query`
  // (or whatever route mounts this builder) rather than the root.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? '/query';

  const [searchTerm, setSearchTerm] = useState('');
  const [scope, setScope] = useState<Scope>(
    defaultDatasetId ? defaultDatasetId : 'public',
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [conditions, setConditions] = useState<QueryNode[]>(() =>
    seedConditions && seedConditions.length > 0
      ? [...seedConditions]
      : [newCondition()],
  );

  const executeQuery = useRunQuery();
  const { data: opsData } = useQueryOperations();
  const operations = opsData?.operations
    ? opsData.operations.map((op) => ({
        name: op.name,
        label: op.label,
        negatable: op.negatable,
      }))
    : FALLBACK_OPERATIONS;

  // Hydrate from URL on first load (chip-click landing path / ontology
  // cross-link / deep-links). If a seedConditions prop was provided,
  // prefer it over URL params so the in-page facet flow is deterministic
  // and doesn't depend on URL state side effects.
  //
  // The `set-state-in-effect` disable matches the data-browser's
  // QueryBuilder: this is the canonical pattern for URL-driven mount-
  // only hydration when the params are not derivable at render-time
  // (server gives us the URL, but the form state lives in React state
  // and must be initialized from that URL exactly once).
  /* eslint-disable react-hooks/set-state-in-effect -- mount-only URL/seed hydration, intentional one-time setState */
  useEffect(() => {
    if (seedConditions && seedConditions.length > 0) {
      setShowAdvanced(true);
      return;
    }
    const op = searchParams?.get('op');
    const field = searchParams?.get('field') ?? '';
    const param1 = searchParams?.get('param1') ?? '';
    const param2 = searchParams?.get('param2') ?? '';
    const urlScope = searchParams?.get('scope');
    if (op) {
      setShowAdvanced(true);
      setConditions([{ operation: op, field, param1, param2 }]);
    }
    if (urlScope) setScope(urlScope);
    // Mount-only URL/seed hydration — intentional one-shot setState
    // matching the data-browser's QueryBuilder. searchParams object
    // identity changes on every navigation; we only want this to fire
    // on the very first mount (chip-click landing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const persistToUrl = useCallback(
    (cond: QueryNode | null, nextScope: Scope) => {
      const next = new URLSearchParams(searchParams?.toString() ?? '');
      if (cond) {
        next.set('op', cond.operation);
        if (cond.field) next.set('field', String(cond.field));
        else next.delete('field');
        if (cond.param1 !== '' && cond.param1 != null)
          next.set('param1', String(cond.param1));
        else next.delete('param1');
        if (cond.param2 !== '' && cond.param2 != null)
          next.set('param2', String(cond.param2));
        else next.delete('param2');
      } else {
        for (const k of ['op', 'field', 'param1', 'param2']) next.delete(k);
      }
      if (nextScope && nextScope !== 'public') next.set('scope', nextScope);
      else next.delete('scope');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const runSimple = useCallback(
    (term: string) => {
      if (!term.trim()) return;
      setSearchTerm(term);
      const cond: QueryNode = { operation: 'isa', param1: term.trim() };
      executeQuery.mutate(
        { searchstructure: [cond], scope },
        { onSuccess: (r) => onResults(r) },
      );
      persistToUrl(cond, scope);
    },
    [scope, executeQuery, onResults, persistToUrl],
  );

  const runAdvanced = () => {
    const structure = buildStructure(conditions);
    if (structure.length === 0) return;
    executeQuery.mutate(
      { searchstructure: structure, scope },
      { onSuccess: (r) => onResults(r) },
    );
    persistToUrl(conditions[0] ?? null, scope);
  };

  const updateCondition = (i: number, patch: Partial<QueryNode>) =>
    setConditions((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const addCondition = () =>
    setConditions((prev) => [...prev, newCondition()]);
  const removeCondition = (i: number) =>
    setConditions((prev) => prev.filter((_, idx) => idx !== i));

  const handleClear = () => {
    setSearchTerm('');
    setConditions([newCondition()]);
    persistToUrl(null, 'public');
    onClear?.();
  };

  const needsField = (op: string) => op !== 'isa' && op !== '~isa';
  const needsParam1 = (op: string) => op !== 'hasfield' && op !== '~hasfield';
  const needsParam2 = (op: string) =>
    op === 'depends_on' || op === '~depends_on';

  const err = executeQuery.error;

  return (
    <div className="space-y-3" data-testid="query-builder">
      {!showAdvanced ? (
        <Card>
          <CardBody className="pt-5 pb-4 space-y-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runSimple(searchTerm);
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-muted" />
                <Input
                  placeholder="Search by class (e.g. subject, element, treatment)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-8 h-10"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg-primary"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <ScopeSelect
                scope={scope}
                onChange={(next) => {
                  setScope(next);
                  persistToUrl(null, next);
                }}
                defaultDatasetId={defaultDatasetId}
                className="h-10"
              />
              <Button
                type="submit"
                className="h-10 px-4"
                disabled={executeQuery.isPending || !searchTerm.trim()}
              >
                {executeQuery.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Search'
                )}
              </Button>
            </form>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => runSimple(type)}
                  className="px-2.5 py-1 text-xs rounded-full border border-border-subtle hover:bg-bg-muted transition-colors font-mono"
                >
                  {type}
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="pt-5 pb-4 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Advanced Filters</span>
              <ScopeSelect
                scope={scope}
                onChange={(next) => {
                  setScope(next);
                  persistToUrl(null, next);
                }}
                defaultDatasetId={defaultDatasetId}
                className="h-7"
              />
            </div>
            {conditions.map((cond, i) => (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                {i > 0 && (
                  <Badge variant="secondary" className="shrink-0">
                    AND
                  </Badge>
                )}
                {needsField(cond.operation) && (
                  <Input
                    placeholder="field (e.g. element.name)"
                    value={String(cond.field ?? '')}
                    onChange={(e) =>
                      updateCondition(i, { field: e.target.value })
                    }
                    className="h-7 text-xs font-mono flex-1 min-w-[160px]"
                    data-testid={`query-condition-field-${i}`}
                  />
                )}
                <select
                  value={cond.operation}
                  onChange={(e) =>
                    updateCondition(i, { operation: e.target.value })
                  }
                  className="h-7 text-xs rounded border border-border-strong bg-bg-surface px-2 shrink-0"
                  data-testid={`query-condition-op-${i}`}
                  aria-label={`Operator ${i + 1}`}
                >
                  <optgroup label="Positive">
                    {operations.map((op) => (
                      <option key={op.name} value={op.name}>
                        {op.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Negated">
                    {operations
                      .filter((op) => op.negatable !== false && op.name !== 'or')
                      .map((op) => (
                        <option key={`~${op.name}`} value={`~${op.name}`}>
                          NOT {op.label}
                        </option>
                      ))}
                  </optgroup>
                </select>
                {needsParam1(cond.operation) && (
                  <Input
                    placeholder={
                      cond.operation.endsWith('isa')
                        ? 'class name (e.g. subject)'
                        : cond.operation.endsWith('depends_on')
                          ? 'edge name or *'
                          : 'value'
                    }
                    value={String(cond.param1 ?? '')}
                    onChange={(e) =>
                      updateCondition(i, { param1: e.target.value })
                    }
                    className="h-7 text-xs font-mono flex-1 min-w-[140px]"
                    data-testid={`query-condition-param1-${i}`}
                  />
                )}
                {needsParam2(cond.operation) && (
                  <Input
                    placeholder="dep value (ndiId)"
                    value={String(cond.param2 ?? '')}
                    onChange={(e) =>
                      updateCondition(i, { param2: e.target.value })
                    }
                    className="h-7 text-xs font-mono flex-1 min-w-[140px]"
                    data-testid={`query-condition-param2-${i}`}
                  />
                )}
                {conditions.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={() => removeCondition(i)}
                    aria-label={`Remove filter ${i + 1}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                className="h-7 text-xs"
                onClick={addCondition}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add filter
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={runAdvanced}
                disabled={executeQuery.isPending}
                data-testid="query-builder-run"
              >
                {executeQuery.isPending ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Play className="h-3 w-3 mr-1" />
                )}
                Run query
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {err && <ErrorState error={err} onRetry={() => executeQuery.reset()} />}

      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg-secondary transition-colors"
      >
        {showAdvanced ? (
          <>
            <ChevronUp className="h-3 w-3" />
            Simple search
          </>
        ) : (
          <>
            <ChevronDown className="h-3 w-3" />
            Advanced filters
          </>
        )}
      </button>
    </div>
  );
}

function ScopeSelect({
  scope,
  onChange,
  defaultDatasetId,
  className,
}: {
  scope: Scope;
  onChange: (next: Scope) => void;
  defaultDatasetId?: string;
  className?: string;
}) {
  return (
    <select
      value={scope}
      onChange={(e) => onChange(e.target.value as Scope)}
      className={`text-xs rounded border border-border-strong bg-bg-surface px-2 ${className ?? ''}`}
      aria-label="Query scope"
    >
      <option value="public">Public datasets</option>
      <option value="private">My datasets</option>
      <option value="all">All</option>
      {defaultDatasetId && <option value={defaultDatasetId}>This dataset</option>}
    </select>
  );
}
