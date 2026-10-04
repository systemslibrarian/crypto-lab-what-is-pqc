/**
 * The one shape both halves of the lab report.
 *
 * Panels 1 and 2 are deliberately symmetrical — same layout, same labels, same
 * colours — because the argument this lab exists to make is that ML-KEM is doing
 * the SAME JOB as X25519 on a different hard problem, not a stronger version of
 * it. A shared return type is how that symmetry is enforced in code rather than
 * remembered in CSS: a panel renderer cannot show one side something it has no
 * field for.
 */
export interface AgreedSecret {
  /** What the exchange is called, as a reader should see it. */
  readonly scheme: string
  /** The two parties, in the order the page lays them out. */
  readonly left: PartyView
  readonly right: PartyView
  /** Every byte that crossed the wire, with the size a reader can check. */
  readonly wire: readonly WireItem[]
  /** Measured over all 32 bytes, never over the prefix the page prints. */
  readonly secretsMatch: boolean
  /** Length of the agreed secret, in bytes, measured from the real value. */
  readonly secretBytes: number
}

export interface PartyView {
  readonly name: string
  /** What this party ends up holding, as hex — a prefix, for reading by eye. */
  readonly secretPrefix: string
}

export interface WireItem {
  /** Plain-language name: "Rae's public key", not "ek". */
  readonly label: string
  /** Measured from the real byte array. Never typed in. */
  readonly bytes: number
  /** Who put it on the wire. */
  readonly from: string
}
