// Register @testing-library/jest-dom matchers ONLY in a DOM environment (jsdom).
// The app's .tsx tests opt into jsdom via a `// @vitest-environment jsdom` docblock;
// engine/bot tests run under the node default environment. Importing jest-dom in a
// node worker intermittently crashes the pool ("Cannot read properties of undefined
// (reading 'config')"), so load it conditionally.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')
}
