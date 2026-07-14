// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

// Enforces 21_ARCHITECTURE §3: dependency direction is UI -> Application -> Core -> Adapters,
// with Adapters implementing interfaces Core/Application define (dependency inversion).
// An import of a UI symbol into Core or Application is an automatic architectural review failure
// (21 §3) — this config makes that a build failure instead of a code-review judgment call.
//
// svelte.configs['flat/recommended'] + the `.svelte` parserOptions block below (ADR-006) extend
// this same boundary enforcement into <script> blocks inside .svelte files — the rule is not
// just a `.ts` convention, it covers every place UI code could import Core/Application.
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    plugins: { boundaries },
    settings: {
      // Without an explicit TS-aware resolver, NodeNext-style `.js`-suffixed imports between
      // `.ts` files silently fail to resolve, and eslint-plugin-boundaries ignores unresolved
      // imports — meaning the boundary rule never actually fired. Found empirically via a
      // deliberate violation probe during the first UI->Application integration (the exact
      // "mandatory verification point" APPLICATION_LAYER_REVIEW called out).
      'import/resolver': {
        typescript: { alwaysTryTypes: true },
      },
      'boundaries/elements': [
        { type: 'core', pattern: 'src/core/**' },
        { type: 'application', pattern: 'src/application/**' },
        { type: 'adapters', pattern: 'src/adapters/**' },
        { type: 'ui', pattern: 'src/ui/**' },
      ],
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'core', allow: ['core'] },
            { from: 'application', allow: ['core', 'application'] },
            // Adapters implement port interfaces defined by Application (e.g. StorageAdapter,
            // MapProvider) and serialize Core types (e.g. Shape) — never the reverse.
            { from: 'adapters', allow: ['core', 'application', 'adapters'] },
            { from: 'ui', allow: ['core', 'application', 'adapters', 'ui'] },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.svelte'],
      },
    },
  },
  {
    // Core/Application are Node/test-context TS (no DOM); only ui code runs in the browser and
    // needs its globals (window, HTMLDivElement, ResizeObserver, …) recognized by ESLint.
    files: ['src/ui/**/*.{ts,svelte}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    ignores: ['dist-ui/**', 'dist/**'],
  },
);
