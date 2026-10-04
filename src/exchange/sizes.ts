import type { AgreedSecret } from './types.js'

/**
 * The one number a beginner can check with arithmetic alone.
 *
 * WHY SIZES ARE THE ONLY COMPARISON THIS LAB MAKES
 *
 * Panels 1 and 2 do the same job: two people end up holding the same 32 bytes. The
 * brief's rule is that the lab must never say the post-quantum one is "stronger",
 * because it is not a bigger lock — it rests on a different hard problem. So what
 * IS there to say about the difference? Exactly one thing a reader can verify
 * without being taken on trust: the bytes got bigger, and by how much is division.
 *
 * It is also the real engineering consequence. Handshakes grew, which is why hybrid
 * deployments and downgrade attacks are subjects at all.
 *
 * EVERY NUMBER HERE IS MEASURED. Nothing in this file types a byte count in. 1,184
 * and 1,088 are what the FIPS 203 implementation actually produced in this browser
 * tab; 32 is what X25519 produced. A size the page printed from a constant would
 * be a claim about the specification, and this lab's whole argument depends on the
 * reader being able to trust that the two panels are showing the same exchange.
 */
export interface SizeComparison {
  /** Total bytes that crossed the wire in the classical exchange. */
  readonly classicalWireBytes: number
  /** Total bytes that crossed the wire in the post-quantum exchange. */
  readonly pqWireBytes: number
  /** pqWireBytes / classicalWireBytes, to one decimal place. */
  readonly timesLarger: number
  /** Both exchanges agreed on a secret of this many bytes — the thing that did NOT change. */
  readonly secretBytes: number
  /** True when both sides of both exchanges matched; the comparison means nothing otherwise. */
  readonly bothExchangesAgreed: boolean
  /** True when the two secrets are the same size — the other thing that did not change. */
  readonly secretSizeUnchanged: boolean
}

const wireTotal = (view: AgreedSecret): number =>
  view.wire.reduce((total, item) => total + item.bytes, 0)

export function compareSizes(classical: AgreedSecret, pq: AgreedSecret): SizeComparison {
  const classicalWireBytes = wireTotal(classical)
  const pqWireBytes = wireTotal(pq)
  return {
    classicalWireBytes,
    pqWireBytes,
    // One decimal place, because 35.5 is the truth and 35 is a rounding a reader
    // cannot reproduce from the two numbers printed beside it.
    timesLarger: Math.round((pqWireBytes / classicalWireBytes) * 10) / 10,
    secretBytes: classical.secretBytes,
    bothExchangesAgreed: classical.secretsMatch && pq.secretsMatch,
    secretSizeUnchanged: classical.secretBytes === pq.secretBytes,
  }
}

/** Thousands separators, so 1184 reads as 1,184 for a reader counting zeroes. */
export function formatBytes(n: number): string {
  return n.toLocaleString('en-US')
}
