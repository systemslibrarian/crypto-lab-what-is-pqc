import { describe, expect, it } from 'vitest'

import { compareSizes, formatBytes } from './sizes.js'
import { runPqExchange, viewPq } from './mlkem.js'
import { runClassicalExchange, viewClassical } from './x25519.js'

describe('the size comparison', () => {
  const classical = viewClassical(runClassicalExchange())
  const pq = viewPq(runPqExchange())
  const comparison = compareSizes(classical, pq)

  it('adds up the wire from the measured items', () => {
    expect(comparison.classicalWireBytes).toBe(32 + 32)
    expect(comparison.pqWireBytes).toBe(1184 + 1088)
  })

  it('states the growth as a ratio a reader can reproduce by division', () => {
    expect(comparison.timesLarger).toBe(35.5)
    // Re-derived a second way, from the two totals the page prints beside it.
    expect(comparison.timesLarger).toBe(
      Math.round((comparison.pqWireBytes / comparison.classicalWireBytes) * 10) / 10,
    )
  })

  it('records that the agreed secret did NOT change size', () => {
    expect(comparison.secretBytes).toBe(32)
    expect(comparison.secretSizeUnchanged).toBe(true)
  })

  it('records that both exchanges agreed, without which the comparison means nothing', () => {
    expect(comparison.bothExchangesAgreed).toBe(true)
  })

  it('formats byte counts with separators', () => {
    expect(formatBytes(1184)).toBe('1,184')
    expect(formatBytes(1088)).toBe('1,088')
    expect(formatBytes(32)).toBe('32')
  })
})
