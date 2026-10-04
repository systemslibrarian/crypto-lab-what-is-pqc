import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { x25519 } from '@noble/curves/ed25519.js'
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js'
import { describe, expect, it } from 'vitest'

import { fromHex, toHex } from './bytes.js'

/**
 * Known-answer tests, with their provenance stated rather than implied.
 *
 * `test/fixtures/PROVENANCE.md` is the long form; the short form is that the two
 * primitives in this lab have DIFFERENT KINDS of evidence behind them and the
 * difference is worth a reader's attention:
 *
 *   X25519      the RFC prints the answers. These are RFC 7748's own bytes.
 *   ML-KEM-768  FIPS 203 prints NO answers. These are NIST's published ACVP
 *               vectors for the FIPS 203 algorithms, which is a different
 *               document from the standard itself.
 *
 * A lab that said "FIPS 203 KATs" and meant "values this library produced when I
 * ran it" would be making the stronger-sounding claim while holding the weaker
 * evidence. Neither of these does.
 */

/* ── ML-KEM-768: NIST ACVP ───────────────────────────────────────────────────
 *
 * Read from disk rather than imported, so the 148 KB of vectors never enters the
 * browser bundle. A beginner lab that shipped a quarter-megabyte of test vectors
 * to every visitor would be paying for its own honesty with their bandwidth.
 */
interface AcvpTest {
  tcId: number
  d?: string
  z?: string
  ek?: string
  dk?: string
  c?: string
  k?: string
  m?: string
  reason?: string
}
interface AcvpSubset {
  parameterSet: string
  upstream: { repository: string; commit: string; files: Record<string, { sha256: string }> }
  groups: Record<string, { source: string; tgId: number; tests: AcvpTest[] }>
}

const subset = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'mlkem768-acvp-subset.json'), 'utf8'),
) as AcvpSubset

describe('the pinned ACVP subset is the one PROVENANCE.md describes', () => {
  // These counts are asserted so the fixture cannot silently shrink. A vector set
  // that quietly loses its modified-ciphertext cases would leave this lab's third
  // panel claiming something nothing checks any more.
  it('is ML-KEM-768, from the pinned upstream commit', () => {
    expect(subset.parameterSet).toBe('ML-KEM-768')
    expect(subset.upstream.repository).toBe('https://github.com/usnistgov/ACVP-Server')
    expect(subset.upstream.commit).toBe('975de31eb83d87039ec88934fdc47d8c312b892d')
  })

  it('holds 3 keyGen, 3 encapsulation and all 10 decapsulation tests', () => {
    expect(subset.groups.keyGen.tests).toHaveLength(3)
    expect(subset.groups.encapsulation.tests).toHaveLength(3)
    expect(subset.groups.decapsulation.tests).toHaveLength(10)
  })

  it('still carries the modified-ciphertext cases, which panel 3 depends on', () => {
    const modified = subset.groups.decapsulation.tests.filter((t) => t.reason === 'modified ciphertext')
    expect(modified).toHaveLength(5)
  })
})

