import vue from 'eslint-plugin-vue';
import security from 'eslint-plugin-security';
import prettier from 'eslint-plugin-prettier';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.js', '**/*.ts', '**/*.vue'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parser: typescriptParser,
    },
    plugins: {
      vue,
      security,
      prettier,
      '@typescript-eslint': typescript,
    },
    rules: {
      ...vue.configs['flat/essential'].rules,
      ...security.configs.recommended.rules,
      'prettier/prettier': 'error',
      'vue/multi-word-component-names': 'off',
      'no-console': 'warn',
      'no-debugger': 'warn',
      'no-empty': 'warn',
      'no-extra-boolean-cast': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Exclude generated files
  {
    files: ['**/*.d.ts'],
    ignores: ['**/.nuxt/**', '**/.output/**'],
  },
];
