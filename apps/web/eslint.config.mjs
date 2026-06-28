import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'dist/**',
      'node_modules/**',
      'drizzle/meta/**',
      'next-env.d.ts',
      'playwright-report/**',
      'test-results/**',
      'tests/integration/migrations/fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { console: 'readonly', process: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // Node-runtime fixture scripts (e.g. tests/e2e/fixtures/mock-nyaa/server.mjs):
  // standalone Node servers spun up inside docker-compose for the e2e stack,
  // not part of the Next bundle. Expose the Node built-in globals they rely on.
  {
    files: ['tests/e2e/fixtures/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
  },
  // CLI helper scripts (e.g. scripts/e2e-run.ts) print to stdout as their
  // primary output channel; console.log is the right tool here.
  {
    files: ['scripts/**/*.{ts,js,mjs,cjs}'],
    rules: {
      'no-console': 'off',
    },
  },
  // Purity guard: src/server/openapi must only import zod + relative siblings
  // so the marketing-website build can import the generator hermetically via tsx.
  {
    files: ['src/server/openapi/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/*', 'next', 'next/*', 'drizzle-orm', 'drizzle-orm/*', 'better-sqlite3'],
              message:
                'src/server/openapi must stay pure (zod + relative imports only) so the website build can import it hermetically.',
            },
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
              message:
                'src/server/openapi must stay pure (zod + relative imports only) so the website build can import it hermetically.',
            },
          ],
        },
      ],
    },
  },
);