describe('ML-KEM-768 against NIST ACVP vectors', () => {
  it.each(subset.groups.keyGen.tests.map((t) => [t.tcId, t] as const))(
    'keyGen tcId %i derives the published encapsulation and decapsulation keys',
    (_tcId, test) => {
      // FIPS 203 Algorithm 16: KeyGen is randomized, and its deterministic hook
      // takes d || z. @noble/post-quantum spells that one 64-byte seed.
      const seed = new Uint8Array(64)
      seed.set(fromHex(test.d as string), 0)
      seed.set(fromHex(test.z as string), 32)
      const keys = ml_kem768.keygen(seed)
      expect(toHex(keys.publicKey)).toBe((test.ek as string).toLowerCase())
      expect(toHex(keys.secretKey)).toBe((test.dk as string).toLowerCase())
    },
  )

  it.each(subset.groups.encapsulation.tests.map((t) => [t.tcId, t] as const))(
    'encapsulation tcId %i produces the published ciphertext and shared secret',
    (_tcId, test) => {
      // FIPS 203 Algorithm 17: the 32-byte message m fixes all the randomness.
      const out = ml_kem768.encapsulate(fromHex(test.ek as string), fromHex(test.m as string))
      expect(toHex(out.cipherText)).toBe((test.c as string).toLowerCase())
      expect(toHex(out.sharedSecret)).toBe((test.k as string).toLowerCase())
    },
  )

  it.each(subset.groups.decapsulation.tests.map((t) => [t.tcId, t.reason, t] as const))(
    'decapsulation tcId %i (%s) returns the published shared secret',
    (_tcId, _reason, test) => {
      const k = ml_kem768.decapsulate(fromHex(test.c as string), fromHex(test.dk as string))
      expect(toHex(k)).toBe((test.k as string).toLowerCase())
    },
  )

  it('NIST publishes a shared secret, not an error, for a modified ciphertext', () => {
    // This is the lab's third panel, asserted against the published set rather
    // than against this lab's own behaviour. Five of NIST's ten ML-KEM-768
    // decapsulation cases are modified ciphertexts; every one of them has an
    // expected 32-byte k. If implicit rejection were an error condition, those
    // cases would carry no expected answer at all.
    for (const test of subset.groups.decapsulation.tests) {
      if (test.reason !== 'modified ciphertext') continue
      expect(test.k, `tcId ${test.tcId} must publish an expected shared secret`).toMatch(/^[0-9a-fA-F]{64}$/)
      expect(() => ml_kem768.decapsulate(fromHex(test.c as string), fromHex(test.dk as string))).not.toThrow()
    }
  })
})

/* ── X25519: RFC 7748 ─────────────────────────────────────────────────────── */

/** RFC 7748 §5.2, "Test Vectors" for the X25519 function. */
const RFC7748_SCALARMULT = [
  {
    scalar: 'a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4',
    u: 'e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c',
    out: 'c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552',
  },
  {
    scalar: '4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba0d',
    u: 'e5210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493',
    out: '95cbde9476e8907d7aade45cb4b873f88b595a68799fa152e6f8f7647aac7957',
  },
]

/** RFC 7748 §6.1, the worked Alice-and-Bob exchange. */
const RFC7748_EXCHANGE = {
  alicePrivate: '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a',
  alicePublic: '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a',
  bobPrivate: '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb',
  bobPublic: 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f',
  shared: '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742',
}

describe('X25519 against RFC 7748', () => {
  it.each(RFC7748_SCALARMULT.map((v, i) => [i + 1, v] as const))(
    '§5.2 vector %i reproduces the published u-coordinate',
    (_n, vector) => {
      expect(toHex(x25519.scalarMult(fromHex(vector.scalar), fromHex(vector.u)))).toBe(vector.out)
    },
  )

  it('§6.1 derives both published public keys', () => {
    expect(toHex(x25519.getPublicKey(fromHex(RFC7748_EXCHANGE.alicePrivate)))).toBe(
      RFC7748_EXCHANGE.alicePublic,
    )
    expect(toHex(x25519.getPublicKey(fromHex(RFC7748_EXCHANGE.bobPrivate)))).toBe(
      RFC7748_EXCHANGE.bobPublic,
    )
  })

  it('§6.1 reaches the published shared secret from both directions', () => {
    // Both directions, because "both sides end up holding the same bytes" is the
    // claim panel 1 makes, and checking one direction would check half of it.
    const fromAlice = x25519.getSharedSecret(
      fromHex(RFC7748_EXCHANGE.alicePrivate),
      fromHex(RFC7748_EXCHANGE.bobPublic),
    )
    const fromBob = x25519.getSharedSecret(
      fromHex(RFC7748_EXCHANGE.bobPrivate),
      fromHex(RFC7748_EXCHANGE.alicePublic),
    )
    expect(toHex(fromAlice)).toBe(RFC7748_EXCHANGE.shared)
    expect(toHex(fromBob)).toBe(RFC7748_EXCHANGE.shared)
  })
})
