#!/usr/bin/env node
// Applies, reverts, or JUDGES the recorded 4.1c mutations in
// e2e/verdict-mutations.json.
//
//   node scripts/mutate.mjs list
//   node scripts/mutate.mjs apply <id>
//   node scripts/mutate.mjs revert <id>
//   node scripts/mutate.mjs run [id...]      <- the judging loop
//
// WHY A JUDGING LOOP AND NOT JUST apply/revert
//
// apply/revert leaves the judgement to a person, and the judgement is the part
// that goes wrong. A mutated run can go red for reasons that are not the verdict:
// a build error, a server that never started, a port answering from an unmutated
// checkout. Each of those looks exactly like a kill in a terminal and is not one.
// Worse, a patch whose anchor no longer matches applies nothing at all, the suite
// stays green, and "the mutation survived" is indistinguishable from "the harness
// does not bite" -- a mistake made twice in this fleet before anything checked
// for it.
//
// THE FOUR RULES A KILL HAS TO CLEAR, all enforced below:
//
//   1. the owning test PASSED unmutated, in this same run;
//   2. the patch actually CHANGED the file (anchor unique, bytes different, and
//      the round trip back to the original byte-for-byte);
//   3. the run served the MUTATED code -- proved two ways, because one is not
//      enough: the built bundle's hash must move, and the failure must not match
//      a shape that means the code never ran at all;
//   4. the failure is that marker's OWN named assertion, not the suite going red.
//
// A patch that does not compile is DOES NOT BUILD and is never a kill. Fix the
// patch -- `|| true` rather than deleting a used local -- and re-run.
//
// The run happens in an isolated `git archive HEAD` tree with node_modules
// symlinked, so nothing is judged against the working copy and a crash cannot
// strand an inverted condition in a file that also holds real work. CI=1 forces
// playwright.config.ts's `reuseExistingServer: !process.env.CI` to false, so port
// 4212 cannot be answered by a server an earlier, unmutated run left up.
//
// THE EVIDENCE IS WRITTEN BY THIS SCRIPT, NEVER TYPED. Every `observed` record in
// e2e/verdict-mutations.json is produced by the run that produced it, carrying the
// three bundle hashes, the tests that failed, and the sha the tree was archived
// from. A paragraph describing a run is the author's side of the claim rather than
// the run's; `git diff e2e/verdict-mutations.json` after a run is the run's.
//
// Enforcement does not depend on those records. e2e/global-teardown.ts already
// fails any run in which a recorded kill's assertion did not execute, so an
// unperformed record cannot sit in this file looking performed. The records are
// archival -- they are what a reader of the repository can check without running
// anything -- which is the choice crypto-lab-privacy-pass made, for the same
// reason.

import { execFileSync, execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '')
const REGISTRY = join(root, 'e2e', 'verdict-mutations.json')
const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'))
const [command, ...rest] = process.argv.slice(2)

if (command === 'list' || !command) {
  for (const [key, entry] of Object.entries(registry.mutations)) {
    console.log(`${key}\n  ${entry.file}`)
    for (const [marker, kill] of Object.entries(entry.kills ?? {})) {
      console.log(`  kills ${marker} in: ${kill.test}`)
    }
    if (entry.observed) {
      console.log(`  last observed ${entry.observed.at} -> ${entry.observed.verdict}`)
    }
    console.log(`  ${entry.why}\n`)
  }
  process.exit(0)
}

/* ---- apply / revert: one edit, in the working tree ------------------------ */
if (command === 'apply' || command === 'revert') {
  const id = rest[0]
  const entry = registry.mutations[id]
  if (!entry) {
    console.error(`unknown mutation: ${id}`)
    process.exit(2)
  }
  const path = join(root, entry.file)
  const source = readFileSync(path, 'utf8')
  const [from, to] = command === 'apply' ? [entry.find, entry.replace] : [entry.replace, entry.find]
  const occurrences = source.split(from).length - 1
  if (occurrences !== 1) {
    console.error(`refusing: ${entry.file} matched ${occurrences}x, want exactly 1`)
    process.exit(2)
  }
  writeFileSync(path, source.replace(from, to))
  console.log(`${command} ${id} -> ${entry.file}`)
  process.exit(0)
}

if (command !== 'run') {
  console.error(`unknown command: ${command}. Try list, apply, revert or run.`)
  process.exit(2)
}

/* ---- run: the judging loop ----------------------------------------------- */

const ids = rest.length ? rest : Object.keys(registry.mutations)
const unknown = ids.filter((id) => !registry.mutations[id])
if (unknown.length) {
  console.error(`unknown mutation(s): ${unknown.join(', ')}`)
  process.exit(2)
}

const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' }).trim()

// `git archive HEAD` cannot see uncommitted work, so a dirty tree would produce
// results about a tree nobody has. The ledger itself is exempt, because writing
// the evidence back is the last thing this script does and re-running afterwards
// must not be blocked by its own output.
const dirty = git('status', '--porcelain', '--untracked-files=no')
  .split('\n')
  .filter((line) => line.trim() && !line.endsWith('e2e/verdict-mutations.json'))
  .join('\n')
