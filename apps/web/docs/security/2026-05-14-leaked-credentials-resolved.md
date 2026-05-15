# Security incident — leaked Railway + Voyage credentials

**Detected:** 2026-05-14 (during the tutorial-parity smoke; gitleaks
flagged commit `14e331a`)
**Resolved:** 2026-05-15 ~01:55 UTC
**Severity:** HIGH
**Repo:** `Waltham-Data-Science/ndi-cloud-app` (PUBLIC at the time)

## What happened

A pre-compact checkpoint doc committed live production credentials to
git history on a public repo. The doc was added in commit `14e331a`
on 2026-05-13 and touched by two subsequent commits (`b2952d8`,
`5429390`). Window of exposure: ~37 hours.

**File:** `apps/web/docs/specs/2026-05-13-ask-checkpoint-pre-compact.md`
**Line (at time of commit):** 124

**Exposed credentials (now ROTATED and DEAD — these specific values
no longer grant access to anything):**

```
DATABASE_URL='postgresql://postgres:<rotated>@viaduct.proxy.rlwy.net:16333/railway'
VOYAGE_API_KEY='pa-SmS7<rotated>'
```

Both values were real production credentials for the cloud-app's
RAG index Postgres (port 16333 = production env on the
`ndi-data-browser-v2` Railway project) and the shared Voyage AI
key used by `ndi-cloud-app`, `vh-lab-chatbot`, and
`shrek-lab-chatbot`.

## Resolution timeline

| Step | Action | Completed |
|---|---|---|
| 1 | Voyage AI key revoked in Voyage dashboard | ✅ 2026-05-15 ~01:20 |
| 2 | New Voyage key issued + applied to: Railway `vh-lab-chatbot`, Railway `shrek-lab-chabot`, Vercel `ndi-cloud-app` (Production + Preview scopes) | ✅ 2026-05-15 ~01:20-01:25 |
| 3 | All three services redeployed + verified responding to semantic-search queries with the new key | ✅ 2026-05-15 ~01:25 |
| 4 | Railway production Postgres password reset via Railway dashboard | ✅ 2026-05-15 ~01:40 |
| 5 | Vercel `ndi-cloud-app` `DATABASE_URL` updated to new public URL (Production scope) | ✅ 2026-05-15 ~01:40 |
| 6 | End-to-end verified: preview `/ask` semantic_search exercises both new key + new Postgres URL on every query | ✅ 2026-05-15 ~01:45 |
| 7 | BFG history rewrite ran locally on a mirror clone; 241 objects rewritten, both leaked strings scrubbed from every blob | ✅ 2026-05-15 ~01:54 |
| 8 | Force-pushed rewritten `feat/experimental-ask-chat` branch (`3a92749 → cc2414e`) + safety-belt rollback tag `gitleaks-pre-scrub-2026-05-15-rollback` | ✅ 2026-05-15 ~01:55 |
| 9 | `gitleaks detect` clean locally — 308 commits scanned, 0 findings | ✅ 2026-05-15 ~01:55 |
| 10 | Annotated the 3 false-positive test-stub fixtures with `// gitleaks:allow` + added `.gitleaksignore` for the historical fingerprints (kept alive by rollback tag) | ✅ 2026-05-15 ~01:58 |
| 11 | CI `gitleaks (secret scan)` job: success on commit `7d92e42` | ✅ 2026-05-15 ~02:00 |
| 12 | All surfaces smoked 200: prod apex (home/datasets/platform/labchat), vh-lab-chatbot, shrek-lab-chatbot, preview `/ask` end-to-end | ✅ 2026-05-15 ~02:00 |
| 13 | This doc archived (moved from repo root → `apps/web/docs/security/`) and renamed with `-resolved` suffix | ✅ 2026-05-15 |

## What's NOT done (intentional)

