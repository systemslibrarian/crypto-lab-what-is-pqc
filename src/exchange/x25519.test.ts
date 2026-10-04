import { describe, expect, it } from 'vitest'

import { equalBytes } from './bytes.js'
import { CLASSICAL_SCHEME, runClassicalExchange, viewClassical } from './x25519.js'

describe('the classical exchange panel 1 shows', () => {
  it('agrees on the same 32 bytes from both directions, over many runs', () => {
    // Many runs rather than one: a key-agreement bug that fires on a fraction of
    // random inputs is exactly the shape a single-run test misses.
    for (let i = 0; i < 64; i++) {
      const exchange = runClassicalExchange()
      expect(equalBytes(exchange.raeSharedSecret, exchange.devSharedSecret)).toBe(true)
      expect(exchange.raeSharedSecret).toHaveLength(32)
    }
  })

  it('never puts a private value on the wire', () => {
    // The wire inventory is what panel 1 prints. A private value appearing in it
    // would be the page teaching the opposite of what the panel says.
    const exchange = runClassicalExchange()
    const view = viewClassical(exchange)
    const wireLabels = view.wire.map((w) => w.label.toLowerCase())
    expect(wireLabels.every((l) => l.includes('public'))).toBe(true)
    expect(view.wire).toHaveLength(2)
  })

  it('reports wire sizes measured from the real byte arrays', () => {
    const exchange = runClassicalExchange()
    const view = viewClassical(exchange)
    expect(view.wire.map((w) => w.bytes)).toEqual([
      exchange.rae.publicKey.length,
      exchange.dev.publicKey.length,
    ])
    expect(view.wire.map((w) => w.bytes)).toEqual([32, 32])
  })

  it('names the scheme as RFC 7748 calls it', () => {
    expect(CLASSICAL_SCHEME).toBe('X25519')
    expect(viewClassical(runClassicalExchange()).scheme).toBe('X25519')
  })

  it('two independent exchanges do not reach the same secret', () => {
    // A "both sides match" verdict means nothing if every run produces the same
    // bytes — that would be a constant, not an exchange.
    const a = runClassicalExchange()
    const b = runClassicalExchange()
    expect(equalBytes(a.raeSharedSecret, b.raeSharedSecret)).toBe(false)
  })
})