if (dirty && !process.env.MUTATION_ALLOW_DIRTY) {
  console.error('Refusing to run: uncommitted changes to tracked files.\n')
  console.error(dirty)
  console.error('\nThe isolated tree is archived from HEAD and would not contain them.')
  console.error('Commit first. MUTATION_ALLOW_DIRTY=1 overrides, knowing that.')
  process.exit(2)
}
const sha = git('rev-parse', 'HEAD')

/* Rule 2, checked for every selected patch BEFORE any is applied. An unreversible
   patch strands a mutated file and turns every later result into a verdict about
   that file rather than about its own mutation. */
const invalid = []
for (const id of ids) {
  const entry = registry.mutations[id]
  const text = readFileSync(join(root, entry.file), 'utf8')
  const anchors = text.split(entry.find).length - 1
  if (anchors !== 1) {
    invalid.push(`${id}: find occurs ${anchors} times in ${entry.file}, expected 1`)
    continue
  }
  const after = text.replace(entry.find, entry.replace)
  if (after === text) invalid.push(`${id}: the patch is a no-op, it would not change ${entry.file}`)
  else if (after.split(entry.replace).length - 1 !== 1) {
    invalid.push(`${id}: replace occurs more than once after applying, so it cannot be reverted`)
  }
}
if (invalid.length) {
  console.error('Refusing to run: these patches cannot make the round trip.\n')
  for (const line of invalid) console.error(`  ${line}`)
  process.exit(2)
}

const TREE = mkdtempSync(join(tmpdir(), 'what-is-pqc-mutation-'))
console.log(`isolated tree: ${TREE}`)
console.log(`archived from: ${sha.slice(0, 7)}`)
console.log(`${ids.length} patches make the round trip.\n`)
execSync(`git -C ${root} archive HEAD | tar -x -C ${TREE}`, { stdio: 'pipe' })
symlinkSync(join(root, 'node_modules'), join(TREE, 'node_modules'))

const sh = (cmd) =>
  execSync(cmd, {
    cwd: TREE,
    stdio: 'pipe',
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
    maxBuffer: 64 * 1024 * 1024,
  })

const DIST = join(TREE, 'dist', 'assets')
function bundleHash() {
  if (!existsSync(DIST)) return null
  const h = createHash('sha256')
  for (const f of readdirSync(DIST).sort()) h.update(f).update(readFileSync(join(DIST, f)))
  return h.digest('hex').slice(0, 12)
}
const md5 = (rel) => createHash('md5').update(readFileSync(join(TREE, rel))).digest('hex').slice(0, 12)

function build() {
  try {
    sh('npm run build')
    return true
  } catch {
    return false
  }
}

const ESC = String.fromCharCode(27)
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, 'g')
const strip = (s) => s.replace(ANSI, '')

/** Rule 3's second half. Red for one of these reasons means the code never ran. */
const NOT_A_KILL = [
  { pattern: /error TS\d+|Build failed|Transform failed|Could not resolve/i, label: 'build error' },
  {
    pattern: /webServer.*did not start|Timeout .* exceeded while running "beforeAll"/i,
    label: 'server never started',
  },
  { pattern: /net::ERR_CONNECTION_REFUSED/i, label: 'nothing served on the port' },
]
const notAKill = (output) =>
  NOT_A_KILL.find(({ pattern }) => pattern.test(strip(output)))?.label ?? null

/* The WHOLE claims and coverage suite, never a `-g` on one test.
 *
 * e2e/global-teardown.ts fails the run when any recorded kill in
 * verdict-mutations.json did not execute, which is the mechanism that makes an
 * unperformed record impossible to leave lying around. A single-test run therefore
 * CANNOT exit 0 here: the named test passes and the teardown fails on every other
 * record. So the suite runs whole, once per phase, and the per-test answer is read
 * out of the reporter. */
