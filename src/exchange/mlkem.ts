import { ml_kem768 } from '@noble/post-quantum/ml-kem.js'

import { equalBytes, hexPrefix } from './bytes.js'
import type { AgreedSecret } from './types.js'

/**
 * Panels 2, 3 and 4 — the same job, on a different hard problem.
 *
 * Real ML-KEM-768 (FIPS 203) from `@noble/post-quantum`. The shape differs from a
 * Diffie-Hellman exchange and the page says so in plain words: one side publishes
 * a public key, the other side *encapsulates* — produces a ciphertext and a shared
 * secret together — and the first side *decapsulates* the ciphertext back to the
 * same secret.
 *
 * WHAT IS DELIBERATELY ABSENT FROM THIS FILE
 *
 * No lattice. No LWE. No polynomial, ring or NTT. Not because they are not what
 * ML-KEM is made of, but because this lab is the fleet's beginner on-ramp and its
 * brief forbids them on the page; a reader who wants the picture underneath is
 * sent to Lattice Gentle. The maths is hidden, not faked: every byte below comes
 * from the real FIPS 203 implementation, checked against NIST's published ACVP
 * vectors in `vectors.test.ts`.
 */
export const PQ_SCHEME = 'ML-KEM-768'

export interface PqExchange {
  /** Rae publishes this and keeps the matching secret key. */
  readonly raePublicKey: Uint8Array
  readonly raeSecretKey: Uint8Array
  /** What Dev puts on the wire after encapsulating to Rae's public key. */
  readonly cipherText: Uint8Array
  /** Dev gets the secret out of encapsulation; Rae gets it out of decapsulation. */
  readonly devSharedSecret: Uint8Array
  readonly raeSharedSecret: Uint8Array
}

/** Run a real ML-KEM-768 encapsulation and decapsulation between two parties. */
export function runPqExchange(): PqExchange {
  const { publicKey, secretKey } = ml_kem768.keygen()
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(publicKey)
  return {
    raePublicKey: publicKey,
    raeSecretKey: secretKey,
    cipherText,
    devSharedSecret: sharedSecret,
    raeSharedSecret: ml_kem768.decapsulate(cipherText, secretKey),
  }
}

/** The view panel 2 renders — the same shape panel 1 returns. */
export function viewPq(exchange: PqExchange): AgreedSecret {
  return {
    scheme: PQ_SCHEME,
    left: { name: 'Rae', secretPrefix: hexPrefix(exchange.raeSharedSecret) },
    right: { name: 'Dev', secretPrefix: hexPrefix(exchange.devSharedSecret) },
    wire: [
      { label: "Rae's public key", bytes: exchange.raePublicKey.length, from: 'Rae' },
      { label: "Dev's sealed box", bytes: exchange.cipherText.length, from: 'Dev' },
    ],
    secretsMatch: equalBytes(exchange.raeSharedSecret, exchange.devSharedSecret),
    secretBytes: exchange.raeSharedSecret.length,
  }
}

/* ── Panel 3: break one byte ───────────────────────────────────────────────── */

export interface CorruptedDecapsulation {
  /** Which byte of the ciphertext was changed, and how. */
  readonly byteIndex: number
  readonly bitMask: number
  /** What Dev holds — unchanged; Dev's secret came out of encapsulation. */
  readonly devSharedSecret: Uint8Array
  /** What Rae gets from the corrupted ciphertext. */
  readonly raeSharedSecret: Uint8Array
  /** Measured, not assumed: did decapsulation throw? */
  readonly threw: boolean
  /** Measured over all bytes. */
  readonly secretsMatch: boolean
  /** The honest headline: nothing failed, and the secrets differ. */
  readonly sameLength: boolean
}

/**
 * Flip one bit of the ciphertext and decapsulate it anyway.
 *
 * THIS IS THE LAB'S THIRD LESSON AND IT IS AN HONEST ONE. ML-KEM's decapsulation
 * does not fail loudly on a corrupted ciphertext. FIPS 203 §7.3 builds in the
 * Fujisaki-Okamoto transform's implicit rejection: a ciphertext that does not
 * re-encrypt to itself yields a secret derived from a per-key rejection value, so
 * the caller gets 32 perfectly well-formed bytes that simply are not the other
 * side's 32 bytes. No exception. No error code. The two sides walk away with
 * different secrets and nothing told either of them.
 *
 * The page must therefore read this as A DIFFERENCE, NOT AN ERROR — the brief says
 * so, and the fleet's KEM Trap lab is the depth treatment of exactly this trap.
 *
 * `threw` is recorded rather than assumed. If a future version of the library
 * started throwing, the page's claim would become false, and this field is what
 * the test suite asserts against so the claim fails loudly instead of quietly.
 */
