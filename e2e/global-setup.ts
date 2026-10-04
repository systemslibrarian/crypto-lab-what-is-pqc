import { randomUUID } from 'node:crypto'

import { resetObservations } from './observations.js'

/**
 * Mints this run's id and empties the observation sink before the first worker
 * starts, so a file left behind by an earlier run cannot satisfy the runtime
 * coverage rule. The id is exported through the environment, which Playwright
 * hands to every worker it forks after this returns; `globalTeardown` reads the
 * same variable in this process. A sink line carrying any other id is ignored, so
 * the rule survives a truncation that did not happen.
 *
 * Which PROJECTS ran is deliberately not recorded here. `FullConfig.projects` does
 * not narrow to the `--project` list — a `--project=coverage` run reports all three
 * — so reading the selection from the config would have told `globalTeardown` that
 * the claims project ran when it had not, and failed `npm run test:a11y` for a rule
 * it was never asked. The claims project stamps its own sentinel instead; see
 * `CLAIMS_RAN` in e2e/observations.ts.
 */
export default function globalSetup(): void {
  resetObservations(randomUUID())
}
