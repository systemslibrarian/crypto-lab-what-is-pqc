import { x25519 } from '@noble/curves/ed25519.js'

import { equalBytes, hexPrefix } from './bytes.js'
import type { AgreedSecret } from './types.js'

/**
 * Panel 1 — two people agree on a secret, in the open.
 *
 * Real X25519 (RFC 7748) from `@noble/curves`. Each side generates a private
 * value, publishes a public value, and combines its own private value with the
 * other side's public value. Both arrive at the same 32 bytes. An observer on the
 * wire sees both public values and neither private one.
 *
 * WHAT THIS LAB SAYS ABOUT IT, AND WHAT IT DOES NOT
 *
 * It says: a machine that does not exist yet is expected to be able to take what
 * crossed the wire here and work out the agreed secret anyway. That is a claim
 * about the HARD PROBLEM X25519 rests on, and the page states it as expectation
 * rather than as something shown — nothing in this file, and nothing in this
 * repository, breaks X25519. The reader who wants the mechanism is sent to the
 * fleet's Shor lab, which is where period finding belongs.
 *
 * It does not say X25519 is broken today. It is not.
 */
export const CLASSICAL_SCHEME = 'X25519'

export interface ClassicalExchange {
  readonly rae: { readonly secretKey: Uint8Array; readonly publicKey: Uint8Array }
  readonly dev: { readonly secretKey: Uint8Array; readonly publicKey: Uint8Array }
  readonly raeSharedSecret: Uint8Array
  readonly devSharedSecret: Uint8Array
}

/** Run a real X25519 exchange between two fresh parties. */
export function runClassicalExchange(): ClassicalExchange {
  const raeSecret = x25519.utils.randomSecretKey()
  const devSecret = x25519.utils.randomSecretKey()
  const rae = { secretKey: raeSecret, publicKey: x25519.getPublicKey(raeSecret) }
  const dev = { secretKey: devSecret, publicKey: x25519.getPublicKey(devSecret) }
  return {
    rae,
    dev,
    // Each side combines ITS OWN private value with the OTHER side's public one.
    // Computing both and comparing is the whole exhibit: the page never asserts
    // that they agree, it shows two values and measures them.
    raeSharedSecret: x25519.getSharedSecret(rae.secretKey, dev.publicKey),
    devSharedSecret: x25519.getSharedSecret(dev.secretKey, rae.publicKey),
  }
}

/** The view panel 1 renders, in the shape panel 2 also returns. */
export function viewClassical(exchange: ClassicalExchange): AgreedSecret {
  return {
    scheme: CLASSICAL_SCHEME,
    left: { name: 'Rae', secretPrefix: hexPrefix(exchange.raeSharedSecret) },
    right: { name: 'Dev', secretPrefix: hexPrefix(exchange.devSharedSecret) },
    wire: [
      { label: "Rae's public value", bytes: exchange.rae.publicKey.length, from: 'Rae' },
      { label: "Dev's public value", bytes: exchange.dev.publicKey.length, from: 'Dev' },
    ],
    secretsMatch: equalBytes(exchange.raeSharedSecret, exchange.devSharedSecret),
    secretBytes: exchange.raeSharedSecret.length,
  }
}
