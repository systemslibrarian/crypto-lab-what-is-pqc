# Where these vectors come from

Two primitives are checked against known-answer vectors in this lab, and they have
**different provenance**. The difference matters enough to state plainly, because "pinned
from the specification" and "reproduced from a validated implementation" are not the same
evidence, and a reader deserves to know which one is holding a given claim up.

## X25519 — from the specification itself

`src/exchange/x25519.test.ts` pins the vectors printed in **RFC 7748** — the scalar
multiplication vectors in §5.2 and the Alice/Bob exchange in §6.1, which is where the
shared secret `4a5d9d5b…` comes from. Those are the RFC's own bytes, typed in from the
published document. Nothing was reproduced from an implementation: the specification
prints the answer, so the answer is checked against the specification.

## ML-KEM-768 — from NIST's published ACVP vectors, not from FIPS 203

**FIPS 203 contains no known-answer vectors.** It specifies the algorithms; the test
vectors live in NIST's ACVP vector sets, published in a separate repository. So a lab that
says "FIPS 203 KATs" is being loose, and this one tries not to be: the vectors in
`mlkem768-acvp-subset.json` are NIST's **ACVP** vectors for the FIPS 203 algorithms.

| | |
|---|---|
| Upstream | https://github.com/usnistgov/ACVP-Server |
| Commit pin | `975de31eb83d87039ec88934fdc47d8c312b892d` |
| Copied | 2026-10-04 |

| Upstream file | Upstream path | SHA-256 |
|---|---|---|
| `ML-KEM-keyGen-FIPS203.json` | `gen-val/json-files/ML-KEM-keyGen-FIPS203/internalProjection.json` | `d7a62a2c3476957f56dd8d24f9004ea6776ccfe995ffe71a65bb9506dc9c7b1b` |
| `ML-KEM-encapDecap-FIPS203.json` | `gen-val/json-files/ML-KEM-encapDecap-FIPS203/internalProjection.json` | `a556952ce869bb89c3a3196a701dad89647c193a34c86eafb61a9d710d5b810f` |

`internalProjection.json` carries each test's inputs and its expected outputs in one
object, which `prompt.json` plus `expectedResults.json` only do when joined.

### It is a subset, and that is a transformation

The two upstream files are 2.0 MB and hold 240 tests across ML-KEM-512, -768 and -1024.
This lab runs **ML-KEM-768 only**, so `mlkem768-acvp-subset.json` holds 16 of them:

| Group | Upstream `tgId` | Tests here | Of upstream |
|---|---|---:|---:|
| `keyGen` (ML-KEM-768) | 1 | 3 | 25 |
| `encapsulation` (ML-KEM-768) | 2 | 3 | 25 |
| `decapsulation` (ML-KEM-768) | 5 | 10 | 10 — all of them |

Decapsulation is taken whole on purpose. Five of its ten cases carry
`"reason": "modified ciphertext"`, and NIST's published answer for each of those is a
**specific different shared secret, not an error** — which is this lab's third panel. A
prefix of that group would have quietly dropped the published evidence for the lab's
central claim.

Every selected test object is copied **byte-for-byte**, with no field dropped, renamed or
re-encoded, so the bytes `src/exchange/vectors.test.ts` reads are the bytes NIST published.
`scripts/extract-acvp-subset.mjs` is the committed derivation, and the counts above are
asserted in that test, so the subset cannot silently shrink.

### Re-deriving it

```sh
PIN=975de31eb83d87039ec88934fdc47d8c312b892d
mkdir -p /tmp/acvp
for d in ML-KEM-keyGen-FIPS203 ML-KEM-encapDecap-FIPS203; do
  curl -sfo "/tmp/acvp/$d.json" \
    "https://raw.githubusercontent.com/usnistgov/ACVP-Server/$PIN/gen-val/json-files/$d/internalProjection.json"
done
shasum -a 256 /tmp/acvp/*.json          # must match the table above
node scripts/extract-acvp-subset.mjs /tmp/acvp
git diff --stat test/fixtures/          # must be empty
```

## What the vectors do and do not establish

They establish that this lab's ML-KEM-768 and X25519 are the real algorithms rather than
something shaped like them. They establish nothing about the lab's *page* — that is what
`e2e/claims.spec.ts` is for — and nothing about side-channel behaviour, which this lab
neither claims nor measures.

The two ACVP groups this lab does **not** run are `encapsulationKeyCheck` and
`decapsulationKeyCheck`, the malformed-key rejection cases. They are a property of the
caller's input validation rather than of the exchange the lab shows, and leaving them out
is recorded here rather than left for a reader to notice.
