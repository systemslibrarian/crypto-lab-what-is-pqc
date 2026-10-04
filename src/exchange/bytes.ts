/**
 * Byte helpers. Nothing cryptographic lives here.
 *
 * The page shows very few raw bytes on purpose — this is the fleet's beginner
 * on-ramp to post-quantum cryptography, and `§4.1`'s teaching rule is that plain
 * language arrives before any hex. What hex does appear is a short prefix of a
 * shared secret, shown only so a reader can compare two of them by eye.
 */

/** Lowercase hex, no separators. */
export function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

/** Parse lowercase or uppercase hex. Throws on anything that is not hex. */
export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error(`hex string has odd length: ${hex.length}`)
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) throw new Error(`not hex at offset ${i * 2}`)
    out[i] = byte
  }
  return out
}

/**
 * Constant-time-ish equality.
 *
 * The timing property is NOT the point here and is not claimed on the page: both
 * secrets being compared are already in this browser tab, so there is no remote
 * attacker to leak to. It is written this way because a teaching lab that shows
 * a secret comparison should not show the early-return shape, which is the bug
 * that a dozen other labs in this fleet exist to demonstrate.
 */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/**
 * The first `n` bytes as hex, for showing a secret to a reader without printing
 * all 32 of them. A prefix is enough to compare two secrets BY EYE, which is
 * what the page asks a beginner to do; the full-length comparison is done by
 * `equalBytes` over every byte and is what the verdict is computed from.
 */
export function hexPrefix(bytes: Uint8Array, n = 8): string {
  return toHex(bytes.subarray(0, n))
}
