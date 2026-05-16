/**
 * `/my/ask` — RETIRED (2026-05-16, Phase D workspace redesign).
 *
 * Ask is no longer a standalone destination in the `/my/**` app
 * shell. It lives inside `/my/workspace/[id]/*` as the panel
 * drawer / sidebar / fullscreen affordance. Users who bookmarked
 * `/my/ask` are server-redirected to `/my` (their dataset list)
 * where they can open a workspace and access Ask from there.
 *
 * `redirect()` is a server-side redirect; no client flash.
 */
import { redirect } from 'next/navigation';

export default function RetiredMyAskPage(): never {
  redirect('/my');
}
