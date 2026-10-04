#!/usr/bin/env node
/*
 * Builds test/fixtures/mlkem768-acvp-subset.json from NIST's published ACVP
 * ML-KEM vector files.
 *
 * WHY A SUBSET, AND WHAT THAT COSTS
 *
 * NIST's two internalProjection.json files are 2.0 MB and carry 240 tests
 * across ML-KEM-512/768/1024. This lab runs ML-KEM-768 only, so shipping both
 * files whole would put 1.9 MB of vectors for parameter sets the lab never
 * mentions into a repository whose entire point is to stay small enough for a
 * newcomer to read.
 *
 * The honesty cost of a subset is real and is paid here two ways. First, every
 * selected test-case object is copied BYTE-FOR-BYTE, with no field dropped,
 * renamed or re-encoded — so the bytes the test suite reads are the bytes NIST
 * published, which is the property that makes a vector a vector. Second, this
 * script is committed and its inputs are pinned by commit and by SHA-256 in
 * test/fixtures/PROVENANCE.md, so the subset can be re-derived and compared
 * rather than taken on trust.
 *
 * Usage (requires a local clone of the upstream vectors; see PROVENANCE.md):
 *   node scripts/extract-acvp-subset.mjs <dir-holding-the-two-upstream-files>
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const src = process.argv[2]
if (!src) {
  console.error('usage: node scripts/extract-acvp-subset.mjs <dir-with-upstream-ACVP-json>')
  process.exit(2)
}

const PARAM_SET = 'ML-KEM-768'
const FILES = {
  keyGen: 'ML-KEM-keyGen-FIPS203.json',
  encapDecap: 'ML-KEM-encapDecap-FIPS203.json',
}
/* How many tests to take from each group. Decapsulation is taken WHOLE because
 * five of its ten cases are the modified-ciphertext cases, which are this lab's
 * third panel: NIST's own published answer for a corrupted ciphertext is a
 * specific different key, not an error. Taking a prefix there would have been a
 * selection that quietly dropped the evidence for the lab's central claim. */
const TAKE = { keyGen: 3, encapsulation: 3, decapsulation: Infinity }

const read = (name) => {
  const bytes = readFileSync(join(src, name))
  return { json: JSON.parse(bytes.toString('utf8')), sha256: createHash('sha256').update(bytes).digest('hex') }
}

const keyGen = read(FILES.keyGen)
const encapDecap = read(FILES.encapDecap)

const group = (file, fn) =>
  file.json.testGroups.find((g) => g.parameterSet === PARAM_SET && (fn === undefined || g.function === fn))

const take = (tests, n) => (n === Infinity ? tests.slice() : tests.slice(0, n))

const kgGroup = group(keyGen, undefined)
const encGroup = group(encapDecap, 'encapsulation')
const decGroup = group(encapDecap, 'decapsulation')

const subset = {
  note:
    'A verbatim subset of NIST ACVP ML-KEM vectors, ML-KEM-768 only. Every test object is ' +
    'copied unchanged from the upstream internalProjection.json files. See PROVENANCE.md ' +
    'for the upstream commit, the SHA-256 of each source file, and how to re-derive this.',
  parameterSet: PARAM_SET,
  upstream: {
    repository: 'https://github.com/usnistgov/ACVP-Server',
    commit: '975de31eb83d87039ec88934fdc47d8c312b892d',
    files: {
      [FILES.keyGen]: { sha256: keyGen.sha256, vsId: keyGen.json.vsId, revision: keyGen.json.revision },
      [FILES.encapDecap]: {
        sha256: encapDecap.sha256,
        vsId: encapDecap.json.vsId,
        revision: encapDecap.json.revision,
      },
    },
  },
  groups: {
    keyGen: { source: FILES.keyGen, tgId: kgGroup.tgId, tests: take(kgGroup.tests, TAKE.keyGen) },
    encapsulation: {
      source: FILES.encapDecap,
      tgId: encGroup.tgId,
      tests: take(encGroup.tests, TAKE.encapsulation),
    },
    decapsulation: {
      source: FILES.encapDecap,
      tgId: decGroup.tgId,
      tests: take(decGroup.tests, TAKE.decapsulation),
    },
  },
}

const out = join(import.meta.dirname, '..', 'test', 'fixtures', 'mlkem768-acvp-subset.json')
writeFileSync(out, `${JSON.stringify(subset, null, 1)}\n`)
const counts = Object.entries(subset.groups).map(([k, v]) => `${k}=${v.tests.length}`)
console.log(`wrote ${out}\n  ${counts.join(' ')}`)
console.log(`  ${FILES.keyGen} sha256 ${keyGen.sha256}`)
console.log(`  ${FILES.encapDecap} sha256 ${encapDecap.sha256}`)
