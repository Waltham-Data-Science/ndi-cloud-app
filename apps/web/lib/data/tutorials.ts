/**
 * Allowlist of dataset IDs that have published tutorials.
 *
 * Two datasets currently ship companion tutorials (pre-rendered MATLAB
 * Live Scripts + matching Python notebooks):
 *
 *   - 67f723d574f5f79c6062389d
 *     Fear-Potentiated Startle / Elevated Plus Maze (Dabrowska Lab)
 *   - 682e7772cdf3f24938176fac
 *     C. elegans behavior + E. coli fluorescence (Chalasani Lab)
 *
 * The tutorials live in the public S3 bucket
 * `ndi-cloud-tutorials.s3.us-east-2.amazonaws.com`. Add a dataset
 * here when its tutorial files are uploaded; the surface flow is:
 *
 *   1. Add the dataset id to `DATASETS_WITH_TUTORIALS` below.
 *   2. The Tutorials tab automatically appears in `DatasetTabs.tsx`
 *      for that dataset only (see `hasTutorial(id)` consumer there).
 *   3. The Tutorials page (`app/(app)/datasets/[id]/tutorials/page.tsx`)
 *      uses the same allowlist to decide between the iframe view and
 *      a "no tutorial" empty state for direct navigations.
 *
 * Keeping the allowlist in one module — instead of duplicated as
 * inline literals at each consumer — means a future "expose the
 * tutorial-having datasets via an API endpoint" change is a one-file
 * swap (this file becomes a hook over a fetched list).
 *
 * The id format is the cloud's Mongo ObjectId hex (24 chars), matching
 * what `useDataset`, the catalog, and the document-detail URL all use.
 */
export const DATASETS_WITH_TUTORIALS: ReadonlySet<string> = new Set([
  '67f723d574f5f79c6062389d',
  '682e7772cdf3f24938176fac',
]);

/**
 * `true` when the given dataset has a published tutorial. Pure
 * function over the allowlist above — safe to call during render
 * (no I/O).
 */
export function hasTutorial(datasetId: string | null | undefined): boolean {
  if (!datasetId) return false;
  return DATASETS_WITH_TUTORIALS.has(datasetId);
}
