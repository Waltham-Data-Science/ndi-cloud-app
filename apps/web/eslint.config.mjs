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
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@mui/*'],
              message:
                'MUI imports are not allowed in components/app/. Use the headless primitives in components/ui/ (Button, Modal, etc.). MUI is permitted only in components/marketing/.',
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
