// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import mosaic from 'eslint-plugin-mosaic';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Globals that mean "a platform is present". None of them may appear in core. */
const PLATFORM_GLOBALS = [
  ...['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'location'],
  ...['fetch', 'WebSocket', 'Worker', 'XMLHttpRequest', 'crypto', 'performance'],
  ...['process', 'Buffer', '__dirname', '__filename', 'require', 'global'],
  ...['chrome', 'browser', 'setTimeout', 'setInterval', 'Date'],
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/target/**',
      '**/gen/**',
      '**/.turbo/**',
      'docs/**',
      'dev-vault/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  // ── The architectural boundary ────────────────────────────────────────────
  // packages/core is pure TypeScript: no DOM, no React, no platform imports.
  {
    files: ['packages/core/src/**/*.ts'],
    plugins: { mosaic },
    rules: {
      // Pure packages core may use. Adding one needs an ADR.
      'mosaic/no-platform-imports-in-core': ['error', { allow: ['yjs', 'lib0', 'yaml'] }],
      'no-restricted-globals': [
        'error',
        ...PLATFORM_GLOBALS.map((name) => ({
          name,
          message:
            name === 'Date' || name.startsWith('set')
              ? `Use the Clock adapter instead of '${name}', so tests can control time.`
              : `'${name}' is a platform global. Core reaches platforms only through the adapter interfaces.`,
        })),
      ],
    },
  },

  // UI must not touch storage or the file system directly — it goes through core.
  {
    files: ['packages/ui/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@mosaic/adapters', '@mosaic/adapters/*'],
              message: 'UI receives a Platform via props; only app shells import adapters.',
            },
            {
              group: ['@tauri-apps/*', 'node:*'],
              message: 'Platform APIs belong in packages/adapters.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['packages/adapters/src/**/*.ts', 'apps/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node, chrome: 'readonly' } },
  },
  {
    files: ['**/*.{js,mjs}', '**/*.config.ts', 'apps/*/scripts/**'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
