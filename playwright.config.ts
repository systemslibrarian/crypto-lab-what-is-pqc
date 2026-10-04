import { defineConfig, devices } from '@playwright/test'

/**
 * Everything runs against the production build served by `vite preview`, so what
 * passes here is what ships.
 *
 * PORT 4212 IS ASSIGNED, NOT CHOSEN. It is unique to this lab across the fleet and
 * is never the Vite default 4173. A shared port means `reuseExistingServer`
 * silently tests whatever is already listening — which has really happened in this
 * fleet, and during a §4.1c mutation check it can scan an UNMUTATED checkout left
 * running by a previous run, making a real kill look like a survivor and sending
 * someone to fix a check that works. `--strictPort` is the other half: without it
 * Playwright takes the next free port and the collision stops being visible at
 * all. Pin it with `node tools/port-sync.js` from the catalog repo.
 *
 * THREE PROJECTS, THREE SUBJECTS:
 *   a11y      the axe WCAG gate, at 1280, 390 and 320.
 *   claims    what the page SAYS and CONCLUDES (§4.1b, §4.1d).
 *   coverage  that every verdict marker on screen has a recorded mutation (§4.1c).
 *
 * They are separate projects so a failure names the right subject. A copy edit
 * must not fail a step called "Accessibility gate" — that is the mistake §4.1a
 * exists to prevent, and it cost crypto-lab-mceliece-gate three days of a live
 * site serving claims its own `main` had already corrected.
 */
const PORT = 4212
const BASE = `http://localhost:${PORT}/crypto-lab-what-is-pqc/`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // The axe driver walks fourteen states and runs nine oracles at each, three
  // times over (1280 / 390 / 320).
  timeout: 1_800_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  // NOT the default `test-results`: `outputDir` is wiped when a run starts, which
  // would race globalSetup's truncation of the observation sink that lives beside
  // it. See e2e/observations.ts.
  outputDir: 'test-results/artifacts',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: BASE,
    colorScheme: 'dark', // dark is the only theme
  },
  projects: [
    { name: 'a11y', testMatch: /a11y\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'claims', testMatch: /claims\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'coverage',
      testMatch: /verdict-coverage\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Build before serving. `vite preview` serves whatever is already in dist/, so
    // without the build in front a run tests a stale bundle — and a build that
    // FAILS leaves the previous good bundle in place, so the whole suite passes
    // green against source that no longer compiles. That silently invalidates
    // mutation checking, which is the only way we prove a test has teeth.
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
