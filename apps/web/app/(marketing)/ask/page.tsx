/**
 * `/ask` — RETIRED (2026-05-16, Phase D workspace redesign).
 *
 * Ask is now a workspace-only affordance, accessible via the drawer
 * trigger inside `/my/workspace/[id]/*`. The public anonymous chat
 * surface that used to live at this URL is retired as part of the
 * Phase D migration — Ask is no longer a public marketing-side
 * surface (per the design doc's locked decision, with a dedicated
 * marketing page slated to appear within the Data Browser product
 * page once that product launches publicly).
 *
 * Anyone arriving at `/ask` (bookmarks, external links) is
 * server-redirected to `/create-account?next=/my` so:
 *   - Authenticated visitors land in their dataset list after the
 *     auth pass-through.
 *   - New visitors are prompted to create an account before
 *     accessing the workspace chat.
 *
 * `redirect()` is a server-side redirect; no client flash.
 */
import { redirect } from 'next/navigation';

export default function RetiredAskPage(): never {
  redirect('/create-account?next=/my');
}
