/**
 * Auth-form validation constants.
 *
 * Single source of truth for password / name length bounds enforced by
 * the create-account, reset-forgotten-password, and (future) profile
 * forms. Pre-2026-04-28 these constants were duplicated across each
 * form file, which meant a tweak to the password floor would silently
 * skew between create-account and reset-password — typical for the
 * kind of drift that ships a "min 12" requirement on signup that quietly
 * accepts 8-character resets.
 *
 * The matching server-side enforcement lives in the Cognito UserPool
 * password policy (see PR #12 in `ndi-cloud-node` for the IaC), so
 * these values are the FRONTEND mirror — keep them aligned with the
 * pool whenever ops bumps the policy.
 */

/** Cognito-enforced minimum (PolicyDocument: PasswordPolicy.MinimumLength). */
export const MIN_PASSWORD = 12;

/**
 * Cognito's hard ceiling is 256; we cap at 99 to match the legacy
 * `pages/createAccount/index.tsx` regex `{8,99}` from the WDS port.
 */
export const MAX_PASSWORD = 99;

/** Below 2 chars the system can't disambiguate a name from a placeholder. */
export const MIN_NAME = 2;

/** Cognito custom:displayName / given_name attribute lengths cap at 50. */
export const MAX_NAME = 50;