function runSuite() {
  const cmd = 'npx playwright test --project=claims --project=coverage --reporter=list --retries=0'
  try {
    return { failed: false, output: sh(cmd) }
  } catch (err) {
    return { failed: true, output: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

/** Failing test titles, as the list reporter prints them: `  N) path:line > title`. */
function failingTitles(output) {
  const DASHES = '─'
  const re = new RegExp(`^\\s*\\d+\\)\\s+(.+?)(?:\\s*[${DASHES}-]{3,})?\\s*$`, 'gm')
  return [...strip(output).matchAll(re)].map((m) => m[1].trim())
}

function apply(entry, forward) {
  const [from, to] = forward ? [entry.find, entry.replace] : [entry.replace, entry.find]
  const path = join(TREE, entry.file)
  const before = readFileSync(path, 'utf8')
  if (before.split(from).length - 1 !== 1) throw new Error(`${entry.file}: anchor no longer unique`)
  const after = before.replace(from, to)
  if (after === before) throw new Error('the patch produced an identical file: it did not apply')
  writeFileSync(path, after)
}

console.log('building the baseline in the isolated tree...')
if (!build()) {
  console.error('The baseline build fails in the isolated tree. Nothing below would mean anything.')
  rmSync(TREE, { recursive: true, force: true })
  process.exit(2)
}
const baselineHash = bundleHash()
console.log(`baseline bundle ${baselineHash}\n`)

console.log('running the unmutated baseline suite...')
const baseline = runSuite()
if (baseline.failed) {
  console.error('The unmutated suite does not pass in the isolated tree. Nothing below would mean')
  console.error('anything: a mutation "caught" by an already-red suite is caught by nothing.\n')
  console.error(strip(baseline.output).split('\n').slice(-25).join('\n'))
  rmSync(TREE, { recursive: true, force: true })
  process.exit(2)
}
const baselineCount = (strip(baseline.output).match(/(\d+)\s+passed/) || [])[1] ?? '?'
console.log(`baseline suite PASSED (${baselineCount} tests)\n`)

const startedAt = new Date().toISOString()
const results = []
for (const id of ids) {
  const entry = registry.mutations[id]
  const markers = Object.entries(entry.kills ?? {})
  process.stdout.write(`${id.padEnd(30)} `)
  try {
    const beforeMd5 = md5(entry.file)
    apply(entry, true)
    const built = build()
    const mutatedHash = built ? bundleHash() : null
    const mutated = built ? runSuite() : { failed: false, output: '' }
    const failed = built ? failingTitles(mutated.output) : []
    const runs = markers.map(([marker, k]) => [
      marker,
      { failed: failed.some((t) => t.includes(k.test)), output: mutated.output, test: k.test },
    ])
    apply(entry, false)
    build()
    const restoredHash = bundleHash()
    if (md5(entry.file) !== beforeMd5) {
      console.log('NOT RESTORED')
      console.error(`\n${id}: ${entry.file} did not return to md5 ${beforeMd5}. Aborting.`)
      rmSync(TREE, { recursive: true, force: true })
      process.exit(2)
    }

    const shapes = runs.map(([, r]) => notAKill(r.output)).filter(Boolean)
    const survived = runs.filter(([, r]) => !r.failed).map(([m]) => m)
    const wrongName = runs
      .filter(([m, r]) => r.failed && !strip(r.output).includes(m))
      .map(([m]) => m)

    const verdict = !built
      ? 'DOES NOT BUILD'
      : mutatedHash === baselineHash
        ? 'BUNDLE UNCHANGED'
        : shapes.length
          ? `NOT A KILL (${shapes[0]})`
          : survived.length
            ? `SURVIVED (${survived.join(', ')})`
            : wrongName.length
              ? `FAILED FOR THE WRONG REASON (${wrongName.join(', ')})`
              : restoredHash !== baselineHash
                ? 'NOT RESTORED'
                : 'KILLED'
    results.push({
      id,
      verdict,
      markers: markers.map(([m]) => m),
      bundles: { baseline: baselineHash, mutated: mutatedHash, restored: restoredHash },
      failedTitles: failed,
    })
    console.log(
      verdict === 'KILLED'
        ? `KILLED  ${baselineHash} -> ${mutatedHash} -> ${restoredHash}  markers: ${markers
            .map(([m]) => m)
            .join(', ')}`
        : verdict,
    )
  } catch (err) {
    console.log(`ERROR  ${err.message}`)
    console.error(
      '\nAborting: a mutated file left in place makes every later verdict a statement about it.',
    )
    rmSync(TREE, { recursive: true, force: true })
    process.exit(2)
  }
}

rmSync(TREE, { recursive: true, force: true })

/* ---- the evidence, written by the thing that ran it ---------------------- */
//
// Only for the mutations this invocation actually judged. A run of one mutation
// must not leave the others carrying a record from a run they were not in.
const ledger = JSON.parse(readFileSync(REGISTRY, 'utf8'))
for (const result of results) {
  ledger.mutations[result.id].observed = {
    at: startedAt,
    sha,
    verdict: result.verdict,
    baselineSuite: `${baselineCount} tests passed unmutated`,
    bundle: `${result.bundles.baseline} -> ${result.bundles.mutated ?? 'no build'} -> ${result.bundles.restored}`,
    failingTests: result.failedTitles,
    rules: {
      baselinePassed: true,
      fileChanged: true,
      servedMutatedCode:
        result.bundles.mutated !== null && result.bundles.mutated !== result.bundles.baseline,
      namedTestFailed: result.verdict === 'KILLED',
    },
  }
}
writeFileSync(REGISTRY, `${JSON.stringify(ledger, null, 1)}\n`)
console.log(`\nwrote ${results.length} observed record(s) into e2e/verdict-mutations.json`)

const bad = results.filter((r) => r.verdict !== 'KILLED')
const covered = results.reduce((n, r) => n + r.markers.length, 0)
console.log(
  `${results.length - bad.length}/${results.length} mutations killed, covering ${covered} marker assertions.`,
)
if (bad.length) {
  console.log('\nNot killed:')
  for (const r of bad) console.log(`  ${r.id}: ${r.verdict}`)
  console.log('\nDOES NOT BUILD is a broken PATCH, not a surviving mutation: fix the patch and re-run.')
  console.log('SURVIVED is evidence about the SOURCE or the test, and is the one worth stopping for.')
}
process.exit(bad.length ? 1 : 0)
