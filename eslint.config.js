// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

// Enforces 21_ARCHITECTURE §3: dependency direction is UI -> Application -> Core -> Adapters,
// with Adapters implementing interfaces Core/Application define (dependency inversion).
// An import of a UI symbol into Core or Application is an automatic architectural review failure
// (21 §3) — this config makes that a build failure instead of a code-review judgment call.
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { boundaries },
    settings: {
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
);
