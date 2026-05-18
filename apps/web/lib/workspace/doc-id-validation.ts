/**
 * Validate a Document ID string. Accepts EITHER of NDI's two id forms:
 *
 *   - Mongo `_id` — 24 hex chars (e.g. `68d6e54703a03f5cfdac8ef7`)
 *   - NDI-format `ndiId` — 16 hex + `_` + 16 hex
 *     (e.g. `4126945b004f4f5a_c0ccb3a4ec7146d6`)
 *
 * Both are valid inputs to the backend's document-detail route — the
 * `_validators.py::DocumentId` parser resolves either to a canonical
 * Mongo `_id`. Panel inputs that previously required the Mongo form
 * (24-char hex) rejected ids written by the selection-bar's
 * `setSelection` calls, which use NDI-format.
 */
const MONGO_ID = /^[a-f0-9]{24}$/i;
const NDI_ID = /^[a-f0-9]{16}_[a-f0-9]{16}$/i;

export function isValidDocId(s: string): boolean {
  return MONGO_ID.test(s) || NDI_ID.test(s);
}

export function getDocIdErrorMessage(s: string): string | null {
  if (!s) return 'Document ID is required';
  if (isValidDocId(s)) return null;
  return 'Document ID must be a 24-char hex Mongo id OR a 16+16 hex NDI id';
}