**Rollback tag `gitleaks-pre-scrub-2026-05-15-rollback`** is kept on
origin for a ~7-day burn-in window (planned deletion **2026-05-22**).
While alive, it keeps the original pre-scrub commit chain reachable
in git's object store — so the leaked commit blob is technically
still retrievable via `git show <tag>:14e331a:...`. The rotated
credentials in the blob can't grant access, but for full
gitleaks-history-clean we'd need to delete the tag and let GitHub's
GC run.

Trade-off was deliberate: tag is the only emergency-rollback path
if a downstream consumer is found to have broken on the rewritten
chain. Risk of leaving the dead blob in history (week of exposure
to scrapers + indexers, none of which can use the values) was
judged lower than risk of having no rollback if something
unexpected broke.

**Action item for 2026-05-22+**: delete the rollback tag:
```bash
git push origin :refs/tags/gitleaks-pre-scrub-2026-05-15-rollback
git tag -d gitleaks-pre-scrub-2026-05-15-rollback
```
Then `gitleaks detect` should report zero findings even without the
`.gitleaksignore` entries.

## Lessons

1. **The `.githooks/pre-commit` hook works** — it runs gitleaks on
   the staged diff before letting the commit land. The commit
   that introduced this leak was authored on a machine where
   `git config core.hooksPath .githooks` wasn't active. **CLAUDE.md
   already calls this out** ("Activate the hook locally"); this
   incident is evidence it's worth checking on every contributor
   machine.

2. **Pre-compact checkpoint docs are high-risk for secret leaks**.
   The leaked credentials were in a `bash` code block giving an
   example of how to re-bake the RAG index — a perfectly natural
   thing to capture in a session summary, except the example used
   real values from the author's terminal history. Going forward:
   pre-compact docs should ALWAYS use placeholder values
   (`<your-postgres-url>` etc) regardless of how convenient the
   real value is for the next agent to re-use.

3. **The shared Voyage key across 3 projects** meant any single
   leak compromised all three chatbots simultaneously. Consider
   per-project Voyage keys going forward — at minimum so a leak
   in one repo doesn't compromise the others. Trade-off is more
   keys to rotate when one of them turns up in history.

4. **Backup-and-belt git rotation** worked well — the
   `--force-with-lease=<sha>:<expected>` explicit-baseline form
   was needed because the mirror clone didn't have a separate
   tracking ref to compare against (`--force-with-lease` alone
   bailed with "stale info"). Documenting this in case any future
   force-push from a mirror clone hits the same wall.

## File map (for auditors)

**The rotated values were:**
- Railway Postgres on `ndi-data-browser-v2` production env, service `Postgres` (id `f925ff6b-...`). Port `16333` on `viaduct.proxy.rlwy.net`.
- Voyage AI key on the team account (singular — was shared across `ndi-cloud-app`, `vh-lab-chatbot`, `shrek-lab-chabot`).

**The scrub operations:**
- BFG run output: `/private/tmp/ndi-cloud-app-scrub.git.bfg-report/2026-05-15/01-34-38/`
  (local-only, on the author's machine)
- Force-push: `3a92749 → cc2414e` on `feat/experimental-ask-chat`
- Rollback tag: `gitleaks-pre-scrub-2026-05-15-rollback` at `5e540e0`

**Commits introducing the leak (all now unreachable from any branch):**
- `14e331a` — added the leaked doc
- `b2952d8` — appended to the doc (still had the secret)
- `5429390` — touched the doc as part of a wave-1 scope-up commit

**The 3 false-positive findings retained via `.gitleaksignore`:**
- `apps/web/tests/unit/ai/voyage-client.test.ts:18` (commit `080b66b0`)
- `apps/web/tests/unit/ai/semantic-search-tool.test.ts:40` (commit `080b66b0`)
- `apps/web/tests/unit/ai/semantic-search-tool.test.ts:96` (commit `ae20dd72`)

All three are test stubs shaped like `pa-test-key-1234567890`. Live
copies in HEAD now carry inline `// gitleaks:allow` annotations.

## Status: CLOSED

Doc retained for audit / SOC2 / future-incident-reference purposes.
Delete or move to a `closed-incidents/` archive folder if doc volume
becomes a problem.