export function corruptOneByte(
  exchange: PqExchange,
  byteIndex = 0,
  bitMask = 0x01,
): CorruptedDecapsulation {
  if (!Number.isInteger(byteIndex) || byteIndex < 0 || byteIndex >= exchange.cipherText.length) {
    throw new Error(`byteIndex ${byteIndex} is outside the ${exchange.cipherText.length}-byte ciphertext`)
  }
  const corrupted = exchange.cipherText.slice()
  corrupted[byteIndex] ^= bitMask

  let raeSharedSecret = new Uint8Array(0)
  let threw = false
  try {
    raeSharedSecret = ml_kem768.decapsulate(corrupted, exchange.raeSecretKey)
  } catch {
    threw = true
  }

  return {
    byteIndex,
    bitMask,
    devSharedSecret: exchange.devSharedSecret,
    raeSharedSecret,
    threw,
    secretsMatch: !threw && equalBytes(raeSharedSecret, exchange.devSharedSecret),
    sameLength: !threw && raeSharedSecret.length === exchange.devSharedSecret.length,
  }
}

/* ── Panel 4: who sent that key? (the negative claim's evidence fixture) ───── */

export interface ImpostorExchange {
  /** The key Dev actually encapsulated to, and who really owns it. */
  readonly keyOwner: 'Rae' | 'Mal'
  /** Dev's secret, from encapsulation. */
  readonly devSharedSecret: Uint8Array
  /** The secret held by whoever owns the key Dev used. */
  readonly ownerSharedSecret: Uint8Array
  /** Measured: Dev and the key's owner agree. */
  readonly secretsMatch: boolean
  /** Measured: Rae, the person Dev believes they are talking to, does not. */
  readonly raeHoldsTheSecret: boolean
  /** Bytes on the wire, so panel 4 can show it is the same exchange as panel 2. */
  readonly cipherTextBytes: number
  readonly publicKeyBytes: number
}

/**
 * Run the SAME real ML-KEM-768 exchange, with the public key supplied by someone
 * other than the person Dev thinks they are talking to.
 *
 * THIS IS THE §4.1d EVIDENCE FIXTURE, and it is the reachable state in which every
 * check this page performs reports success while the named property is violated
 * anyway. Dev encapsulates to a public key labelled "Rae". The key is Mal's. Dev
 * and Mal end up holding the same 32 bytes; the exchange is flawless; the sizes
 * are right; the round trip verifies. Rae was never involved.
 *
 * ML-KEM has no failure code to raise here, and inventing one to look thorough
 * would teach the opposite of the lesson: the ABSENCE of a code is the exhibit.
 * Authentication is a separate problem solved by a separate primitive — a
 * signature over the key, or a transcript binding — and a reader who leaves this
 * lab thinking "post-quantum" means "safe" has been taught wrongly.
 */
export function runImpostorExchange(impostor = true): ImpostorExchange {
  const rae = ml_kem768.keygen()
  const mal = ml_kem768.keygen()
  const owner = impostor ? mal : rae

  // Dev encapsulates to the key they were handed. Nothing here inspects whose it
  // is, which is precisely the point being made.
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(owner.publicKey)

  const ownerSharedSecret = ml_kem768.decapsulate(cipherText, owner.secretKey)
  // What Rae gets if Rae tries: with Mal's ciphertext against Rae's key this is
  // implicit rejection again, so it is a real 32 bytes that simply do not match.
  const raeAttempt = ml_kem768.decapsulate(cipherText, rae.secretKey)

  return {
    keyOwner: impostor ? 'Mal' : 'Rae',
    devSharedSecret: sharedSecret,
    ownerSharedSecret,
    secretsMatch: equalBytes(sharedSecret, ownerSharedSecret),
    raeHoldsTheSecret: equalBytes(sharedSecret, raeAttempt),
    cipherTextBytes: cipherText.length,
    publicKeyBytes: owner.publicKey.length,
  }
}
