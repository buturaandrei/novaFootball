import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      // il type-check di tsc copre già gli unused (noUnusedLocals)
      '@typescript-eslint/no-unused-vars': 'off',
      // pattern legittimo nei sistemi di gioco (eventi opzionali, debug handle)
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { window: 'readonly', document: 'readonly', performance: 'readonly' },
    },
    rules: {
      // gli script playwright valutano codice nel browser
      'no-undef': 'off',
    },
  },
  { ignores: ['dist/', 'node_modules/'] },
);
