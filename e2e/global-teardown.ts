import { readFileSync } from 'node:fs'

import { CLAIMS_RAN, canonicalClaim, readObservations, runId } from './observations.js'

interface KillRecord {
  test: string
  claim: Record<string, unknown>
}

interface MutationEntry {
  file: string
  find: string
  replace: string
  kills: Record<string, KillRecord>
  why: string
}

/** Separator for composite keys: never appears in a test title or a claim. */
const SEP = ' >>> '

/**
 * The runtime half of the coverage rule.
 *
 * `e2e/verdict-coverage.spec.ts` asks whether every marker the page RENDERS has a
 * recorded mutation. This asks the other question: whether the assertion each
 * mutation record NAMES as its kill actually ran. The answer is read from what
 * `expectVerdict` executed, never from the spec's source text — a mention is not an
 * assertion, and the three ways that scan is defeated are all mentions:
 *
 *   - the call commented out: the substring survives, the call does not, and the
 *     (test, marker) pair is never observed;
 *   - the killing assertion rewritten while an unrelated call elsewhere in the file
 *     keeps the id present: a different pair is observed, or the same pair with a
 *     different claim, and neither matches the record;
 *   - the call kept but fed values read off the page in the same test: on the
 *     unmutated baseline that is byte-identical to a correct assertion and no
 *     runtime rule can separate the two — so the record pins the CLAIM as well as
 *     the pair, and the moment the page moves under the mutation the tautological
 *     argument moves with it and stops matching what was recorded.
 *
 * It runs here rather than in a project with `dependencies:` deliberately: a
 * dependent project is SKIPPED when the project it needs fails, which is exactly
 * the run — a mutation applied — where this answer matters most.
 *
 * IT IS SCOPED TO RUNS THAT INCLUDED THE CLAIMS PROJECT, and the scoping is read
 * from a sentinel that project writes rather than from the config. `npm run
 * test:a11y` runs the accessibility gate alone and legitimately executes no
 * `expectVerdict` call; failing that run for this rule would put a red step named
 * "verdict coverage" on a run that was never asked the question — the same
 * wrong-subject failure §4.1a exists to prevent. What is NOT tolerated is a run in
 * which the claims project DID start and then asserted nothing: that is the rule's
 * own failure and it throws.
 */
export default function globalTeardown(): void {
  const id = runId()
  if (!id) {
    throw new Error(
      'verdict runtime coverage: no run id. e2e/global-setup.ts did not run, so the ' +
        'observation sink was never truncated and nothing it holds can be trusted.',
    )
  }

  const registry = JSON.parse(
    readFileSync(new URL('./verdict-mutations.json', import.meta.url), 'utf8'),
  ) as { mutations: Record<string, MutationEntry> }

  const all = readObservations(id)
  if (!all.some((o) => o.id === CLAIMS_RAN)) {
    console.log(
      'verdict runtime coverage: not asked — the claims project did not run in this invocation. ' +
        'The rule is checked against what ran.',
    )
    return
  }

  const observed = all.filter((o) => o.id !== CLAIMS_RAN)
  if (observed.length === 0) {
    throw new Error(
      'verdict runtime coverage: the claims project ran and executed no expectVerdict call.\n' +
        'Every recorded kill names an assertion that had to be observed executing, and nothing ' +
        'was. Either the claims suite did not run its verdict assertions, or the sink was not ' +
        'written — both are failures of this rule rather than exemptions from it.',
    )
  }

  const seenTriples = new Set(observed.map((o) => `${o.test}${SEP}${o.id}${SEP}${o.claim}`))
  const seenPairs = new Set(observed.map((o) => `${o.test}${SEP}${o.id}`))
  const seenIds = new Set(observed.map((o) => o.id))

  const failures: string[] = []
  for (const [mutation, entry] of Object.entries(registry.mutations)) {
    const kills = Object.entries(entry.kills ?? {})
    if (kills.length === 0) {
      failures.push(`${mutation}: records no kill, so it covers no marker`)
      continue
    }
    for (const [marker, kill] of kills) {
      const claim = canonicalClaim(kill.claim)
      if (seenTriples.has(`${kill.test}${SEP}${marker}${SEP}${claim}`)) continue
      if (seenPairs.has(`${kill.test}${SEP}${marker}`)) {
        failures.push(
          `${mutation} -> ${marker}: "${kill.test}" asserted this marker, but never with the ` +
            `recorded killing claim ${claim}`,
        )
      } else if (seenIds.has(marker)) {
        failures.push(
          `${mutation} -> ${marker}: no expectVerdict for this marker executed in ` +
            `"${kill.test}" — the id is asserted elsewhere in the run, which is not the ` +
            'assertion this record names',
        )
      } else {
        failures.push(`${mutation} -> ${marker}: no expectVerdict for this marker executed at all`)
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `verdict runtime coverage: ${failures.length} recorded kill(s) never ran.\n` +
        'Every mutation in e2e/verdict-mutations.json names the test and the claim that kills\n' +
        'it, and each of those had to be OBSERVED executing in this run.\n\n' +
        failures.map((line) => `  - ${line}`).join('\n'),
    )
  }

  const pinned = Object.values(registry.mutations).reduce(
    (total, entry) => total + Object.keys(entry.kills ?? {}).length,
    0,
  )
  console.log(
    `verdict runtime coverage: ${pinned} recorded kills, every one observed executing ` +
      `(${observed.length} verdict assertions this run)`,
  )
}
