# Tutorial parity smoke

**Audience:** contributors validating that the workspace + chat answer
the same scientific question the published MATLAB tutorials answer.

**Status:** living doc — update when new datasets get tutorials.

The published `.mlx` tutorials are the canonical ground truth for what
each NDI dataset contains. Any discrepancy between what the tutorial
prints and what NDI Cloud surfaces (workspace panel, chat answer) is a
parity bug we must fix.

Tutorial source-of-truth doc:
**`apps/web/docs/specs/2026-05-14-tutorial-ground-truth.md`** —
captures the numbers each tutorial prints on the canonical datasets
(Bhar, Haley, Francesconi).

---

## Why run this smoke

The chatbot can give plausible-sounding answers that are wrong (e.g.
the May 2026 "Bhar tree shrew" factual error in the system prompt
example — Bhar is C. elegans, not tree shrew). The tutorial parity
smoke catches these because every claim the chat or workspace makes
about a dataset MUST match what the tutorial prints when run on that
dataset's actual data.

We've now caught several real bugs via this smoke:
- EPOCHS=0 on Francesconi (backend epoch-class fallback chain too
  narrow) — fix shipped 2026-05-15.
- BehavioralCompare exact-substring miss (`OpenArmNorthEntries` vs
  `ElevatedPlusMaze_OpenArmNorth_Entries` underscore) — fix planned
  Stream 5.1.
- Hardcoded numerics in system prompt — fixed in Stream 1 T1.2.

---

## What to smoke

For each of the three canonical datasets, drive the workspace AND
chat through the questions the tutorial answers.

### Dataset 1 — Bhar (`69bc5ca11d547b1f6d083761`)

Tutorial: long-term-memory transfer in *C. elegans*.

Expected truths (from tutorial ground-truth):
- 11 document classes
- 5314 subjects, all strain N2 (WBStrain:00000001)
- 50 figure panels across Fig 1B → 6 + supplementary
- Treatment table: 11 rows × 10 cols (heat + isoamylol)
- imageStacks: 564 total (3 in selected condition)
- ontologyTableRow: 5297 total

Smoke questions:
| Question | Expected answer | Surface to test |
|---|---|---|
| "How many subjects in Bhar's dataset?" | 5,314 | chat + workspace DatasetStructure |
| "What strains are represented?" | 1 strain (N2) | chat |
| "How many figure conditions?" | 50 panels | chat |
| "Show me the treatment timeline." | 11 treatments (heat + isoamylol pulses) | workspace TreatmentTimeline panel |

### Dataset 2 — Haley (`682e7772cdf3f24938176fac`)

Tutorial: accept-reject foraging in *C. elegans*.

Expected truths:
- 15 document classes
- 1656 subjects
- Strain filter `StrainName contains PR811` → 76 subjects
- Bacterial plates: 6206 behavior, 100 cultivation, 3312 subject-plate map
- Per-subject patch encounters: 21 rows × 42 cols (for the selected subject)

Smoke questions:
| Question | Expected answer | Surface |
|---|---|---|
| "How many subjects in Haley's foraging dataset?" | 1,656 | chat + workspace |
| "Subjects with strain PR811?" | 76 | chat (filter via `query_documents` or `ndi_query`) |
| "Show the patch encounter map for subject S1." | Heatmap renders | workspace SignalViewer or fetch_image |

### Dataset 3 — Francesconi (Dabrowska lab) (`67f723d574f5f79c6062389d`)

Tutorial: BNST patch-clamp + EPM + Saline/CNO chemogenetic dataset.

Expected truths:
- 215 subjects
- 606 probes (3 types: stimulator / patch-Vm / patch-I)
- 4887 epochs
- EPM table: 45 rows × 51 cols
- Saline vs CNO on `ElevatedPlusMaze_OpenArmNorthEntries`:
  - Saline n=22, mean 5.86, median 5.0, std 3.21, min 2, max 15
  - CNO n=23, mean 5.09, median 5.0, std 3.06, min 0, max 12

Smoke questions:
| Question | Expected answer | Surface |
|---|---|---|
| "How many subjects?" | 215 | chat + workspace |
| "What probe types?" | stimulator, patch-Vm, patch-I (3 types, 606 total rows) | chat (`query_documents className=probe`) |
| "Compare EPM open-arm entries Saline vs CNO." | matches the n/mean/std table above | chat (`tabular_query`) + workspace BehavioralCompare |
| "Show treatment timeline." | gantt chart with Saline/CNO bars per subject | workspace TreatmentTimeline |

---

## How to run the smoke

### Manual

1. Open the preview URL from `apps/web/docs/specs/2026-05-15-master-execution-plan.md` §Orientation in a fresh browser tab.
2. Log in with the test creds (`audri+test@walthamdatascience.com / remhuz-ruwfy4-jiGcen`).
3. For each dataset above:
   - Open the workspace at `/my/workspace/<dataset-id>`.
   - Click through each relevant panel. Verify the numbers match the table above.
   - Open `/ask` (or the future `/my/ask`). Ask each smoke question. Verify the answer + citations match.
4. File any discrepancy as a bug, fix it, re-run.

### Automated (Playwright)

`apps/web/tests/e2e/workspace-tutorial-parity.spec.ts` covers the
workspace side of the smoke. It auto-skips without the env vars
(`PLAYWRIGHT_PREVIEW_URL`, `PLAYWRIGHT_TEST_EMAIL`,
`PLAYWRIGHT_TEST_PASSWORD`) set, so it doesn't run in vanilla `pnpm
test`. To run locally:

```bash
PLAYWRIGHT_PREVIEW_URL=https://… \
PLAYWRIGHT_TEST_EMAIL=audri+test@walthamdatascience.com \
PLAYWRIGHT_TEST_PASSWORD=… \
pnpm playwright test workspace-tutorial-parity
```

The chat-side smoke is currently MANUAL. Stream 6 adds an LLM-output
replay harness at `apps/web/tests/replay/` that will compare chat
answers against expected truths.

---

## What to do when the smoke catches a parity bug

1. Reproduce the bug locally.
2. Identify the root cause (chat tool returning wrong numbers? panel
   misreading the response? backend endpoint missing a class?).
3. Fix the root cause — NOT the symptom. If `tabular_query` says zero
   rows, don't just retry; figure out which column it's looking at and
   why the substring match misses.
4. Add a regression test if possible (unit, integration, or replay).
5. Document the fix in the commit message + this doc's update history
   if the bug exposed a category of parity issue worth remembering.

---

## Update history

| Date | Change |
|---|---|
| 2026-05-15 | Extracted from `apps/web/docs/specs/2026-05-14-pre-compact-handoff-v2.md` per Stream 4.6. |
