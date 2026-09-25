import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const typescriptFiles = ['**/*.ts'];

export default tseslint.config(
  {
    ignores: ['.vscode-test/**', 'dist/**', 'node_modules/**', 'out/**'],
  },
  {
    ...js.configs.recommended,
    files: ['**/*.{cjs,js,mjs}'],
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: typescriptFiles,
  })),
  {
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
