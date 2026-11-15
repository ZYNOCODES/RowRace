const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
  {
    ignores: ['**/node_modules/**', 'app/android/**', 'app/ios/**', 'app/.expo/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.node, ...globals.es2021, __DEV__: 'readonly' },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['app/**/*.js', 'app/**/*.jsx'],
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: [
      'shared/**/*.js',
      'simulator/**/*.js',
      '*.config.js',
      'app/metro.config.js',
      'app/babel.config.js',
    ],
    languageOptions: { sourceType: 'commonjs' },
  },
  {
    files: ['**/*.test.js'],
    languageOptions: { globals: { ...globals.jest } },
  },
  prettier,
];
