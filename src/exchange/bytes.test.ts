import { describe, expect, it } from 'vitest'

import { equalBytes, fromHex, hexPrefix, toHex } from './bytes.js'

describe('byte helpers', () => {
  it('round-trips hex', () => {
    const bytes = Uint8Array.from([0x00, 0x0f, 0xa5, 0xff])
    expect(toHex(bytes)).toBe('000fa5ff')
    expect(fromHex('000fa5ff')).toEqual(bytes)
  })

  it('rejects a malformed hex string rather than guessing', () => {
    expect(() => fromHex('abc')).toThrow(/odd length/)
    expect(() => fromHex('zz')).toThrow(/not hex/)
  })

  it('compares every byte, including when the difference is in the last one', () => {
    const a = Uint8Array.from([1, 2, 3, 4])
    expect(equalBytes(a, Uint8Array.from([1, 2, 3, 4]))).toBe(true)
    expect(equalBytes(a, Uint8Array.from([1, 2, 3, 5]))).toBe(false)
    expect(equalBytes(a, Uint8Array.from([9, 2, 3, 4]))).toBe(false)
    expect(equalBytes(a, Uint8Array.from([1, 2, 3]))).toBe(false)
  })

  it('shows a prefix for reading by eye, and the default is eight bytes', () => {
    const bytes = Uint8Array.from(Array.from({ length: 32 }, (_, i) => i))
    expect(hexPrefix(bytes)).toBe('0001020304050607')
    expect(hexPrefix(bytes, 4)).toBe('00010203')
  })
})
