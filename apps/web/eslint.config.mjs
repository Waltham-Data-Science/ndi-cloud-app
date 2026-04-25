import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

/**
 * Flat config for ESLint 9 + eslint-config-next 16. Next 16 ships flat-config-
 * native exports — no FlatCompat needed.
 *
 * Phase boundary enforcement: data-browser feature components must not pull
 * in MUI. (MUI stays scoped to (marketing) / login surfaces only.) The rule
 * lives here as `no-restricted-imports`; it applies repo-wide because flat
 * config doesn't have a clean per-directory predicate. The intent is
 * documented in CLAUDE.md and reinforced by code review.
 */
const config = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      'react/jsx-no-target-blank': 'error',
      // Allow `_`-prefixed names for intentionally-discarded destructure
      // rests + unused function args. Standard ESLint convention; lets
      // patterns like `const { foo: _foo, ...rest } = props` (extract to
      // strip from the spread, but don't reference) compile clean.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    /*
     * Phase boundary enforcement: data-browser feature components must
     * not pull in MUI. MUI is permitted in `components/marketing/` for
     * the responsive nav menu where its a11y lift is real, and in
     * `app/(marketing)/` auth pages (Phase 2b: Formik forms wrap MUI
     * inputs). Everywhere else — and especially `components/app/`
     * (the data-browser feature surface) and `components/ui/`
     * (cross-cutting headless primitives) — uses Tailwind utility
     * classes + the headless primitives in `components/ui/`.
     *
     * Flat-config glob targeting limits the rule to the directories
     * where MUI is wrong; the marketing surfaces are exempt by virtue
     * of not matching this glob.
     */
    files: ['components/app/**/*.{ts,tsx}', 'components/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@mui/*'],
              message:
                'MUI imports are not allowed in components/app/ or components/ui/. Use the headless primitives in components/ui/ (Button, Modal, etc.). MUI is permitted only in components/marketing/ and the (marketing) auth pages.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
];

export default config;
