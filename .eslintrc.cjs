module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {},
  overrides: [
    {
      files: ['packages/engine/src/**/*.ts', 'packages/bot/src/**/*.ts'],
      rules: {
        // Engine & bot must be pure/platform-neutral & deterministic
        'no-restricted-globals': ['error', 'window', 'document', 'localStorage'],
        'no-restricted-properties': [
          'error',
          { object: 'Date', property: 'now', message: 'Engine is pure: pass time via events.' },
          { object: 'Math', property: 'random', message: 'Engine is pure: use seeded rng.ts.' }
        ]
      }
    }
  ]
}
