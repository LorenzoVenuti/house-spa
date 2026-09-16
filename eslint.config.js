import eslint from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist', 'node_modules'] },
  eslint.configs.recommended,
  { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tsParser, globals: { document: 'readonly', localStorage: 'readonly', crypto: 'readonly', structuredClone: 'readonly', HTMLSelectElement: 'readonly', HTMLButtonElement: 'readonly', HTMLInputElement: 'readonly', HTMLTextAreaElement: 'readonly', React: 'readonly' } }, plugins: { '@typescript-eslint': tsPlugin, 'react-hooks': reactHooks }, rules: { ...tsPlugin.configs.recommended.rules, ...reactHooks.configs.recommended.rules } },
];
