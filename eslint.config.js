import tsParser from '@typescript-eslint/parser'

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/test/**'] },
  {
    files: ['packages/engine/src/**/*.ts', 'packages/bot/src/**/*.ts'],
    languageOptions: { parser: tsParser },
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage'],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Engine is pure: pass time via events.' },
        { object: 'Math', property: 'random', message: 'Engine is pure: use seeded rng.ts.' },
      ],
    },
  },
]
