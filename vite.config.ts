import { configDefaults, defineConfig } from 'vitest/config'

// `base` must match the GitHub Pages project subpath:
// https://systemslibrarian.github.io/crypto-lab-what-is-pqc/
export default defineConfig({
  base: '/crypto-lab-what-is-pqc/',
  test: {
    // Colocated unit tests only. The Playwright specs in e2e/ must NOT be
    // collected here (template §1): Vitest would try to run them as unit tests
    // and the a11y gate would stop being a gate.
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
