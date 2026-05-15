/**
 * Stream 3.5 followup (2026-05-16) — auth-forwarding regression lock
 * for the 8 chat tool handlers retrofitted to accept `ToolContext`.
 *
 * Before retrofit (2026-05-15): these handlers ignored auth headers
 * even when called from the workspace surface. Symptom: private-
 * dataset reads silently degraded to anonymous (public-only) results.
 *
 * After retrofit: each handler accepts an optional `ToolContext` and
 * threads `authHeaders` + `requestId` into its outbound fetch. This
 * test asserts that contract by mocking fetch and inspecting headers.
 *
 * Coverage: one happy-path call per handler with a ctx carrying
 * Cookie + X-XSRF-TOKEN + a known requestId. Asserts:
 *   - Cookie present on outbound request
 *   - X-XSRF-TOKEN present
 *   - X-Request-Id matches the supplied requestId (so cross-boundary
 *     tracing works even when the workspace caller sets a specific id)
 *
 * One additional negative: handler called with NO ctx — asserts no
 * auth headers leak (and X-Request-Id is auto-minted to keep
 * FastAPI's request_id middleware happy).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aggregateDocumentsHandler } from '@/lib/ndi/tools/aggregate-documents';
import { fetchImageHandler } from '@/lib/ndi/tools/fetch-image';
import { fetchSignalHandler } from '@/lib/ndi/tools/fetch-signal';
import { getDocumentHandler } from '@/lib/ndi/tools/get-document';
import { ndiDatasetOverviewHandler } from '@/lib/ndi/tools/ndi-dataset-overview';
import { ndiQueryHandler } from '@/lib/ndi/tools/ndi-query';
import { queryDocumentsHandler } from '@/lib/ndi/tools/query-documents';
import type { ToolContext } from '@/lib/ndi/tools/shared';
import { walkProvenanceHandler } from '@/lib/ndi/tools/walk-provenance';

const TEST_BASE = 'https://api.example.com';
const DSID = '67f723d574f5f79c6062389d';
const DOCID = 'doc-test-12345';
const REQ_ID = 'reqid0123456789a'; // 16 hex chars; matches FastAPI regex

const TEST_CTX: ToolContext = {
  authHeaders: {
    Cookie: 'session=abc123; xsrf=def456',
    'X-XSRF-TOKEN': 'def456',
  },
  requestId: REQ_ID,
};

function mockFetchOnce(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function lastFetchHeaders(
  fetchSpy: ReturnType<typeof vi.spyOn>,
): Record<string, string> {
  const init = fetchSpy.mock.calls[0]![1] as RequestInit;
  return init.headers as Record<string, string>;
}

describe('Stream 3.5 handler auth-forwarding contract', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('INTERNAL_API_URL', TEST_BASE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('fetchJson-based handlers forward ctx through shared helper', () => {
    it('query_documents forwards Cookie + XSRF + requestId', async () => {
      const fetchSpy = mockFetchOnce({
        columns: [],
        rows: [],
        total: 0,
      });
      await queryDocumentsHandler({ datasetId: DSID, className: 'probe' }, TEST_CTX);
      const headers = lastFetchHeaders(fetchSpy);
      expect(headers.Cookie).toBe('session=abc123; xsrf=def456');
      expect(headers['X-XSRF-TOKEN']).toBe('def456');
      expect(headers['X-Request-Id']).toBe(REQ_ID);
    });

    it('walk_provenance forwards Cookie + XSRF + requestId', async () => {
      const fetchSpy = mockFetchOnce({ nodes: [], edges: [] });
      await walkProvenanceHandler(
        { datasetId: DSID, docId: DOCID },
        TEST_CTX,
      );
      const headers = lastFetchHeaders(fetchSpy);
      expect(headers.Cookie).toBe('session=abc123; xsrf=def456');
      expect(headers['X-Request-Id']).toBe(REQ_ID);
    });

    it('fetch_image forwards Cookie + requestId', async () => {
      const fetchSpy = mockFetchOnce({
        width: 64,
        height: 64,
        data: [[]],
        min: 0,
        max: 1,
        format: 'PNG',
        downsampled: false,
      });
      await fetchImageHandler(
        { datasetId: DSID, docId: DOCID },
        TEST_CTX,
      );
      const headers = lastFetchHeaders(fetchSpy);
      expect(headers.Cookie).toBe('session=abc123; xsrf=def456');
      expect(headers['X-Request-Id']).toBe(REQ_ID);
    });

    it('fetch_signal forwards Cookie + requestId', async () => {
      const fetchSpy = mockFetchOnce({
        channels: { ch0: [0, 1, 2] },
        timestamps: [0, 0.1, 0.2],
        sample_count: 3,
        format: 'nbf',
        error: null,
      });
      await fetchSignalHandler(
        { datasetId: DSID, docId: DOCID },
        TEST_CTX,
      );
      const headers = lastFetchHeaders(fetchSpy);
      expect(headers.Cookie).toBe('session=abc123; xsrf=def456');
      expect(headers['X-Request-Id']).toBe(REQ_ID);
    });

    it('get_document forwards Cookie + requestId', async () => {
      const fetchSpy = mockFetchOnce({
        id: DOCID,
        document_class: { class_name: 'subject' },
        data: {},
      });
      await getDocumentHandler(
        { datasetId: DSID, docId: DOCID },
        TEST_CTX,
      );
      const headers = lastFetchHeaders(fetchSpy);
      expect(headers.Cookie).toBe('session=abc123; xsrf=def456');
      expect(headers['X-Request-Id']).toBe(REQ_ID);
    });
  });

  describe('raw-fetch handlers (custom timeout / shape) forward ctx', () => {
    it('ndi_dataset_overview forwards Cookie + requestId', async () => {
      const fetchSpy = mockFetchOnce({
        element_count: 1,
        subject_count: 1,
        epoch_count: 1,
        elements: [],
        elements_truncated: false,
        reference: 'X',
        cache_hit: true,
        cache_age_seconds: 0,
      });
      await ndiDatasetOverviewHandler({ datasetId: DSID }, TEST_CTX);
      const headers = lastFetchHeaders(fetchSpy);
      expect(headers.Cookie).toBe('session=abc123; xsrf=def456');
      expect(headers['X-Request-Id']).toBe(REQ_ID);
    });

    it('ndi_query forwards Cookie + requestId (POST path)', async () => {
      const fetchSpy = mockFetchOnce({
        documents: [],
        totalItems: 0,
        page: 1,
        pageSize: 50,
      });
      await ndiQueryHandler(
        {
          scope: 'public',
          searchstructure: [{ operation: 'isa', param1: 'subject' }],
        },
        TEST_CTX,
      );
      const headers = lastFetchHeaders(fetchSpy);
      expect(headers.Cookie).toBe('session=abc123; xsrf=def456');
      expect(headers['X-Request-Id']).toBe(REQ_ID);
      // Origin must still be set (Railway middleware requirement) —
      // the auth-forwarding splice mustn't drop existing contract.
      expect(headers.Origin).toBe('https://ndi-cloud.com');
    });

    it('aggregate_documents forwards Cookie + requestId (POST path)', async () => {
      // Stream 4.9 (2026-05-16): handler now POSTs to
      // /api/aggregate-documents (the new Python service) and expects
      // the {total_items, numeric_matches, groups, …} envelope.
      const fetchSpy = mockFetchOnce({
        total_items: 0,
        numeric_matches: 0,
        truncated: false,
        valueField: 'data.subject.weight_grams',
        scanned_docs: 0,
        groups: [],
        datasets_contributing: [],
      });
      await aggregateDocumentsHandler(
        {
          scope: 'public',
          searchstructure: [{ operation: 'isa', param1: 'subject' }],
          valueField: 'data.subject.weight_grams',
        },
        TEST_CTX,
      );
      const headers = lastFetchHeaders(fetchSpy);
      expect(headers.Cookie).toBe('session=abc123; xsrf=def456');
      expect(headers['X-Request-Id']).toBe(REQ_ID);
      expect(headers.Origin).toBe('https://ndi-cloud.com');
    });
  });

  describe('anonymous fallback — ctx omitted', () => {
    it('query_documents omits auth headers when ctx is undefined', async () => {
      const fetchSpy = mockFetchOnce({ columns: [], rows: [], total: 0 });
      await queryDocumentsHandler({ datasetId: DSID, className: 'probe' });
      const headers = lastFetchHeaders(fetchSpy);
      expect(headers.Cookie).toBeUndefined();
      expect(headers['X-XSRF-TOKEN']).toBeUndefined();
      // X-Request-Id is auto-minted so the FastAPI middleware still has
      // a correlation id to log. 16-char hex matches the contract.
      expect(headers['X-Request-Id']).toMatch(/^[a-f0-9]{16}$/);
    });

    it('ndi_query omits auth headers when ctx is undefined', async () => {
      const fetchSpy = mockFetchOnce({
        documents: [],
        totalItems: 0,
        page: 1,
        pageSize: 50,
      });
      await ndiQueryHandler({
        scope: 'public',
        searchstructure: [{ operation: 'isa', param1: 'subject' }],
      });
      const headers = lastFetchHeaders(fetchSpy);
      expect(headers.Cookie).toBeUndefined();
      expect(headers['X-Request-Id']).toMatch(/^[a-f0-9]{16}$/);
    });
  });
});
