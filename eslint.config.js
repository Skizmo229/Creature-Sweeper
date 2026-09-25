// ESLint, flat config. Correctness rules only, plus two size warnings that are the
// readability measure Milestone 3 set (docs/refactoring-plan.md, section 9). `npm run lint`
// allows no warnings, so they fail the check as an error does.
// Formatting is Prettier's job and no style rule is enabled here.

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'release/**', 'node_modules/**', '.claude/**', 'design/**', 'public/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.js', '**/*.mjs'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // The size warnings. Blank lines are skipped and comments are not, because a function
      // that takes 150 lines to scroll past is 150 lines long whatever fills them; moving the
      // rationale into docs/ is how a comment-heavy one gets under the bar.
      'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true }],
      'max-lines': ['warn', { max: 600, skipBlankLines: true }],
    },
  },
  {
    // A test file is one long describe; its length is not the measure.
    files: ['test/**/*.ts'],
    rules: { 'max-lines-per-function': 'off', 'max-lines': 'off' },
  },
);
