import vue from 'eslint-plugin-vue';
import security from 'eslint-plugin-security';
import prettier from 'eslint-plugin-prettier';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import vueParser from 'vue-eslint-parser';
import globals from 'globals';

const sharedRules = {
  ...security.configs.recommended.rules,
  'prettier/prettier': 'error',
  'vue/multi-word-component-names': 'off',
  'no-console': 'warn',
  'no-debugger': 'warn',
  'no-empty': 'warn',
  'no-extra-boolean-cast': 'warn',
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      // `const { secret, ...rest } = obj` is the standard omit-a-key idiom;
      // the extracted binding is deliberately discarded.
      ignoreRestSiblings: true,
    },
  ],
};

const sharedPlugins = {
  vue,
  security,
  prettier,
  '@typescript-eslint': typescript,
};

export default [
  // Global ignores. A config object containing only `ignores` applies repo-wide;
  // ESLint's flat config does not read .gitignore, so generated output must be
  // listed here or it gets linted.
  {
    ignores: ['.nuxt/**', '.output/**', '.data/**', 'dist/**', 'coverage/**', 'node_modules/**'],
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.ts'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parser: typescriptParser,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: sharedPlugins,
    rules: sharedRules,
  },
  {
    // .vue SFCs need vue-eslint-parser at the top level; the TS parser only
    // handles the <script> block, which it receives via parserOptions.parser.
    files: ['**/*.vue'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parser: vueParser,
      parserOptions: {
        parser: typescriptParser,
        ecmaFeatures: { vue: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: sharedPlugins,
    rules: {
      ...vue.configs['flat/essential'].rules,
      ...sharedRules,
    },
  },
];
