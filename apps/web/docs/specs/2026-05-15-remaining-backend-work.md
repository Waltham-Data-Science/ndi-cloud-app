# Remaining backend work — design specs

**Date:** 2026-05-15
**Status:** Design specs for three pieces deferred to a future
session that needs live data access + meaningful backend
refactoring.

Items here have crisp scope + acceptance criteria so the next
session can pick them up cold.

---

## S4.9 — Move `aggregate-documents.ts` to Railway (Heart-on-Railway compliance)

**Why:** ADR-001 codifies that heavy orchestration belongs on
Railway (Python) rather than Vercel (Node). The
`aggregate_documents` tool currently lives at
`apps/web/lib/ndi/tools/aggregate-documents.ts` and runs the full
NDI Query DSL aggregation in TypeScript on the Vercel side. The
correct location per ADR-001 is the FastAPI proxy.

**Scope:**
1. New Python service `backend/services/aggregate_documents_service.py`
   that mirrors the TypeScript handler's behavior:
   - Accept `scope` (public | CSV of dataset IDs | single ID),
     `searchstructure` (NDI Query DSL clauses), `valueField`
     (dotted path), optional `groupBy`, optional `maxDocs`.
   - Walk matching docs, extract numeric values at `valueField`,
     group by `groupBy` if set.
   - Return per-group `{count, mean, median, std, min, max}` +
     `numeric_matches` + `total_items` + `truncated`.
2. New FastAPI router at `backend/routers/aggregate_documents.py`
   exposing `POST /api/aggregate-documents`.
3. Rewrite `apps/web/lib/ndi/tools/aggregate-documents.ts` as a
   thin client that POSTs to the new FastAPI endpoint via
   `postJson(url, body, ctx)`.
4. Port the existing TypeScript unit tests to
   `backend/tests/unit/test_aggregate_documents_service.py`.

**Acceptance:**
- TS handler is < 100 lines (thin client wrapper).
- Python service has parity with the TS implementation against
  the existing fixture inputs.
- Replay harness against canonical chat queries returns equivalent
  per-group stats.

**Estimated effort:** 1 day (Python port + tests + cross-repo
ship).

---

## S5.3 — BehavioralCompare cross-table joins

**Why:** Today's `tabular_query` ONLY operates on a single
ontologyTableRow class within one dataset. Real scientific
comparisons sometimes need:
- A measurement from ontologyTableRow joined with a treatment
  assignment from the `treatment` class (or treatment_drug).
- Two ontologyTableRow tables joined by subject (e.g. EPM
  behavior + FPS startle).

**Scope:**
1. Extend `backend/services/tabular_query_service.py` to accept
   an optional `joinOn` parameter:
   - `joinOn: "subject"` joins via subjectDocumentIdentifier
     across ontologyTableRow groups.
   - `joinOn: "treatment"` joins ontologyTableRow with a treatment
     doc per subject.
2. Add a new `cross_table_query` handler at
   `apps/web/lib/ndi/tools/cross-table-query.ts` (separate from
   `tabular_query` to keep the existing surface stable).
3. Wire into `chat-tools.ts` with description directing the LLM
   to use it when the user's question explicitly names two
   tables ("FPS startle x EPM open-arm", "weight at treatment vs
   weight after").
4. Frontend: expose via a "Cross-table" toggle in
   `BehavioralComparePanel` that switches between single-table
   and joined modes.

**Acceptance:**
- A test fixture with two ontologyTableRow groups + a treatment
  table joins correctly by subject and produces a violin chart
  with N subjects per group.
- The existing single-table path still passes its tests
  unchanged.

**Estimated effort:** 1-2 days.

---

## S5.8 — `/tables/{class}` server-side pagination

**Why:** Today's `/api/datasets/:id/tables/:className` returns
ALL rows in a single JSON blob. Bhar's
`ontologyTableRow` is 5,297 rows × ~15 columns ≈ 6 MB per call.
The cron warm-cache (every 5 min) re-fetches every table on every
run → ~1.5 GB/day of egress. The audit Finding #8 documented this
+ projected the egress savings at ~95% if we pagination.

**Scope:**
1. `backend/services/summary_table_service.py::single_class` — add
   `page: int` (1-based) + `page_size: int` (default 200, max
   1000) parameters. Slice the rows array AFTER projection +
   companion-class enrichment. Return
   `{ columns, rows, page, pageSize, totalRows, hasMore }`.
2. Router at
   `backend/routers/dataset_tables.py::get_dataset_table` —
   pass `page` + `page_size` query params through to the service.
3. Frontend `apps/web/lib/api/tables.ts` — add `usePagedDatasetTable`
   hook that fetches sequential pages via TanStack Query's
   `useInfiniteQuery` with `getNextPageParam` based on `hasMore`.
4. UI: `SummaryTableView` switches to infinite-scroll pagination
   with a virtualized table (already uses `VirtualizedTable`;
   just needs the data hook swap).
5. Chat-tool side: `query_documents` keeps single-page semantics
   (LLM typically wants the first 10-30 rows anyway); add a
   `page` parameter but default to `1`.

**Acceptance:**
- Bhar `/tables/ontologyTableRow` first request drops from
  ~6 MB to ~250 KB.
- Cron warm-cache day-over-day egress drops by ~95%.
- Existing tests for the table endpoints either still pass OR
  are updated to assert the new pagination envelope.
- Document Explorer's table view scrolls smoothly through ALL
  rows via infinite scroll.

**Estimated effort:** 1 day (backend + frontend hook + UI plumbing).

---

## Cross-cutting risks

- **Cache invalidation** — the existing summary-table response
  cache (`RedisTableCache`) is keyed by `(dataset_id, class_name,
  user_scope)`. The pagination work needs to either include `page`
  in the cache key (per-page cache) OR cache the FULL row set and
  slice in-memory on cache hit. The latter is faster + simpler
  and matches the cron's behavior (warm the full set, serve
  pages from cache).
- **Aggregate-documents migration** must NOT regress the chat's
  current behavior. The replay harness is the gate.
- **Cross-table join** is the most ambiguous spec — drives toward
  a small DSL. Consider designing the JSON shape with one or two
  concrete examples in the design before committing.

## Why deferred this round

S4.9 + S5.3 + S5.8 each require live data access to verify
behavior against the catalog. Without Railway access to spin up
the experimental Postgres + run scripts, the implementations
would be educated guesses. Better to land them with the next
session that has data-side access.
