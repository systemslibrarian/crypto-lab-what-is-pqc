import { describe, expect, it } from 'vitest'

import { equalBytes } from './bytes.js'
import { corruptOneByte, PQ_SCHEME, runImpostorExchange, runPqExchange, viewPq } from './mlkem.js'

describe('the post-quantum exchange panel 2 shows', () => {
  it('agrees on the same 32 bytes, encapsulation against decapsulation, over many runs', () => {
    for (let i = 0; i < 16; i++) {
      const exchange = runPqExchange()
      expect(equalBytes(exchange.raeSharedSecret, exchange.devSharedSecret)).toBe(true)
      expect(exchange.raeSharedSecret).toHaveLength(32)
    }
  })

  it('is FIPS 203 ML-KEM-768 at its published sizes', () => {
    const exchange = runPqExchange()
    expect(PQ_SCHEME).toBe('ML-KEM-768')
    // FIPS 203 Table 3: 1184 / 2400 / 1088 / 32. Measured, not declared.
    expect(exchange.raePublicKey).toHaveLength(1184)
    expect(exchange.raeSecretKey).toHaveLength(2400)
    expect(exchange.cipherText).toHaveLength(1088)
    expect(exchange.devSharedSecret).toHaveLength(32)
  })

  it('agrees on a secret the SAME SIZE as the classical one', () => {
    // The lab's argument rests on this: what changed is the wire, not the secret.
    expect(viewPq(runPqExchange()).secretBytes).toBe(32)
  })

  it('puts exactly a public key and a ciphertext on the wire', () => {
    const exchange = runPqExchange()
    const view = viewPq(exchange)
    expect(view.wire.map((w) => w.bytes)).toEqual([
      exchange.raePublicKey.length,
      exchange.cipherText.length,
    ])
    expect(view.wire.map((w) => w.from)).toEqual(['Rae', 'Dev'])
  })
})

describe('breaking one byte of the ciphertext (panel 3)', () => {
  it('produces a DIFFERENT shared secret rather than an error', () => {
    // The negative result this lab is built on, asserted as the measured outcome
    // and not as an expectation about the library.
    for (let i = 0; i < 16; i++) {
      const broken = corruptOneByte(runPqExchange())
      expect(broken.threw).toBe(false)
      expect(broken.secretsMatch).toBe(false)
      expect(broken.raeSharedSecret).toHaveLength(32)
      expect(broken.sameLength).toBe(true)
    }
  })

  it('returns a well-formed secret for a flip anywhere in the ciphertext', () => {
    const exchange = runPqExchange()
    for (const index of [0, 1, 537, 1086, exchange.cipherText.length - 1]) {
      const broken = corruptOneByte(exchange, index, 0x80)
      expect(broken.threw).toBe(false)
      expect(broken.secretsMatch).toBe(false)
      expect(broken.byteIndex).toBe(index)
    }
  })

  it('is deterministic for a given exchange and flip', () => {
    // Implicit rejection derives the fallback secret from the key and the
    // ciphertext, so the same flip must give the same wrong answer twice. A
    // random answer would be a different (and worse) failure mode.
    const exchange = runPqExchange()
    const first = corruptOneByte(exchange, 42, 0x04)
    const second = corruptOneByte(exchange, 42, 0x04)
    expect(equalBytes(first.raeSharedSecret, second.raeSharedSecret)).toBe(true)
  })

  it('refuses a byte index outside the ciphertext', () => {
    const exchange = runPqExchange()
    expect(() => corruptOneByte(exchange, exchange.cipherText.length)).toThrow(/outside/)
    expect(() => corruptOneByte(exchange, -1)).toThrow(/outside/)
  })
})

describe('who sent that key (panel 4 — the negative claim)', () => {
  it('a flawless exchange with an impostor matches, and Rae never holds the secret', () => {
    // THE NEGATIVE CLAIM, as a passing test: running ML-KEM establishes nothing
    // about who is on the other end. Every check succeeds; the named property is
    // violated anyway.
    for (let i = 0; i < 8; i++) {
      const run = runImpostorExchange(true)
      expect(run.keyOwner).toBe('Mal')
      expect(run.secretsMatch).toBe(true)
      expect(run.raeHoldsTheSecret).toBe(false)
      expect(run.cipherTextBytes).toBe(1088)
      expect(run.publicKeyBytes).toBe(1184)
    }
  })

  it('with the honest key the same exchange reaches the person it names', () => {
    const run = runImpostorExchange(false)
    expect(run.keyOwner).toBe('Rae')
    expect(run.secretsMatch).toBe(true)
    expect(run.raeHoldsTheSecret).toBe(true)
  })

  it('looks identical to the honest run in every size it reports', () => {
    // The point of the fixture is that nothing measurable distinguishes the two.
    const honest = runImpostorExchange(false)
    const impostor = runImpostorExchange(true)
    expect(impostor.cipherTextBytes).toBe(honest.cipherTextBytes)
    expect(impostor.publicKeyBytes).toBe(honest.publicKeyBytes)
    expect(impostor.secretsMatch).toBe(honest.secretsMatch)
  })
})
