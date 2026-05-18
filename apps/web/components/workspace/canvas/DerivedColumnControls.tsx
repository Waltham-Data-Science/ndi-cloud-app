'use client';

/**
 * DerivedColumnControls — UI affordance for adding / removing
 * user-defined "derived columns" on a workspace tabular view.
 *
 * Companion to the parser/evaluator at `@/lib/workspace/derived-columns`.
 * The panel rendering the table owns the array of `DerivedColumn`
 * and threads it into the column-list when rendering cells. The
 * controls below are purely the user-facing input surface (an "Add"
 * button that toggles an inline form + a list of chips for the
 * currently-added derived columns with × to remove each).
 *
 * State model
 * -----------
 *
 * `useDerivedColumns()` is a tiny hook bundling the array + add +
 * remove helpers; consumers don't need to manage the array manually.
 * State lives in component-local React state — NOT URL / localStorage.
 * Reloading the page or switching datasets clears the derived columns,
 * which matches the "scratchpad" semantics derived columns are meant
 * for. Persistence is intentionally out of scope for v1; a future
 * iteration can lift to URL params if the use case demands it.
 */
import { Plus, X } from 'lucide-react';
import {
  useCallback,
  useId,
  useMemo,
  useState,
  type FormEvent,
} from 'react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  compileFormula,
  FormulaError,
  type DerivedColumn,
} from '@/lib/workspace/derived-columns';

/**
 * Tiny stable id generator for derived columns. Doesn't need to be
 * cryptographically unique — just stable across the React lifetime so
 * `<th key={id}>` doesn't churn. Numeric counter scoped to the hook
 * instance; resetting on each remount is fine (component state is
 * scoped to the same lifetime).
 */
function makeId(): string {
  return `derived-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export interface UseDerivedColumns {
  derivedColumns: ReadonlyArray<DerivedColumn>;
  add: (column: DerivedColumn) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export function useDerivedColumns(): UseDerivedColumns {
  const [columns, setColumns] = useState<DerivedColumn[]>([]);
  const add = useCallback((column: DerivedColumn) => {
    setColumns((prev) => [...prev, column]);
  }, []);
  const remove = useCallback((id: string) => {
    setColumns((prev) => prev.filter((c) => c.id !== id));
  }, []);
  const clear = useCallback(() => setColumns([]), []);
  return useMemo(
    () => ({ derivedColumns: columns, add, remove, clear }),
    [columns, add, remove, clear],
  );
}

export interface DerivedColumnControlsProps {
  derivedColumns: ReadonlyArray<DerivedColumn>;
  onAdd: (column: DerivedColumn) => void;
  onRemove: (id: string) => void;
  /**
   * Available column-name tokens the user can reference in formulas.
   * Surfaced as a small hint below the formula input so the user
   * doesn't have to guess the underlying field names.
   */
  availableColumns: ReadonlyArray<string>;
}

export function DerivedColumnControls({
  derivedColumns,
  onAdd,
  onRemove,
  availableColumns,
}: DerivedColumnControlsProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [formula, setFormula] = useState('');
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const formulaId = useId();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    const trimmedFormula = formula.trim();
    if (!trimmedName) {
      setError('Name required.');
      return;
    }
    if (!trimmedFormula) {
      setError('Formula required.');
      return;
    }
    let evaluator: DerivedColumn['evaluator'];
    try {
      evaluator = compileFormula(trimmedFormula);
    } catch (err) {
      if (err instanceof FormulaError) {
        setError(err.message);
      } else {
        setError('Could not parse formula.');
      }
      return;
    }
    onAdd({
      id: makeId(),
      label: trimmedName,
      formula: trimmedFormula,
      evaluator,
    });
    setName('');
    setFormula('');
    setIsAdding(false);
  }

  function handleCancel() {
    setName('');
    setFormula('');
    setError(null);
    setIsAdding(false);
  }

  return (
    <div
      className="rounded-md border border-border-subtle bg-bg-canvas/30 p-3 space-y-2"
      data-testid="derived-column-controls"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[12px] font-semibold text-fg-secondary">
          Derived columns
        </h4>
        {!isAdding && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsAdding(true)}
            aria-label="Add derived column"
            data-testid="derived-column-add-button"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        )}
      </div>

      {derivedColumns.length > 0 && (
        <ul
          className="flex flex-wrap gap-1.5"
          data-testid="derived-column-list"
        >
          {derivedColumns.map((c) => (
            <li
              key={c.id}
              className="inline-flex items-center gap-1 rounded-full bg-bg-surface border border-border-subtle px-2 py-0.5 text-[11px]"
              title={`${c.label} = ${c.formula}`}
              data-testid="derived-column-chip"
              data-derived-id={c.id}
            >
              <span className="font-mono">{c.label}</span>
              <span className="text-fg-muted">=</span>
              <span className="font-mono text-fg-muted truncate max-w-[140px]">
                {c.formula}
              </span>
              <button
                type="button"
                onClick={() => onRemove(c.id)}
                aria-label={`Remove ${c.label}`}
                className="ml-1 text-fg-muted hover:text-fg-error"
                data-testid="derived-column-remove"
                data-derived-id={c.id}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {isAdding && (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-2"
          data-testid="derived-column-form"
        >
          <div>
            <label
              htmlFor={nameId}
              className="block text-[11px] font-medium text-fg-secondary mb-0.5"
            >
              Name
            </label>
            <Input
              id={nameId}
              name="derived-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. cv"
              data-testid="derived-column-label-input"
            />
          </div>
          <div>
            <label
              htmlFor={formulaId}
              className="block text-[11px] font-medium text-fg-secondary mb-0.5"
            >
              Formula
            </label>
            <Input
              id={formulaId}
              name="derived-formula"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="e.g. std / mean"
              data-testid="derived-column-formula-input"
            />
            <p className="mt-1 text-[10px] text-fg-muted">
              Columns:{' '}
              <span className="font-mono">{availableColumns.join(', ')}</span>
              {'. Functions: '}
              <span className="font-mono">min, max, abs, round, sqrt</span>
              {'. Operators: '}
              <span className="font-mono">+ − × ÷ ( )</span>
            </p>
          </div>
          {error && (
            <p
              role="alert"
              className="text-[11px] text-fg-error"
              data-testid="derived-column-error"
            >
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              data-testid="derived-column-submit"
            >
              Add column
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancel}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
