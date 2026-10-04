import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The RUNTIME denominator for the verdict rules.
 *
 * `e2e/verdict-mutations.json` records, for every mutation, the test and the claim
 * that kill it. The obvious way to check those records are real is to scan the
 * spec's source text for the marker id — and that check is defeated three ways,
 * each of which has actually been used against this pattern elsewhere in the
 * fleet: comment the call out and the substring survives inside the comment; keep
 * the call but feed it values read off the page in the same test; rewrite the
 * killing assertion and let an unrelated call elsewhere in the file satisfy a
 * file-granular rule. A MENTION IS NOT AN ASSERTION.
 *
 * So the helpers record what they actually EXECUTED. Every `expectVerdict` call
 * that passes appends one line naming the test that ran it, the marker it
 * asserted, and the claim it asserted — and the coverage rule is checked against
 * that file rather than against source text.
 *
 * Playwright runs tests in separate worker processes, so a module-level `Set`
 * aggregates nothing. The sink is therefore a file, appended line-at-a-time with
 * `O_APPEND` (atomic for writes this small), truncated by `globalSetup` at the
 * start of every run and read back by `globalTeardown` after the last test. Each
 * line carries the run id `globalSetup` minted, so a sink that somehow survived
 * truncation cannot satisfy the rule with a previous run's observations.
 *
 * It lives under `test-results/` but NOT under `outputDir` — Playwright wipes
 * `outputDir` when a run starts, which would race the truncation above.
 * `playwright.config.ts` points `outputDir` at `test-results/artifacts` for exactly
 * that reason.
 */
export const OBSERVATIONS_PATH = fileURLToPath(
  new URL('../test-results/verdict-observations.ndjson', import.meta.url),
)

/** Set by `globalSetup`, read by the helpers and by `globalTeardown`. */
export const RUN_ID_ENV = 'WHAT_IS_PQC_VERDICT_RUN_ID'

export interface Observation {
  run: string
  test: string
  id: string
  claim: string
}

/**
 * One claim, in one canonical form, so a record in `verdict-mutations.json` and an
 * argument passed at runtime compare byte-for-byte. Keys are sorted; a RegExp
 * becomes its own literal source, which is what the registry stores.
 *
 * AND EVERY 16-HEX-CHARACTER RUN BECOMES `<hex16>`. This lab runs real
 * cryptography, so the secret prefixes a claims test reads off the page and feeds
 * back into its own assertion are different on every run — a registry pinning the
 * literal bytes would be a registry nothing could ever match. What survives
 * normalisation is the SHAPE of the claim: that the test asserted the verdict
 * quotes two secret prefixes alongside a fixed string. That shape is the thing
 * worth pinning, and it is still specific enough that rewriting the assertion
 * stops matching the record.
 */
const HEX16 = /\b[0-9a-f]{16}\b/g

function normaliseValue(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(HEX16, '<hex16>')
  if (Array.isArray(value)) return value.map(normaliseValue)
  if (value instanceof RegExp) return String(value)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = normaliseValue((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

export function canonicalClaim(claim: Readonly<Record<string, unknown>>): string {
  const normalised: Record<string, unknown> = {}
  for (const key of Object.keys(claim).sort()) {
    const value = claim[key]
    if (value === undefined) continue
    normalised[key] = normaliseValue(value)
  }
  return JSON.stringify(normalised)
}

export function runId(): string {
  return process.env[RUN_ID_ENV] ?? ''
}

export function resetObservations(id: string): void {
  mkdirSync(dirname(OBSERVATIONS_PATH), { recursive: true })
  writeFileSync(OBSERVATIONS_PATH, '')
  process.env[RUN_ID_ENV] = id
}

export function recordObservation(observation: Observation): void {
  mkdirSync(dirname(OBSERVATIONS_PATH), { recursive: true })
  appendFileSync(OBSERVATIONS_PATH, `${JSON.stringify(observation)}\n`)
}

/**
 * The id the claims project stamps when it starts.
 *
 * `globalTeardown` has to tell three situations apart: the claims project ran and
 * asserted; the claims project ran and asserted NOTHING (the rule's own failure);
 * and the claims project was never selected, as in `npm run test:a11y`, where the
 * rule was not asked. Playwright's `FullConfig.projects` does NOT narrow to the
 * `--project` list — measured, not assumed: a `--project=coverage` run reports all
 * three projects — so the selection cannot be read from the config. A sentinel
 * written by the project itself can only appear when that project actually ran.
 */
export const CLAIMS_RAN = '__claims-project-ran__'

export function recordClaimsProjectRan(): void {
  recordObservation({ run: runId(), test: CLAIMS_RAN, id: CLAIMS_RAN, claim: '' })
}

/** Every observation this run wrote. Lines from any other run are discarded. */
export function readObservations(id: string): Observation[] {
  let raw = ''
  try {
    raw = readFileSync(OBSERVATIONS_PATH, 'utf8')
  } catch {
    return []
  }
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Observation)
    .filter((observation) => observation.run === id)
}
